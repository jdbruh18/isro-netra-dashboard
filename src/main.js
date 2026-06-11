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
import { initSubsystemCharts } from './components/telemetry-charts.js';
import { initRootCauseAnalyzer } from './components/root-cause-analyzer.js';
import { initIntegrationManager } from './components/integration-manager.js';

let socket = null;
let useWebsocket = false;

document.addEventListener('DOMContentLoaded', async () => {
  // PWA Service Worker Registration
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then(reg => {
        console.log('PWA Service Worker registered with scope:', reg.scope);
      }).catch(err => {
        console.warn('PWA Service Worker registration failed:', err);
      });
    });
  }

  // 1. Render Lucide Icons
  lucide.createIcons();

  // Multi-page routing controller
  const navTabs = document.querySelectorAll('.nav-tab');
  const views = document.querySelectorAll('.dashboard-view');
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetViewId = tab.getAttribute('data-target');
      
      navTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      views.forEach(v => {
        v.classList.remove('active');
        if (v.id === targetViewId) {
          v.classList.add('active');
        }
      });
      
      audio.playClick();
      
      // Calibrate layouts and dispatch activation events on transitions
      if (targetViewId === 'view-tracking') {
        setTimeout(() => {
          invalidateMapSize();
          window.dispatchEvent(new Event('resize'));
        }, 100);
      } else if (targetViewId === 'view-telemetry') {
        document.dispatchEvent(new CustomEvent('subsystem-charts-activated'));
      } else if (targetViewId === 'view-diagnostics') {
        document.dispatchEvent(new CustomEvent('subsystem-rca-activated'));
      } else if (targetViewId === 'view-gateway') {
        document.dispatchEvent(new CustomEvent('integrations-activated'));
      }
    });
  });

  // Collapsible Asset Index Sidebar
  const btnToggleAssets = document.getElementById('btn-toggle-assets');
  const panelAssets = document.getElementById('panel-assets');
  if (btnToggleAssets && panelAssets) {
    // Start collapsed on small screens to save space
    if (window.innerWidth <= 768) {
      panelAssets.classList.add('collapsed');
      const span = btnToggleAssets.querySelector('span');
      if (span) span.textContent = 'SHOW INDEX';
    }
    
    btnToggleAssets.addEventListener('click', () => {
      panelAssets.classList.toggle('collapsed');
      audio.playClick();
      const span = btnToggleAssets.querySelector('span');
      if (span) {
        span.textContent = panelAssets.classList.contains('collapsed') ? 'SHOW INDEX' : 'HIDE INDEX';
      }
    });
  }

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
  initSubsystemCharts();
  initRootCauseAnalyzer();
  initIntegrationManager();

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
    const weather = store.getState().spaceWeather || { solarWindSpeed: 420, solarProtonFlux: 12.5, kpIndex: 3.2 };
    
    const updatedSats = sats.map((s, index) => {
      // Initialize nested subsystem states offline if missing
      if (!s.orbit) {
        s.orbit = {
          lat: s.lat || 15.3421,
          lng: s.lng || 75.8922,
          alt: s.alt || 405.23,
          velocity: s.velocity || 7.67,
          inEclipse: false,
          burnAdjustments: s.burnAdjustments || { alt: 0 }
        };
      }
      if (!s.thermal) {
        const isDebris = s.id === 'cosmos-debris' || s.category === 'debris';
        s.thermal = {
          battTemp: isDebris ? 0.0 : 28.5,
          expectedBattTemp: isDebris ? 0.0 : 28.5,
          radiatorEfficiency: isDebris ? 0.0 : 0.95,
          thermalStress: 0.0
        };
      }
      if (!s.power) {
        const isDebris = s.id === 'cosmos-debris' || s.category === 'debris';
        s.power = {
          solarV: isDebris ? 0.0 : 32.4,
          solarGenerationW: isDebris ? 0.0 : 280.0,
          batterySoC: isDebris ? 0.0 : 92.5,
          powerConsumptionW: isDebris ? 0.0 : 120.0
        };
      }
      if (!s.communications) {
        const isDebris = s.id === 'cosmos-debris' || s.category === 'debris';
        s.communications = {
          downlinkSNR: isDebris ? 0.0 : 24.5,
          signalQuality: isDebris ? 0.0 : 0.98
        };
      }
      if (!s.radiation) {
        const isDebris = s.id === 'cosmos-debris' || s.category === 'debris';
        s.radiation = {
          cumulativeDoseRad: isDebris ? 0.0 : 4.12,
          seuProbability: isDebris ? 0.0 : 0.0001,
          seuCount: 0
        };
      }
      if (!s.propulsion) {
        const isDebris = s.id === 'cosmos-debris' || s.category === 'debris';
        s.propulsion = {
          fuelPressurePsi: isDebris ? 0.0 : 220.0,
          propellantMassKg: isDebris ? 0.0 : 400.0
        };
      }
      if (!s.anomalies) {
        s.anomalies = {
          activeList: [],
          predictions: {
            batteryDepletionTimeSec: -1,
            criticalThermalTimeSec: -1,
            atmosphericReentryTimeSec: -1
          }
        };
      }

      const offset = s.orbit.burnAdjustments ? s.orbit.burnAdjustments.alt : 0;
      const res = propagateSatellite(s.tle1, s.tle2, simTime, offset, index);
      
      // Update values in-place
      s.orbit.lat = res.lat;
      s.orbit.lng = res.lng;
      s.orbit.alt = res.alt;
      s.orbit.velocity = res.velocity;
      s.position3d = res.position3d;
      
      const isDebris = s.id === 'cosmos-debris' || s.category === 'debris';
      if (!isDebris) {
        // Run simple physics offline so the UI still displays cool active changes
        const rad = Math.PI / 180;
        const sunLng = ((Date.now() / 240000) * 360) % 360;
        const cosPhi = Math.cos(s.orbit.lat * rad) * Math.cos((s.orbit.lng - sunLng) * rad);
        const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
        const isBehindEarth = cosPhi < 0;
        const isShadowBlocked = (6378.137 + s.orbit.alt) * sinPhi < 6378.137;
        s.orbit.inEclipse = isBehindEarth && isShadowBlocked;

        const cosTheta = s.orbit.inEclipse ? 0.0 : Math.max(0.1, cosPhi);
        s.power.solarGenerationW = s.orbit.inEclipse ? 0.0 : parseFloat((280.0 * cosTheta).toFixed(1));
        s.power.solarV = s.orbit.inEclipse ? 0.0 : parseFloat((30.0 + 4.1 * cosTheta + (Math.random() - 0.5) * 0.3).toFixed(2));
        const netPower = s.power.solarGenerationW - s.power.powerConsumptionW;
        s.power.batterySoC = parseFloat(Math.max(0, Math.min(100, s.power.batterySoC + netPower / 1000.0)).toFixed(2));

        const T_space = 3.0;
        const sigma = 5.67e-8;
        const T_kelvin = s.thermal.battTemp + 273.15;
        const Q_in = (s.power.powerConsumptionW * 0.15) + (s.orbit.inEclipse ? 0.0 : 180.0);
        const Q_out = sigma * s.thermal.radiatorEfficiency * 1.5 * (Math.pow(T_kelvin, 4) - Math.pow(T_space, 4));
        const dT = ((Q_in - Q_out) / 25000.0) * 60;
        s.thermal.battTemp = parseFloat(Math.max(-50, Math.min(100, s.thermal.battTemp + dT)).toFixed(2));
        s.thermal.expectedBattTemp = s.thermal.battTemp;
        s.thermal.thermalStress = 0.0;

        const gamma = 1e-5;
        s.radiation.cumulativeDoseRad = parseFloat((s.radiation.cumulativeDoseRad + gamma * weather.solarProtonFlux).toFixed(4));
        const P_seu = 0.00005 * weather.solarProtonFlux * Math.exp(weather.kpIndex / 3.0);
        s.radiation.seuProbability = parseFloat(Math.min(1.0, P_seu).toFixed(5));
        if (Math.random() < P_seu) {
          s.radiation.seuCount++;
        }

        const noise = (Math.random() - 0.5) * 1.0;
        s.communications.downlinkSNR = parseFloat((26.5 - weather.kpIndex * 2.2 + noise).toFixed(1));
        s.communications.downlinkSNR = Math.max(5.0, Math.min(30.0, s.communications.downlinkSNR));
        s.communications.signalQuality = parseFloat((s.communications.downlinkSNR / 30.0).toFixed(2));
        s.propulsion.fuelPressurePsi = parseFloat(Math.max(10.0, s.propulsion.fuelPressurePsi + (Math.random() - 0.5) * 0.3).toFixed(1));

        // Calculate drag decay rate locally for prediction countdowns
        let deltaAlt = 0;
        if (s.orbit.alt < 600) {
          const H_base = 50.0;
          const betaDrag = 0.0005;
          const H = H_base * (1.0 + betaDrag * (weather.solarWindSpeed - 400));
          const rho = 6e-12 * Math.exp(-(s.orbit.alt - 350.0) / H);
          const kappa = 2.5e7;
          deltaAlt = - kappa * rho * Math.pow(s.orbit.velocity, 2) * 1.0;
        }

        // 9.1 Local Anomaly Detection and Predictions (V3.4)
        const isStorm = weather.solarProtonFlux > 15.0 || weather.kpIndex >= 4.5;
        const activeAnomalies = [];
        
        if (s.thermal.thermalStress > 5.0) {
          activeAnomalies.push("THERMAL_STRESS_ANOMALY");
        }
        if (s.power.batterySoC < 20.0) {
          activeAnomalies.push("LOW_POWER_ANOMALY");
        }
        if (s.communications.downlinkSNR < 12.0 && isStorm) {
          activeAnomalies.push("IONOSPHERIC_SCINTILLATION_ANOMALY");
        }
        if (s.orbit.alt < 600.0 && weather.solarWindSpeed > 500.0 && deltaAlt < -0.005) {
          activeAnomalies.push("DRAG_DECAY_ANOMALY");
        }
        if (s.radiation.seuProbability > 0.01) {
          activeAnomalies.push("RADIATION_SEU_RISK");
        }

        let depletionTime = -1;
        const deltaSoC = netPower / 1000.0;
        if (deltaSoC < 0) {
          depletionTime = parseFloat((s.power.batterySoC / -deltaSoC).toFixed(1));
        }

        let thermalTime = -1;
        if (dT > 0) {
          thermalTime = parseFloat(((48.0 - s.thermal.battTemp) / dT).toFixed(1));
          if (thermalTime < 0) thermalTime = 0;
        }

        let reentryTime = -1;
        if (s.orbit.alt < 600.0 && deltaAlt < 0) {
          reentryTime = parseFloat(((s.orbit.alt - 150.0) / -deltaAlt).toFixed(1));
          if (reentryTime < 0) reentryTime = 0;
        }

        s.anomalies = {
          activeList: activeAnomalies,
          predictions: {
            batteryDepletionTimeSec: depletionTime,
            criticalThermalTimeSec: thermalTime,
            atmosphericReentryTimeSec: reentryTime
          }
        };
      }

      s.lat = s.orbit.lat;
      s.lng = s.orbit.lng;
      s.alt = s.orbit.alt;
      s.velocity = s.orbit.velocity;

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
      store.isOnline = true;
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
          const offset = (localSat && localSat.orbit && localSat.orbit.burnAdjustments) ? localSat.orbit.burnAdjustments.alt : ((localSat && localSat.burnAdjustments) ? localSat.burnAdjustments.alt : 0);
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
            
            if (serverSat.orbit) localSat.orbit = serverSat.orbit;
            if (serverSat.thermal) localSat.thermal = serverSat.thermal;
            if (serverSat.power) localSat.power = serverSat.power;
            if (serverSat.communications) localSat.communications = serverSat.communications;
            if (serverSat.radiation) localSat.radiation = serverSat.radiation;
            if (serverSat.propulsion) localSat.propulsion = serverSat.propulsion;
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
  store.isOnline = false;
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
