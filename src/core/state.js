/**
 * ISRO NETRA State Manager
 * Implements a reactive Pub/Sub pattern for dashboard modular updates.
 */

class StateStore {
  constructor() {
    this.state = {
      satellites: [],
      activeSatelliteId: 'gaganyaan',
      activeCategory: 'all',
      searchQuery: '',
      spaceWeather: {
        kpIndex: 3.2,
        solarWindSpeed: 420, // km/s
        solarProtonFlux: 12.5, // p/cm2-s-sr
        magX: 2.1, // nT (Aditya-L1 MAG)
        magY: -4.5,
        magZ: 8.9,
        magneticStormLevel: 'QUIET',
        fluxHistory: [] // stores rolling chart values
      },
      telemetryLogs: [],
      agentLogs: [],
      activeConjunctions: [],
      simTime: new Date(),
      alarmActive: false
    };

    // Subscriptions map: key -> Array of callbacks
    this.listeners = new Map();
  }

  // Retrieve current state
  getState() {
    return this.state;
  }

  // Subscribe to changes in a specific state key
  subscribe(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, []);
    }
    this.listeners.get(key).push(callback);
    
    // Immediately call back with current value
    callback(this.state[key]);

    // Return unsubscribe function
    return () => {
      const list = this.listeners.get(key);
      const idx = list.indexOf(callback);
      if (idx !== -1) list.splice(idx, 1);
    };
  }

  // Update a specific state key and notify subscribers
  updateState(key, newValue) {
    if (key === 'satellites' && Array.isArray(newValue)) {
      newValue.forEach(s => {
        if (!s.orbit) {
          s.orbit = {
            lat: s.lat || 10.0 + Math.random() * 20.0,
            lng: s.lng || Math.random() * 180.0,
            alt: s.alt || (s.category === 'debris' ? 405.0 : 450.0),
            velocity: s.velocity || 7.6,
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
            powerConsumptionW: isDebris ? 0.0 : (s.id === 'navic-1i' ? 180.0 : 120.0)
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
            fuelPressurePsi: isDebris ? 0.0 : (s.id === 'navic-1i' ? 450.0 : 220.0),
            propellantMassKg: isDebris ? 0.0 : (s.id === 'navic-1i' ? 800.0 : 400.0)
          };
        }
      });
    }
    this.state[key] = newValue;
    this.notify(key);
  }

  // Notify all subscribers of a key
  notify(key) {
    if (this.listeners.has(key)) {
      const val = this.state[key];
      this.listeners.get(key).forEach(cb => {
        try {
          cb(val);
        } catch (err) {
          console.error(`Error notifying listener for ${key}:`, err);
        }
      });
    }
  }

  // Append a message to the telemetry logs list
  addLog(text, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const newLog = { timestamp, text, type };
    
    // Keep last 100 logs
    const logs = [...this.state.telemetryLogs, newLog].slice(-100);
    this.updateState('telemetryLogs', logs);
  }

  // Append an agent execution trace
  addAgentLog(toolName, inputs, result) {
    const timestamp = new Date().toLocaleTimeString();
    const entry = { timestamp, toolName, inputs: JSON.stringify(inputs), result };
    const logs = [entry, ...this.state.agentLogs].slice(0, 30);
    this.updateState('agentLogs', logs);
  }

  // Start the master simulation loop
  startClock(updateCallback) {
    // Populate solar flux chart history baseline
    for (let i = 0; i < 40; i++) {
      this.state.spaceWeather.fluxHistory.push(10 + Math.random() * 8);
    }
    
    // Log startup sequence
    this.addLog('ISTRAC Command Control Initialized.', 'success');
    this.addLog('Establishing downlink to NavIC orbiters...', 'info');
    this.addLog('NETRA tracking network [ACTIVE] - Space Operations, Bengaluru.', 'success');

    setInterval(() => {
      // 1. Advance simulation time by 5 seconds per tick to make orbits visual
      this.state.simTime = new Date(this.state.simTime.getTime() + 5000);
      this.notify('simTime');

      // 2. Perform satellite positions SGP4 calculations (passed from main controller)
      if (updateCallback) {
        updateCallback(this.state.simTime);
      }

      // 3. Simulate solar weather fluctuations
      this.tickSpaceWeather();
      
      // 4. Correlate weather to spacecraft subsystem health
      this.tickSpacecraftHealth();

    }, 1000);
  }

  // Modify solar weather indices dynamically
  tickSpaceWeather() {
    const weather = this.state.spaceWeather;
    
    // Add small random walks to indicators
    weather.solarWindSpeed += Math.floor((Math.random() - 0.5) * 12);
    if (weather.solarWindSpeed < 300) weather.solarWindSpeed = 300;
    if (weather.solarWindSpeed > 800) weather.solarWindSpeed = 800;

    weather.solarProtonFlux += (Math.random() - 0.5) * 1.5;
    if (weather.solarProtonFlux < 5) weather.solarProtonFlux = 5;
    if (weather.solarProtonFlux > 150) weather.solarProtonFlux = 150;

    weather.magX += (Math.random() - 0.5) * 0.8;
    weather.magY += (Math.random() - 0.5) * 0.8;
    weather.magZ += (Math.random() - 0.5) * 0.8;

    // Check storm level based on Kp index thresholds
    const kp = weather.kpIndex;
    if (kp < 4) {
      weather.magneticStormLevel = 'QUIET';
    } else if (kp < 6) {
      weather.magneticStormLevel = 'MODERATE STORM';
    } else {
      weather.magneticStormLevel = 'SEVERE STORM';
    }

    // Push new rolling point and trim
    weather.fluxHistory.push(weather.solarProtonFlux);
    if (weather.fluxHistory.length > 50) {
      weather.fluxHistory.shift();
    }

    this.notify('spaceWeather');
  }

  // Correlate weather factors to active satellite systems health parameters (the Butterfly Effect)
  tickSpacecraftHealth() {
    if (this.isOnline) return; // Skip local simulation if server telemetry is active

    const weather = this.state.spaceWeather;
    const sats = this.state.satellites;
    
    sats.forEach(s => {
      const isDebris = s.id === 'cosmos-debris' || s.category === 'debris';
      if (isDebris) return;

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

      if (s.orbit && s.power && s.thermal && s.communications && s.radiation && s.propulsion) {
        // Run simple physics simulation updates locally
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
    });

    this.notify('satellites');
  }
}

export const store = new StateStore();
export default store;
