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
      
      if (packet.type === "TELEMETRY_CLOCK_TICK") {
        // Sync state from server
        const currentLocal = store.getState().satellites;
        
        // Merge coordinate positions keeping frontend metadata (like user selections)
        const merged = currentLocal.map(localSat => {
          const serverSat = packet.data.satellites.find(s => s.id === localSat.id);
          if (serverSat) {
            localSat.lat = serverSat.lat;
            localSat.lng = serverSat.lng;
            localSat.alt = serverSat.alt;
            localSat.velocity = serverSat.velocity;
            localSat.threatLevel = serverSat.threatLevel;
            localSat.threatDetails = serverSat.threatDetails;
            
            // Re-propagate 3D Cartesian coordinates for ThreeJS
            const offset = localSat.burnAdjustments ? localSat.burnAdjustments.alt : 0;
            const idx = currentLocal.indexOf(localSat);
            const res = propagateSatellite(localSat.tle1, localSat.tle2, store.getState().simTime, offset, idx);
            localSat.position3d = res.position3d;
          }
          return localSat;
        });

        store.updateState('satellites', merged);
        updateSatPositions3D(merged);

        // Update solar wind variables from server
        const weather = store.getState().spaceWeather;
        weather.solarWindSpeed = packet.data.spaceWeather.solarWindSpeed;
        weather.solarProtonFlux = packet.data.spaceWeather.solarProtonFlux;
        store.updateState('spaceWeather', weather);
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
