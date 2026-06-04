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
}

export const store = new StateStore();
export default store;
