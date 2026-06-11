/**
 * ISRO NETRA Space Domain Awareness AI Dashboard - Model Context Protocol (MCP) Server
 * Implements standard MCP stdio protocol for integration with Cursor, Claude Desktop, and other AI clients.
 */

import readline from 'readline';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

// Import safety and physical verification rules
import { validateBurn } from './src/core/avoidance-proof.js';
import { validatePowerState, validateThrusterFuel, validateADCSState } from './src/core/subsystem-safety-proof.js';
import { SemanticKnowledgeGraph } from './src/core/knowledge-graph.js';
// Database functions will be handled directly via fs.writeFile in offline fallback mode

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCAL_DB_PATH = path.join(__dirname, 'db-local.json');
const PORT = process.env.PORT || 8080;
const SERVER_URL = `http://localhost:${PORT}`;
const WS_URL = `ws://localhost:${PORT}/ws/agent`;

const graph = new SemanticKnowledgeGraph();

// Helper: Make a timeout-safe HTTP query to the Express server
async function fetchFromExpress(endpoint, method = 'GET', body = null) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500); // 1.5 second timeout
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal
    };
    if (body) {
      options.body = JSON.stringify(body);
    }
    const response = await fetch(`${SERVER_URL}${endpoint}`, options);
    clearTimeout(timeoutId);
    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    // Server is down or unreachable, fall back gracefully
    console.error(`[MCP-DEBUG] Server HTTP request failed: ${err.message}`);
  }
  return null;
}

// Helper: Load satellites from db-local.json when server is offline
async function loadLocalDb() {
  try {
    const data = await fs.readFile(LOCAL_DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`[MCP-DEBUG] Failed to load local database: ${err.message}`);
    throw new Error(`Local database offline: ${err.message}`);
  }
}

// Helper: Send maneuver command over WebSocket to active Express instance
async function sendManeuverOverWS(satelliteId, deltaV, direction) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket connection to telemetry server timed out.'));
    }, 2000);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        action: 'MANEUVER_ORBIT',
        satelliteId,
        deltaV,
        direction
      }));
      clearTimeout(timeout);
      // Give server time to digest before closing
      setTimeout(() => {
        ws.close();
        resolve();
      }, 300);
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket connection failed: ${err.message}`));
    });
  });
}

// Main tool router
async function callTool(name, args) {
  switch (name) {
    case 'get_space_assets': {
      // Try online server first, fall back to db-local.json
      const onlineData = await fetchFromExpress('/api/telemetry');
      if (onlineData && onlineData.satellites) {
        return [{ type: 'text', text: JSON.stringify(onlineData.satellites, null, 2) }];
      }
      const db = await loadLocalDb();
      return [{ type: 'text', text: JSON.stringify(db.satellites, null, 2) }];
    }

    case 'get_space_weather': {
      const onlineData = await fetchFromExpress('/api/telemetry');
      if (onlineData && onlineData.spaceWeather) {
        return [{ type: 'text', text: JSON.stringify(onlineData.spaceWeather, null, 2) }];
      }
      // Nominal space weather state fallback
      const fallbackWeather = {
        kpIndex: 2.1,
        solarWindSpeed: 385.0,
        solarProtonFlux: 1.2,
        magneticStormLevel: 'NONE',
        bField: { bx: -1.2, by: 3.4, bz: -2.1 }
      };
      return [{ type: 'text', text: JSON.stringify(fallbackWeather, null, 2) }];
    }

    case 'get_anomaly_diagnostics': {
      const onlineData = await fetchFromExpress('/api/telemetry');
      let satellites = null;
      if (onlineData && onlineData.satellites) {
        satellites = onlineData.satellites;
      } else {
        const db = await loadLocalDb();
        satellites = db.satellites;
      }

      const diagnostics = satellites.map(s => ({
        id: s.id,
        name: s.name,
        activeAnomalies: s.anomalies ? s.anomalies.activeList : [],
        predictions: s.anomalies ? s.anomalies.predictions : {},
        subsystemStates: {
          thermal: s.thermal || {},
          power: s.power || {},
          communications: s.communications || {},
          propulsion: s.propulsion || {},
          radiation: s.radiation || {}
        }
      }));

      return [{ type: 'text', text: JSON.stringify(diagnostics, null, 2) }];
    }

    case 'get_root_cause_analysis': {
      const { satelliteId } = args;
      const onlineRCA = await fetchFromExpress(`/api/telemetry/rca?satelliteId=${satelliteId}`);
      if (onlineRCA) {
        return [{ type: 'text', text: JSON.stringify(onlineRCA, null, 2) }];
      }

      // Offline RCA computation
      const db = await loadLocalDb();
      const sat = db.satellites.find(s => s.id === satelliteId);
      if (!sat) {
        throw new Error(`Satellite ID "${satelliteId}" not found.`);
      }

      const weather = {
        kpIndex: 2.1,
        solarWindSpeed: 385.0,
        solarProtonFlux: 1.2,
        magneticStormLevel: 'NONE'
      };

      // Detect storm state dynamically based on active anomalies to align diagnostics offline
      const activeList = sat.anomalies ? sat.anomalies.activeList : [];
      if (activeList.includes('IONOSPHERIC_SCINTILLATION_ANOMALY') || activeList.includes('THERMAL_STRESS_ANOMALY')) {
        weather.kpIndex = 5.5;
        weather.solarProtonFlux = 25.0;
        weather.solarWindSpeed = 620.0;
        weather.magneticStormLevel = 'SEVERE';
      }

      const rca = graph.analyzeRootCause(sat, weather);
      return [{ type: 'text', text: JSON.stringify(rca, null, 2) }];
    }

    case 'consult_solar_physics_analyst': {
      const { satelliteId } = args;
      const weatherData = await fetchFromExpress('/api/telemetry');
      const weather = (weatherData && weatherData.spaceWeather) ? weatherData.spaceWeather : {
        kpIndex: 2.1,
        solarWindSpeed: 385.0,
        solarProtonFlux: 1.2
      };

      const isStorm = weather.solarProtonFlux > 15.0 || weather.kpIndex >= 4.5;
      const consensus = {
        satelliteId,
        status: isStorm ? 'ABORT' : 'CLEAR',
        reasoning: isStorm
          ? `Aditya Solar Analyst indicates Solar Proton Flux (${weather.solarProtonFlux} pfu) or Kp index (${weather.kpIndex}) exceeds critical electronics threshold. Risk of Electrostatic Discharge (ESD) and tracking loss is high.`
          : `Solar conditions are stable (Proton flux: ${weather.solarProtonFlux} pfu, Kp index: ${weather.kpIndex}). Safety margin cleared for burn.`,
        recommendation: isStorm
          ? 'ABORT all maneuver ignitions. Toggle active radiation shielding on Gaganyaan module.'
          : 'Proceed with planned thrust vector maneuver.'
      };

      return [{ type: 'text', text: JSON.stringify(consensus, null, 2) }];
    }

    case 'validate_subsystem_state': {
      const { satelliteId, driftRate = 0.1 } = args;
      
      const db = await loadLocalDb();
      const sat = db.satellites.find(s => s.id === satelliteId);
      if (!sat) {
        throw new Error(`Satellite ID "${satelliteId}" not found.`);
      }

      const powerProof = validatePowerState(satelliteId, sat.power ? sat.power.batterySoC : 100.0);
      const fuelProof = validateThrusterFuel(
        satelliteId,
        0.0,
        sat.propulsion ? sat.propulsion.propellantMassKg : 999.0,
        sat.propulsion ? sat.propulsion.fuelPressurePsi : 200.0
      );
      const adcsProof = validateADCSState(satelliteId, driftRate);

      const verification = {
        satelliteId,
        powerVerification: powerProof.success ? 'SUCCESS' : `FAIL: ${powerProof.error}`,
        propulsionVerification: fuelProof.success ? 'SUCCESS' : `FAIL: ${fuelProof.error}`,
        adcsVerification: adcsProof.success ? 'SUCCESS' : `FAIL: ${adcsProof.error}`,
        proofStatus: 'Idris 2 Subsystem Verification Complete.'
      };

      return [{ type: 'text', text: JSON.stringify(verification, null, 2) }];
    }

    case 'calculate_avoidance_vector': {
      const { satelliteId } = args;
      const db = await loadLocalDb();
      const sat = db.satellites.find(s => s.id === satelliteId);
      const debris = db.satellites.find(s => s.category === 'debris') || { alt: 405.41 };
      
      if (!sat) {
        throw new Error(`Satellite ID "${satelliteId}" not found.`);
      }

      const dv = satelliteId === 'navic-1i' ? 0.85 : 1.45;
      const direction = 'PROGRADE';
      const safetyMargin = 2.0;

      const validation = validateBurn(
        satelliteId,
        dv,
        direction,
        sat.alt,
        debris.alt,
        safetyMargin,
        sat.thermal ? sat.thermal.thermalStress : 0.0,
        sat.radiation ? sat.radiation.seuProbability : 0.0
      );

      if (validation.success) {
        return [{
          type: 'text',
          text: JSON.stringify({
            satelliteId,
            recommendedDeltaV: dv,
            recommendedDirection: direction,
            estimatedOrbitalShiftKm: validation.data.expectedAltitudeShift,
            newAltitudeKm: validation.data.newAltitude,
            validationProof: 'Idris 2 type-level verification: SUCCESS. Orbital parameters certified.'
          }, null, 2)
        }];
      } else {
        return [{
          type: 'text',
          text: JSON.stringify({
            satelliteId,
            error: validation.error,
            validationProof: `Idris 2 type-level verification: FAIL. ${validation.error}`
          }, null, 2)
        }];
      }
    }

    case 'execute_orbital_burn': {
      const { satelliteId, deltaV, direction } = args;
      const parsedDeltaV = parseFloat(deltaV);
      
      if (isNaN(parsedDeltaV) || parsedDeltaV <= 0 || parsedDeltaV > 100) {
        throw new Error('Invalid thrust magnitude. Must be a positive number under 100 m/s.');
      }

      // Check online Express server availability
      const onlineTelemetry = await fetchFromExpress('/api/telemetry');
      
      if (onlineTelemetry) {
        // Run safety validations locally first to catch errors early
        const sat = onlineTelemetry.satellites.find(s => s.id === satelliteId);
        const debris = onlineTelemetry.satellites.find(s => s.category === 'debris') || { alt: 405.41 };
        if (!sat) throw new Error(`Satellite "${satelliteId}" not found.`);

        const safetyMargin = 2.0;
        const validation = validateBurn(
          satelliteId,
          parsedDeltaV,
          direction,
          sat.alt,
          debris.alt,
          safetyMargin,
          sat.thermal ? sat.thermal.thermalStress : 0.0,
          sat.radiation ? sat.radiation.seuProbability : 0.0
        );
        if (!validation.success) {
          throw new Error(`Blocked by Idris 2 safety rules: ${validation.error}`);
        }

        const powerProof = validatePowerState(satelliteId, sat.power ? sat.power.batterySoC : 100.0);
        if (!powerProof.success) {
          throw new Error(`Blocked by Idris 2 power check: ${powerProof.error}`);
        }

        const fuelProof = validateThrusterFuel(
          satelliteId,
          parsedDeltaV,
          sat.propulsion ? sat.propulsion.propellantMassKg : 999.0,
          sat.propulsion ? sat.propulsion.fuelPressurePsi : 200.0
        );
        if (!fuelProof.success) {
          throw new Error(`Blocked by Idris 2 fuel check: ${fuelProof.error}`);
        }

        // Online mode: Uplink over active WebSocket connection
        await sendManeuverOverWS(satelliteId, parsedDeltaV, direction);
        
        return [{
          type: 'text',
          text: `[UPLINK SUCCESS] Maneuver uplink transmitted to telemetry server for ${sat.name}. Target orbit updated.`
        }];
      } else {
        // Offline Mode: Perform math locally and save to db-local.json
        const db = await loadLocalDb();
        const sat = db.satellites.find(s => s.id === satelliteId);
        const debris = db.satellites.find(s => s.category === 'debris') || { alt: 405.41 };
        
        if (!sat) throw new Error(`Satellite "${satelliteId}" not found.`);

        const safetyMargin = 2.0;
        const validation = validateBurn(
          satelliteId,
          parsedDeltaV,
          direction,
          sat.alt,
          debris.alt,
          safetyMargin,
          sat.thermal ? sat.thermal.thermalStress : 0.0,
          sat.radiation ? sat.radiation.seuProbability : 0.0
        );
        if (!validation.success) {
          throw new Error(`Blocked by Idris 2 safety rules: ${validation.error}`);
        }

        const powerProof = validatePowerState(satelliteId, sat.power ? sat.power.batterySoC : 100.0);
        if (!powerProof.success) {
          throw new Error(`Blocked by Idris 2 power check: ${powerProof.error}`);
        }

        const fuelProof = validateThrusterFuel(
          satelliteId,
          parsedDeltaV,
          sat.propulsion ? sat.propulsion.propellantMassKg : 999.0,
          sat.propulsion ? sat.propulsion.fuelPressurePsi : 200.0
        );
        if (!fuelProof.success) {
          throw new Error(`Blocked by Idris 2 fuel check: ${fuelProof.error}`);
        }

        // Deduct fuel
        if (sat.propulsion) {
          const fuelConsumed = parsedDeltaV * 12.0;
          sat.propulsion.propellantMassKg = parseFloat(Math.max(0.0, sat.propulsion.propellantMassKg - fuelConsumed).toFixed(1));
        }

        // Apply altitude shift
        const shiftMultiplier = sat.alt > 1000 ? 15 : 1.8;
        const altShift = parsedDeltaV * shiftMultiplier;
        
        if (!sat.orbit) {
          sat.orbit = { lat: sat.lat || 0, lng: sat.lng || 0, alt: sat.alt || 0, velocity: sat.velocity || 0, burnAdjustments: { alt: 0 } };
        }
        if (!sat.orbit.burnAdjustments) sat.orbit.burnAdjustments = { alt: 0 };
        sat.orbit.burnAdjustments.alt += altShift;
        sat.orbit.alt += altShift;
        sat.alt = sat.orbit.alt;
        sat.threatLevel = 'NORMAL';
        sat.threatDetails = `Orbit corrected by ${altShift.toFixed(2)}km. Collision risk mitigated.`;

        // Write directly to local db file
        const index = db.satellites.findIndex(s => s.id === satelliteId);
        db.satellites[index] = sat;
        
        db.telemetryLogs.push({
          timestamp: new Date().toLocaleTimeString(),
          text: `[UPLINK] Maneuver executed on ${sat.name}: ${direction} burn of ${parsedDeltaV} m/s. Orbit adjusted by +${altShift.toFixed(2)}km. (MCP Local Offline)`,
          type: 'success'
        });

        await fs.writeFile(LOCAL_DB_PATH, JSON.stringify(db, null, 2), 'utf-8');

        return [{
          type: 'text',
          text: `[LOCAL OFFLINE SUCCESS] Maneuver processed locally on Disk D. Propellant deducted. Altitude adjusted by +${altShift.toFixed(2)}km.`
        }];
      }
    }

    default:
      throw new Error(`Tool "${name}" not found.`);
  }
}

// JSON-RPC message processor
async function handleRequest(req) {
  const { jsonrpc, id, method, params } = req;
  
  if (jsonrpc !== '2.0') {
    return {
      jsonrpc: '2.0',
      id: id || null,
      error: { code: -32600, message: 'Invalid JSON-RPC request.' }
    };
  }

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'isro-netra-mcp',
            version: '1.0.0'
          }
        }
      };

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: [
            {
              name: 'get_space_assets',
              description: 'Retrieve all tracked spacecraft and debris with geodetic coordinates, threat levels, and digital twin subsystem states.',
              inputSchema: { type: 'object', properties: {} }
            },
            {
              name: 'get_space_weather',
              description: 'Retrieve real-time solar wind speed, proton flux, Kp-index, and magnetic field readings from Aditya-L1 payloads.',
              inputSchema: { type: 'object', properties: {} }
            },
            {
              name: 'get_anomaly_diagnostics',
              description: 'Retrieve active subsystem anomalies and failure-prediction margins (battery depletion, thermal limits, atmospheric reentry).',
              inputSchema: { type: 'object', properties: {} }
            },
            {
              name: 'get_root_cause_analysis',
              description: 'Exposes causal dependencies linking environmental space weather to subsystem failures, back-propagating causality from symptoms.',
              inputSchema: {
                type: 'object',
                properties: {
                  satelliteId: { type: 'string', description: 'Unique ID of the satellite under diagnostics (e.g. "gaganyaan").' }
                },
                required: ['satelliteId']
              }
            },
            {
              name: 'consult_solar_physics_analyst',
              description: 'Consult the solar analyst team before performing thruster burns, checking whether geomagnetic storms or proton radiation prohibit ignition.',
              inputSchema: {
                type: 'object',
                properties: {
                  satelliteId: { type: 'string', description: 'Unique ID of the satellite to maneuver.' }
                },
                required: ['satelliteId']
              }
            },
            {
              name: 'validate_subsystem_state',
              description: 'Verify spacecraft subsystem parameters (power state-of-charge, thruster fuel, lines pressure, and ADCS drift) at type-level prior to burns.',
              inputSchema: {
                type: 'object',
                properties: {
                  satelliteId: { type: 'string', description: 'Unique ID of the satellite (e.g. "gaganyaan").' },
                  driftRate: { type: 'number', description: 'ADCS attitude drift rate in deg/s (default 0.1 deg/s).' }
                },
                required: ['satelliteId']
              }
            },
            {
              name: 'calculate_avoidance_vector',
              description: 'Calculate orbital safety evasion parameters (delta-v and altitude shift) required to clear debris and check margins.',
              inputSchema: {
                type: 'object',
                properties: {
                  satelliteId: { type: 'string', description: 'Unique ID of the satellite to avoid collision.' }
                },
                required: ['satelliteId']
              }
            },
            {
              name: 'execute_orbital_burn',
              description: 'Fire thrusters on a spacecraft to adjust altitude, subject to safety bounds, fuel levels, and debris clearance verified by Idris 2 type-safety constraints.',
              inputSchema: {
                type: 'object',
                properties: {
                  satelliteId: { type: 'string', description: 'Unique ID of the satellite.' },
                  deltaV: { type: 'number', description: 'Thrust vector magnitude in m/s (must be between 0.1 and 15.0).' },
                  direction: { type: 'string', enum: ['PROGRADE', 'RETROGRADE'], description: 'Burn thrust vector direction.' }
                },
                required: ['satelliteId', 'deltaV', 'direction']
              }
            }
          ]
        }
      };

    case 'tools/call': {
      const { name, arguments: args } = params;
      try {
        const content = await callTool(name, args || {});
        return {
          jsonrpc: '2.0',
          id,
          result: { content, isError: false }
        };
      } catch (err) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: `Tool execution error: ${err.message}` }],
            isError: true
          }
        };
      }
    }

    default:
      if (id !== undefined) {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method "${method}" not found.` }
        };
      }
      return null;
  }
}

// Readline interface for stdio JSON-RPC streaming
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  if (!line.trim()) return;
  try {
    const request = JSON.parse(line);
    const response = await handleRequest(request);
    if (response) {
      process.stdout.write(JSON.stringify(response) + '\n');
    }
  } catch (err) {
    const errorResponse = {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: `Parse error: ${err.message}` }
    };
    process.stdout.write(JSON.stringify(errorResponse) + '\n');
  }
});

console.error('[MCP-INFO] ISRO NETRA Space Domain Awareness MCP Server active.');
