import store from '../core/state.js';
import { propagateSatellite } from '../core/propagator.js';

let map = null;
let satMarker = null;
let footprintCircle = null;
let trackLines = [];
let stationMarkers = [];

const ISRO_STATIONS = [
  { name: "ISTRAC Bengaluru (Byalalu)", lat: 12.962, lng: 77.370, location: "Karnataka, India", role: "Primary command center & Deep Space Network (IDSN) antennas." },
  { name: "SDSC Sriharikota Tracking Station", lat: 13.725, lng: 80.226, location: "Andhra Pradesh, India", role: "Multi-object launch vehicle tracking radar & telemetry complex." },
  { name: "ISTRAC Port Blair", lat: 11.642, lng: 92.715, location: "Andaman & Nicobar Islands", role: "Downlink operations & rocket path tracking station." },
  { name: "Biak Downlink Station", lat: -1.180, lng: 136.062, location: "Papua, Indonesia", role: "LEO telemetry downlink and launcher path tracking hub." },
  { name: "Brunei Tracking Station", lat: 4.882, lng: 114.931, location: "Tungku, Brunei", role: "Rocket trajectory validation & cooperative data downlink." },
  { name: "Mauritius Ground Station", lat: -20.231, lng: 57.502, location: "Medine, Mauritius", role: "S-band and C-band telemetry command & downlink complex." }
];

export function initGroundTrackMap() {
  const container = document.getElementById('leaflet-container');
  if (!container) return;

  // 1. Initialize map centered over Bengaluru operations base
  map = L.map('leaflet-container', { 
    zoomControl: false, 
    attributionControl: false 
  }).setView([12.97, 77.59], 2);

  // 2. Add CartoDB Dark Matter tile layers (Dark theme matching space layout)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 18,
    minZoom: 1.5
  }).addTo(map);

  // Add scale indicator to bottom right
  L.control.scale({ position: 'bottomright', imperial: false }).addTo(map);

  // 3. Plot ISRO Tracking ground stations with custom DivIcon markers
  const stationIcon = L.divIcon({
    className: 'custom-station-icon',
    html: '<span class="station-marker-pulse"></span>',
    iconSize: [10, 10],
    iconAnchor: [5, 5]
  });

  ISRO_STATIONS.forEach((st) => {
    const marker = L.marker([st.lat, st.lng], { icon: stationIcon }).addTo(map);
    
    // Bind cybersecurity styled popup
    marker.bindPopup(`
      <div class="leaflet-popup-title">${st.name}</div>
      <div style="margin-top: 4px;"><b>Location:</b> ${st.location}</div>
      <div><b>Description:</b> ${st.role}</div>
      <div style="margin-top: 6px; padding-top: 4px; border-top: 1px dashed rgba(255,255,255,0.1);">
        <b>Uplink Status:</b> <span style="color: hsl(var(--color-green)); text-shadow: 0 0 4px rgba(74,222,128,0.5)">ACTIVE STREAM</span>
      </div>
      <div><b>System Uptime:</b> 99.98% (Secure Node)</div>
    `);

    stationMarkers.push(marker);
  });

  // 4. Initialize Sub-Satellite and Horizon Footprint layers
  const satIcon = L.divIcon({
    className: 'custom-sat-icon',
    html: '<span class="sat-marker-pulse" id="leaflet-sat-pulse"></span>',
    iconSize: [12, 12],
    iconAnchor: [6, 6]
  });

  satMarker = L.marker([0, 0], { icon: satIcon }).addTo(map);
  satMarker.bindPopup('<div id="leaflet-sat-popup">Initializing TLE...</div>');

  footprintCircle = L.circle([0, 0], {
    radius: 0,
    color: 'hsl(var(--color-cyan))',
    weight: 1,
    fillColor: 'hsl(var(--color-cyan))',
    fillOpacity: 0.08,
    dashArray: '3, 4'
  }).addTo(map);

  // 5. Subscribe to store changes to recalculate ground tracks on ticks
  store.subscribe('satellites', (sats) => {
    updateGroundTrackMap(sats);
  });

  store.subscribe('activeSatelliteId', () => {
    updateGroundTrackMap(store.getState().satellites);
  });
}

export function invalidateMapSize() {
  if (map) {
    // Invalidate size immediately and with a small delay for DOM layout settling
    map.invalidateSize();
    setTimeout(() => {
      map.invalidateSize();
    }, 100);
  }
}

function updateGroundTrackMap(sats) {
  if (!map || !sats || sats.length === 0) return;

  const { activeSatelliteId, activeCategory, searchQuery } = store.getState();
  const activeSat = sats.find(s => s.id === activeSatelliteId);

  // Remove existing path lines
  trackLines.forEach(line => map.removeLayer(line));
  trackLines = [];

  if (!activeSat) {
    if (map.hasLayer(satMarker)) map.removeLayer(satMarker);
    if (map.hasLayer(footprintCircle)) map.removeLayer(footprintCircle);
    return;
  }

  // 1. Check if the active satellite passes the category & query filters
  let passesFilter = true;
  if (activeCategory !== 'all' && activeSat.category !== activeCategory) {
    passesFilter = false;
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    const nameMatch = activeSat.name && activeSat.name.toLowerCase().includes(q);
    const idMatch = activeSat.id && activeSat.id.toLowerCase().includes(q);
    const noradMatch = activeSat.tle2 && activeSat.tle2.substring(2, 7).includes(q);
    if (!nameMatch && !idMatch && !noradMatch) passesFilter = false;
  }

  if (!passesFilter) {
    if (map.hasLayer(satMarker)) map.removeLayer(satMarker);
    if (map.hasLayer(footprintCircle)) map.removeLayer(footprintCircle);
    return;
  }

  // Make sure layers are on map
  if (!map.hasLayer(satMarker)) satMarker.addTo(map);
  if (!map.hasLayer(footprintCircle)) footprintCircle.addTo(map);

  // 2. Position sub-satellite marker (ensuring coordinates wrapping within [-90, 90] and [-180, 180])
  const lat = Math.max(-90, Math.min(90, activeSat.lat || 0));
  let lng = activeSat.lng || 0;
  // Wrap longitude
  while (lng > 180) lng -= 360;
  while (lng < -180) lng += 360;

  satMarker.setLatLng([lat, lng]);

  // Update sat marker styling classes dynamically using DOM elements
  const pulseEl = document.getElementById('leaflet-sat-pulse');
  if (pulseEl) {
    pulseEl.className = 'sat-marker-pulse';
    if (activeSat.threatLevel === 'WARNING') {
      pulseEl.classList.add('warning');
    } else if (activeSat.threatLevel === 'DANGER') {
      pulseEl.classList.add('danger');
    }
  }

  // Update popup coordinates
  const altText = typeof activeSat.alt === 'number' ? `${activeSat.alt.toFixed(1)} km` : '---';
  const velText = typeof activeSat.velocity === 'number' ? `${activeSat.velocity.toFixed(2)} km/s` : '---';
  const popupContent = `
    <div class="leaflet-popup-title">${activeSat.name}</div>
    <div style="display:flex; flex-direction:column; gap:2px;">
      <div><b>Owner:</b> ${activeSat.owner}</div>
      <div><b>Altitude:</b> ${altText}</div>
      <div><b>Velocity:</b> ${velText}</div>
      <div><b>Geodetic:</b> ${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E</div>
      <div style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed rgba(255,255,255,0.1);">
        <b>Conjunction risk:</b> <span class="sat-details-val ${activeSat.threatLevel === 'NORMAL' ? 'normal' : 'danger'}">${activeSat.threatLevel}</span>
      </div>
    </div>
  `;
  satMarker.setPopupContent(popupContent);

  // 3. Recalculate geodesic RF coverage footprint circle
  // Radius calculation: theta = acos(R_earth / (R_earth + alt))
  const earthRadius = 6378.137;
  const h = typeof activeSat.alt === 'number' ? Math.max(0, activeSat.alt) : 0;
  const theta = Math.acos(earthRadius / (earthRadius + h));
  const footprintRadiusMeters = earthRadius * 1000 * theta;

  footprintCircle.setLatLng([lat, lng]);
  footprintCircle.setRadius(footprintRadiusMeters);

  // Style circle color based on threat level
  let circleColor = 'hsl(var(--color-cyan))';
  if (activeSat.threatLevel === 'WARNING') circleColor = 'hsl(var(--color-amber))';
  else if (activeSat.threatLevel === 'DANGER') circleColor = 'hsl(var(--color-red))';
  
  footprintCircle.setStyle({
    color: circleColor,
    fillColor: circleColor
  });

  // 4. Propagate and render 1-orbit ground track polyline path
  // Calculate period from TLE mean motion
  let periodSeconds = 5400; // default 90 mins for LEO
  if (activeSat.tle2) {
    const motionStr = activeSat.tle2.substring(52, 63).trim();
    const motion = parseFloat(motionStr);
    if (!isNaN(motion) && motion > 0) {
      periodSeconds = 86400 / motion;
    }
  } else if (activeSat.alt > 1000) {
    periodSeconds = 86400; // NavIC geostationary
  }

  // Collect points along the orbit trail centered on current simulation epoch
  const points = [];
  const segmentsCount = 120;
  const timeStepMs = (periodSeconds / segmentsCount) * 1000;
  const baseSimTime = store.getState().simTime.getTime();
  const startTime = new Date(baseSimTime - (periodSeconds / 2) * 1000);
  const activeIdx = sats.indexOf(activeSat);

  for (let i = 0; i <= segmentsCount; i++) {
    const checkTime = new Date(startTime.getTime() + i * timeStepMs);
    const offset = activeSat.burnAdjustments ? activeSat.burnAdjustments.alt : 0;
    const res = propagateSatellite(activeSat.tle1, activeSat.tle2, checkTime, offset, activeIdx);
    
    let pLng = res.lng;
    while (pLng > 180) pLng -= 360;
    while (pLng < -180) pLng += 360;

    points.push({ lat: res.lat, lng: pLng });
  }

  // Split polyline coordinate arrays whenever longitude jumps by > 180° to avoid date-line wrapping streaks
  const splitSegments = [];
  let currentSegment = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (currentSegment.length > 0) {
      const last = currentSegment[currentSegment.length - 1];
      const diffLng = Math.abs(p.lng - last[1]);
      if (diffLng > 180) {
        splitSegments.push(currentSegment);
        currentSegment = [];
      }
    }
    currentSegment.push([p.lat, p.lng]);
  }
  if (currentSegment.length > 0) {
    splitSegments.push(currentSegment);
  }

  // Set line color base on satellite category
  let trackColor = 'hsl(var(--color-cyan))';
  if (activeSat.category === 'debris') trackColor = 'hsl(var(--color-red))';
  else if (activeSat.category === 'starlink') trackColor = 'hsl(var(--color-purple))';
  else if (activeSat.category === 'indian') trackColor = 'hsl(var(--color-amber))';

  splitSegments.forEach(seg => {
    const polyline = L.polyline(seg, {
      color: trackColor,
      weight: 1.5,
      opacity: 0.65,
      dashArray: '3, 5'
    }).addTo(map);
    
    trackLines.push(polyline);
  });
}
