import store from '../core/state.js';
import audio from '../core/audio.js';

let scene, camera, renderer, earthGroup, starField;
let satObjectsMap = new Map(); // satId -> THREE.Mesh
let orbitLinesMap = new Map(); // satId -> THREE.Line
let conjunctionLine = null; // THREE.Line for active alert vectors
let isOrbitPathVisible = true;
let isDebrisVisible = true;

// Drag control variables for custom Orbit Rotation (prevents CDN OrbitControls dependencies)
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let rotationSpeed = { x: 0.002, y: 0.002 };
let autoRotate = true;

export function initOrbitViewer() {
  const container = document.getElementById('three-container');
  if (!container) return;

  const width = container.clientWidth;
  const height = container.clientHeight;

  // 1. Create Scene
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05050d, 0.015);

  // 2. Create Camera
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(0, 0, 16);

  // 3. Create WebGL Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  // 4. Create Earth Group (holds Earth sphere and grid lines)
  earthGroup = new THREE.Group();
  scene.add(earthGroup);

  // Create stylized Earth: Cyberpunk wireframe globe
  const earthRadius = 5;
  const earthGeo = new THREE.SphereGeometry(earthRadius, 32, 24);
  const earthMat = new THREE.MeshBasicMaterial({
    color: 0x0a1c3a,
    wireframe: true,
    transparent: true,
    opacity: 0.25
  });
  const earthMesh = new THREE.Mesh(earthGeo, earthMat);
  earthGroup.add(earthMesh);

  // Add glowing equator and meridian bands
  const equatorGeo = new THREE.RingGeometry(earthRadius + 0.02, earthRadius + 0.05, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00f0ff,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide
  });
  const equator = new THREE.Mesh(equatorGeo, ringMat);
  equator.rotation.x = Math.PI / 2;
  earthGroup.add(equator);

  // 5. Add Star Field Particle System
  const starGeo = new THREE.BufferGeometry();
  const starCount = 600;
  const starPositions = new Float32Array(starCount * 3);

  for (let i = 0; i < starCount * 3; i += 3) {
    // Generate particles on a shell at radius 40-80
    const u = Math.random();
    const v = Math.random();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    const r = 40 + Math.random() * 40;

    starPositions[i] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i + 1] = r * Math.sin(phi) * Math.sin(theta);
    starPositions[i + 2] = r * Math.cos(phi);
  }

  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0x00f0ff,
    size: 0.3,
    transparent: true,
    opacity: 0.5
  });
  starField = new THREE.Points(starGeo, starMat);
  scene.add(starField);

  // 6. Dynamic Ambient Lighting
  const light = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(light);

  // 7. Mouse Drag Event Handlers for Earth Rotation
  container.addEventListener('mousedown', (e) => {
    isDragging = true;
    autoRotate = false;
    previousMousePosition = { x: e.clientX, y: e.clientY };
    audio.playHover();
  });

  container.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const deltaMove = {
      x: e.clientX - previousMousePosition.x,
      y: e.clientY - previousMousePosition.y
    };

    earthGroup.rotation.y += deltaMove.x * 0.005;
    earthGroup.rotation.x += deltaMove.y * 0.005;

    previousMousePosition = { x: e.clientX, y: e.clientY };
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // Camera Zoom (Mouse Wheel)
  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    camera.position.z += e.deltaY * 0.01;
    if (camera.position.z < 7) camera.position.z = 7;
    if (camera.position.z > 35) camera.position.z = 35;
  });

  // UI Event Handlers
  document.getElementById('btn-camera-reset').addEventListener('click', () => {
    camera.position.set(0, 0, 16);
    earthGroup.rotation.set(0, 0, 0);
    autoRotate = true;
    audio.playClick();
  });

  const btnOrbitToggle = document.getElementById('btn-orbit-path-toggle');
  btnOrbitToggle.addEventListener('click', () => {
    isOrbitPathVisible = !isOrbitPathVisible;
    btnOrbitToggle.classList.toggle('active', isOrbitPathVisible);
    
    orbitLinesMap.forEach((line) => {
      line.visible = isOrbitPathVisible;
    });
    audio.playClick();
  });

  const btnDebrisToggle = document.getElementById('btn-debris-toggle');
  btnDebrisToggle.addEventListener('click', () => {
    isDebrisVisible = !isDebrisVisible;
    btnDebrisToggle.classList.toggle('active', isDebrisVisible);
    
    const debrisSat = satObjectsMap.get('cosmos-debris');
    const debrisLine = orbitLinesMap.get('cosmos-debris');
    if (debrisSat) debrisSat.visible = isDebrisVisible;
    if (debrisLine) debrisLine.visible = isDebrisVisible && isOrbitPathVisible;
    if (conjunctionLine) conjunctionLine.visible = isDebrisVisible;
    
    audio.playClick();
  });

  // 8. Subscribe to Satellites state for detail cards clicking & updates
  store.subscribe('satellites', (sats) => {
    renderSatelliteGeometries(sats);
  });

  // 9. Resize Handling
  window.addEventListener('resize', () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });

  // 10. Start ThreeJS Animation Loop
  animate();
}

function renderSatelliteGeometries(sats) {
  if (!scene) return;

  sats.forEach((s) => {
    // 1. Create orbit paths if not exists
    if (!orbitLinesMap.has(s.id)) {
      const orbitGeo = new THREE.BufferGeometry();
      const points = [];
      
      // Plot standard orbit ellipse ring (120 segments)
      const segments = 120;
      const earthRadius = 6378.1;
      const orbitRadius = earthRadius + s.alt;
      const scale = 5 / earthRadius;
      const r = orbitRadius * scale;

      // Spacing and inclination
      const inclination = (s.id === 'navic-1i' || s.id === 'navic-1g') 
        ? (29 * Math.PI / 180) 
        : (51.6 * Math.PI / 180);
      
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const x = r * Math.cos(theta);
        const y = r * Math.sin(theta);
        
        // Inclined orbital plane projection
        const px = x;
        const py = y * Math.cos(inclination);
        const pz = y * Math.sin(inclination);
        
        points.push(new THREE.Vector3(px, py, pz));
      }

      orbitGeo.setFromPoints(points);
      
      // Styles paths depending on type
      let color = 0x00f0ff;
      let opacity = 0.25;
      if (s.type === 'Space Debris') {
        color = 0xff003c;
        opacity = 0.15;
      } else if (s.type === 'Regional Navigation') {
        color = 0xffb700;
        opacity = 0.2;
      }
      
      const orbitMat = new THREE.LineBasicMaterial({
        color: color,
        transparent: true,
        opacity: opacity
      });

      const line = new THREE.Line(orbitGeo, orbitMat);
      line.visible = isOrbitPathVisible;
      
      // Hide debris elements if toggled off
      if (s.id === 'cosmos-debris' && !isDebrisVisible) {
        line.visible = false;
      }

      earthGroup.add(line);
      orbitLinesMap.set(s.id, line);
    }

    // 2. Create satellite visual meshes if not exists
    if (!satObjectsMap.has(s.id)) {
      let color = 0x00f0ff; // Normal
      let size = 0.15;
      
      if (s.id === 'gaganyaan') {
        size = 0.22; // Make Gaganyaan distinct
        color = 0x00f0ff;
      } else if (s.type === 'Space Debris') {
        color = 0xff003c;
        size = 0.12;
      } else if (s.type === 'Regional Navigation') {
        color = 0xffb700;
        size = 0.16;
      }

      const satGeo = new THREE.SphereGeometry(size, 8, 8);
      const satMat = new THREE.MeshBasicMaterial({
        color: color,
        wireframe: false
      });
      const satMesh = new THREE.Mesh(satGeo, satMat);
      
      // Hide debris mesh if toggled off
      if (s.id === 'cosmos-debris' && !isDebrisVisible) {
        satMesh.visible = false;
      }

      earthGroup.add(satMesh);
      satObjectsMap.set(s.id, satMesh);
    }
  });
}

// Relocates satellite mesh positions in 3D frame based on propagated Keplerian/SGP4 calculations
export function updateSatPositions3D(sats) {
  sats.forEach((s) => {
    const mesh = satObjectsMap.get(s.id);
    if (mesh && s.position3d) {
      mesh.position.set(s.position3d.x, s.position3d.y, s.position3d.z);
    }
  });

  // Calculate distance between Gaganyaan and Debris to draw alert vectors
  const gaganyaan = sats.find(s => s.id === 'gaganyaan');
  const debris = sats.find(s => s.id === 'cosmos-debris');

  if (gaganyaan && debris && gaganyaan.position3d && debris.position3d && isDebrisVisible) {
    const gPos = new THREE.Vector3(gaganyaan.position3d.x, gaganyaan.position3d.y, gaganyaan.position3d.z);
    const dPos = new THREE.Vector3(debris.position3d.x, debris.position3d.y, debris.position3d.z);
    const dist = gPos.distanceTo(dPos); // scaled ThreeJS units

    // Convert back to physical distance: Earth radius ~5 scaled units -> 6378.1 km
    // 1 scaled unit is ~1275 km. Let's compute actual physical proximity in kilometers:
    const physicalDistanceKm = dist * 1275.6;

    // Check collision alert threshold: if within 350km corridor, render warning laser
    if (physicalDistanceKm < 350) {
      if (conjunctionLine) earthGroup.remove(conjunctionLine);
      
      const alertLineGeo = new THREE.BufferGeometry().setFromPoints([gPos, dPos]);
      const alertLineMat = new THREE.LineBasicMaterial({
        color: 0xff003c,
        linewidth: 2,
        transparent: true,
        opacity: 0.8
      });
      conjunctionLine = new THREE.Line(alertLineGeo, alertLineMat);
      earthGroup.add(conjunctionLine);
    } else {
      if (conjunctionLine) {
        earthGroup.remove(conjunctionLine);
        conjunctionLine = null;
      }
    }
  }
}

function animate() {
  requestAnimationFrame(animate);

  // Slow orbital tracking auto-rotation
  if (autoRotate && earthGroup) {
    earthGroup.rotation.y += 0.001;
  }

  // Rotate starfield slowly to simulate galaxy movement
  if (starField) {
    starField.rotation.y -= 0.0003;
  }

  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}
