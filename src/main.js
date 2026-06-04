import store from './core/state.js';
import audio from './core/audio.js';
import { fetchLiveTLEs } from './data/tle-db.js';
import { propagateSatellite } from './core/propagator.js';

// Import UI widgets
import { initOrbitViewer, updateSatPositions3D } from './components/orbit-viewer.js';
import { initSpaceWeather } from './components/space-weather.js';
import { initTelemetryTerminal } from './components/telemetry-terminal.js';
import { initAgentConsole } from './components/agent-console.js';
import { initCollisionMonitor } from './components/collision-monitor.js';
import { initGroundTrackMap, invalidateMapSize } from './components/ground-track.js';

let socket = null;
let useWebsocket = false;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Render Lucide Icons
  lucide.createIcons();

  // 2. Play initial click to trigger Audio Context availability on first user click
  document.body.addEventListener('click', () => {
    audio.init();
  }, { once: true });

  // 3. Audio & Alarm Toggles
  const btnMute = document.getElementById('btn-sound-toggle');
  let isMuted = false;
  btnMute.addEventListener('click', () => {
    isMuted = !isMuted;
    audio.setMute(isMuted);
    
    const icon = btnMute.querySelector('i');
    const span = btnMute.querySelector('span');
    
    if (isMuted) {
      icon.setAttribute('data-lucide', 'volume-x');
      span.textContent = 'MUTE ON';
      btnMute.classList.add('active');
    } else {
      icon.setAttribute('data-lucide', 'volume-2');
      span.textContent = 'MUTE OFF';
      btnMute.classList.remove('active');
    }
    lucide.createIcons();
    audio.playClick();
  });

  const btnAlarm = document.getElementById('btn-alarm-toggle');
  let alarmOn = false;
  btnAlarm.addEventListener('click', () => {
    alarmOn = !alarmOn;
    store.updateState('alarmActive', alarmOn);
    
    const span = btnAlarm.querySelector('span');
    if (alarmOn) {
      audio.startAlarm();
      span.textContent = 'ALARM ON';
      btnAlarm.classList.add('active');
      store.addLog('SYSTEM ALARM OVERRIDE ENABLED. Rhythmic sirens armed.', 'danger');
    } else {
      audio.stopAlarm();
      span.textContent = 'ALARM OFF';
      btnAlarm.classList.remove('active');
      store.addLog('SYSTEM ALARM OVERRIDE DISABLED. Sirens disarmed.', 'info');
    }
    audio.playClick();
  });

  // 4. Fetch TLE Catalog Database
  store.addLog('Loading NORAD Space Catalog...', 'info');
  const catalog = await fetchLiveTLEs();
  store.updateState('satellites', catalog);
  store.addLog(`Mapped ${catalog.length} tracked space objects.`, 'success');

  // 5. System Clock Sync
  store.subscribe('simTime', (time) => {
    const formatted = time.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    document.getElementById('lbl-system-clock').textContent = formatted;
  });

  // 6. Connect to Express Backend WebSockets if running in HTTP environment
  setupWebsocketConnection();

  // 7. Initialize Sub-Widgets
  initOrbitViewer();
  initSpaceWeather();
  initTelemetryTerminal();
  initCollisionMonitor();
  initAgentConsole(socket, useWebsocket);
  initGroundTrackMap();

  // 7.5. Bind Search and Filter Events
  bindSearchAndFilterEvents();
  bindViewToggleEvents();

  // 8. Start local simulation clock loop
  // If WebSocket is active, SGP4 tick updates coordinates from the server.
  // If offline, the local SGP4 clock propagates satellite orbits in the client directly.
  store.startClock((simTime) => {
    if (useWebsocket) return; // server will push tick updates
    
    // Offline client-side SGP4 propagator execution
    const sats = store.getState().satellites;
    const updatedSats = sats.map((s, index) => {
      const offset = s.burnAdjustments ? s.burnAdjustments.alt : 0;
      const res = propagateSatellite(s.tle1, s.tle2, simTime, offset, index);
      
      // Update values in-place
      s.lat = res.lat;
      s.lng = res.lng;
      s.alt = res.alt;
      s.velocity = res.velocity;
      s.position3d = res.position3d;
      
      return s;
    });

    store.updateState('satellites', updatedSats);
    updateSatPositions3D(updatedSats);
  });

  // 9. Listen for uplink maneuver events from components and forward to WebSocket server
  document.addEventListener('uplink-maneuver', (e) => {
    const { satelliteId, deltaV, direction } = e.detail;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        action: "MANEUVER_ORBIT",
        satelliteId,
        deltaV,
        direction
      }));
    }
  });

  // Listen for simulated weather overrides and forward to server
  document.addEventListener('uplink-weather', (e) => {
    const { solarProtonFlux, kpIndex, magneticStormLevel } = e.detail;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        action: "UPDATE_WEATHER",
        solarProtonFlux,
        kpIndex,
        magneticStormLevel
      }));
    }
  });
});

// Setup WebSocket Connection with automatic reconnection and fallback
function setupWebsocketConnection() {
  const isWebProtocol = window.location.protocol === 'http:' || window.location.protocol === 'https:';
  
  if (!isWebProtocol) {
    store.addLog('Running in standalone files mode. Direct client propagation active.', 'warning');
    document.getElementById('lbl-ws-status').textContent = 'FILE STANDALONE';
    document.getElementById('lbl-ws-status').className = 'metric-value warning';
    return;
  }

  const wsUri = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/agent`;
  store.addLog(`Connecting to downlink at ${wsUri}...`, 'info');

  try {
    socket = new WebSocket(wsUri);

    socket.onopen = () => {
      useWebsocket = true;
      store.addLog('ISTRAC server downlink synchronized.', 'success');
      document.getElementById('lbl-ws-status').textContent = 'UPLINK OK';
      document.getElementById('lbl-ws-status').className = 'metric-value normal';
      document.getElementById('lbl-downlink-status').textContent = 'SYNCHRONIZED';
      document.getElementById('lbl-downlink-status').className = 'metric-value normal';
    };

    socket.onmessage = (event) => {
      const packet = JSON.parse(event.data);
      
      if (packet.type === "TELEMETRY_CLOCK_TICK" || packet.type === "TELEMETRY_INITIAL_STATE") {
        // Sync state from server
        const currentLocal = store.getState().satellites;
        const serverSats = packet.data.satellites || [];
        
        // Merge coordinate positions keeping frontend metadata (like user selections & burns)
        const merged = serverSats.map((serverSat, idx) => {
          const localSat = currentLocal.find(s => s.id === serverSat.id);
          
          // Pre-propagate coordinates on client as fallback
          const offset = (localSat && localSat.burnAdjustments) ? localSat.burnAdjustments.alt : 0;
          const res = propagateSatellite(serverSat.tle1, serverSat.tle2, store.getState().simTime, offset, idx);

          if (localSat) {
            localSat.lat = typeof serverSat.lat === 'number' ? serverSat.lat : res.lat;
            localSat.lng = typeof serverSat.lng === 'number' ? serverSat.lng : res.lng;
            localSat.alt = typeof serverSat.alt === 'number' ? serverSat.alt : res.alt;
            localSat.velocity = typeof serverSat.velocity === 'number' ? serverSat.velocity : res.velocity;
            localSat.threatLevel = serverSat.threatLevel;
            localSat.threatDetails = serverSat.threatDetails;
            localSat.category = serverSat.category || localSat.category;
            localSat.position3d = res.position3d;
            if (serverSat.health) localSat.health = serverSat.health;
            return localSat;
          } else {
            // New satellite added dynamically, propagate initial coordinates
            serverSat.lat = typeof serverSat.lat === 'number' ? serverSat.lat : res.lat;
            serverSat.lng = typeof serverSat.lng === 'number' ? serverSat.lng : res.lng;
            serverSat.alt = typeof serverSat.alt === 'number' ? serverSat.alt : res.alt;
            serverSat.velocity = typeof serverSat.velocity === 'number' ? serverSat.velocity : res.velocity;
            serverSat.position3d = res.position3d;
            return serverSat;
          }
        });

        store.updateState('satellites', merged);
        updateSatPositions3D(merged);

        // Update solar wind variables from server
        if (packet.data.spaceWeather) {
          const weather = store.getState().spaceWeather;
          weather.solarWindSpeed = packet.data.spaceWeather.solarWindSpeed;
          weather.solarProtonFlux = packet.data.spaceWeather.solarProtonFlux;
          store.updateState('spaceWeather', weather);
        }
      } 
      
      else if (packet.type === "ORBIT_MODIFIED") {
        const { satelliteId, newAlt, details, source } = packet.data;
        const sats = store.getState().satellites;
        const sat = sats.find(s => s.id === satelliteId);
        
        if (sat) {
          // Record adjustment
          const oldAlt = sat.alt;
          const altDiff = newAlt - oldAlt;
          if (!sat.burnAdjustments) sat.burnAdjustments = { alt: 0 };
          sat.burnAdjustments.alt += altDiff;
          sat.alt = newAlt;
          sat.threatLevel = "NORMAL";
          sat.threatDetails = "Orbit maneuver executed successfully.";
          store.updateState('satellites', sats);
        }

        store.addLog(`[UPLINK] ${details} (${source})`, 'success');
        audio.playSuccess();
      }
    };

    socket.onerror = () => {
      handleConnectionFailure();
    };

    socket.onclose = () => {
      if (useWebsocket) {
        store.addLog('ISTRAC server downlink lost. Reverting to local simulation propagation.', 'danger');
        handleConnectionFailure();
      }
    };

  } catch (err) {
    handleConnectionFailure();
  }
}

function handleConnectionFailure() {
  useWebsocket = false;
  socket = null;
  document.getElementById('lbl-ws-status').textContent = 'LOCAL STANDALONE';
  document.getElementById('lbl-ws-status').className = 'metric-value warning';
}

function bindSearchAndFilterEvents() {
  // 1. Category Tabs click handler
  const tabs = document.querySelectorAll('.category-tabs .panel-action');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const category = tab.getAttribute('data-category') || 'all';
      store.updateState('activeCategory', category);
      audio.playClick();
      store.addLog(`Switched telemetry display filter to category: [${category.toUpperCase()}]`, 'info');
    });
  });

  // 2. Search Box track query handler
  const searchInput = document.getElementById('inp-catalog-search');
  const searchBtn = document.getElementById('btn-catalog-search');

  if (!searchInput || !searchBtn) return;

  const triggerCatalogSearch = async () => {
    const query = searchInput.value.trim();
    if (!query) return;

    audio.playClick();
    store.addLog(`Querying space catalog database proxy for query: "${query}"...`, 'info');

    if (!useWebsocket) {
      store.addLog('[ERROR] Dynamic catalog updates require active backend WebSocket telemetry link.', 'danger');
      audio.playHover();
      return;
    }

    try {
      searchBtn.disabled = true;
      searchInput.disabled = true;

      // Call express proxy endpoint
      const response = await fetch(`/api/catalog/search?query=${encodeURIComponent(query)}`);
      if (!response.ok) {
        throw new Error(`Catalog proxy search query failed with status: ${response.status}`);
      }

      const results = await response.json();
      if (!results || results.length === 0) {
        store.addLog(`No matching active satellites or debris entries found for query: "${query}"`, 'danger');
        audio.playHover();
        return;
      }

      // Add the first matching satellite
      const match = results[0];
      store.addLog(`Found target match: ${match.OBJECT_NAME.trim()} (NORAD ID: ${match.NORAD_CAT_ID}). Synchronizing orbital elements...`, 'warning');

      const addResponse = await fetch('/api/catalog/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noradId: match.NORAD_CAT_ID })
      });

      if (!addResponse.ok) {
        const errData = await addResponse.json();
        throw new Error(errData.error || 'Failed to add satellite elements.');
      }

      const newSat = await addResponse.json();

      // Check if it's already in the client-side state
      const currentSats = store.getState().satellites;
      const exists = currentSats.some(s => s.id === newSat.id);
      if (!exists) {
        store.updateState('satellites', [...currentSats, newSat]);
      }

      // Automatically focus details on the newly added spacecraft
      store.updateState('activeSatelliteId', newSat.id);

      store.addLog(`Uplink successful: Tracking target ${newSat.name} in orbit.`, 'success');
      audio.playSuccess();
      searchInput.value = '';
    } catch (err) {
      console.error(err);
      store.addLog(`Satellite sync failure: ${err.message}`, 'danger');
      audio.playHover();
    } finally {
      searchBtn.disabled = false;
      searchInput.disabled = false;
    }
  };

  searchBtn.addEventListener('click', triggerCatalogSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      triggerCatalogSearch();
    }
  });
}

function bindViewToggleEvents() {
  const btn3D = document.getElementById('btn-toggle-3d');
  const btn2D = document.getElementById('btn-toggle-2d');
  const threeContainer = document.getElementById('three-container');
  const leafletContainer = document.getElementById('leaflet-container');
  const orbitControls = document.querySelector('.orbit-controls-hud');
  const titleLabel = document.getElementById('lbl-tracker-title');

  if (!btn3D || !btn2D || !threeContainer || !leafletContainer) return;

  btn3D.addEventListener('click', () => {
    if (btn3D.classList.contains('active')) return;
    
    btn3D.classList.add('active');
    btn2D.classList.remove('active');
    
    threeContainer.style.display = 'block';
    leafletContainer.style.display = 'none';
    if (orbitControls) orbitControls.style.display = 'flex';
    if (titleLabel) {
      titleLabel.innerHTML = '<i data-lucide="globe" style="width: 16px; height: 16px;"></i> 3D Space Domain Map';
      lucide.createIcons();
    }
    
    audio.playClick();
  });

  btn2D.addEventListener('click', () => {
    if (btn2D.classList.contains('active')) return;
    
    btn2D.classList.add('active');
    btn3D.classList.remove('active');
    
    threeContainer.style.display = 'none';
    leafletContainer.style.display = 'block';
    if (orbitControls) orbitControls.style.display = 'none';
    if (titleLabel) {
      titleLabel.innerHTML = '<i data-lucide="map" style="width: 16px; height: 16px;"></i> 2D Ground Track Map';
      lucide.createIcons();
    }
    
    // Force Leaflet map layout calculation once container displays
    invalidateMapSize();
    
    audio.playClick();
  });
}
