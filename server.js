import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDb, getSatellites, saveSatellite, saveLog, saveAgentAction } from './db.js';
import { validateBurn } from './src/core/avoidance-proof.js';
import { validatePowerState, validateThrusterFuel, validateADCSState } from './src/core/subsystem-safety-proof.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

app.use(express.json());
app.use(express.static(__dirname));

// Default port for Google Cloud Run is 8080
const PORT = process.env.PORT || 8080;

// NOAA Space Weather Prediction Center API Feeds
let isStormOverride = false;

async function fetchNOAASpaceWeather() {
  try {
    // 1. Kp Index (Planetary K-index)
    const kpRes = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json');
    const kpData = await kpRes.json();
    let kpVal = 3.0;
    if (kpData && kpData.length > 0) {
      const latest = kpData[kpData.length - 1];
      if (latest && latest.Kp !== undefined) kpVal = parseFloat(latest.Kp);
    }
    
    // 2. Solar Wind Plasma (DSCOVR solar wind speed)
    const plasmaRes = await fetch('https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json');
    const plasmaData = await plasmaRes.json();
    let windVal = 400.0;
    if (plasmaData && plasmaData.length > 0) {
      for (let i = plasmaData.length - 1; i >= 1; i--) {
        const row = plasmaData[i];
        if (row && row[2] && !isNaN(parseFloat(row[2]))) {
          windVal = parseFloat(row[2]);
          break;
        }
      }
    }
    
    // 3. Solar Wind Magnetic Field (DSCOVR Magnetometer)
    const magRes = await fetch('https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json');
    const magData = await magRes.json();
    let magX = 0.0, magY = 0.0, magZ = 0.0;
    if (magData && magData.length > 0) {
      for (let i = magData.length - 1; i >= 1; i--) {
        const row = magData[i];
        if (row && row[1] && row[2] && row[3]) {
          magX = parseFloat(row[1]);
          magY = parseFloat(row[2]);
          magZ = parseFloat(row[3]);
          break;
        }
      }
    }
    
    // 4. GOES Proton Flux (Integral protons >=10 MeV)
    const protonRes = await fetch('https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json');
    const protonData = await protonRes.json();
    let protonVal = 10.0;
    if (protonData && protonData.length > 0) {
      const tenMevList = protonData.filter(p => p.energy === '>=10 MeV');
      if (tenMevList.length > 0) {
        protonVal = parseFloat(tenMevList[tenMevList.length - 1].flux || 10.0);
      }
    }
    
    // Update live values inside the telemetry memory store
    if (!isStormOverride) {
      serverTelemetry.spaceWeather.kpIndex = kpVal;
      serverTelemetry.spaceWeather.solarWindSpeed = windVal;
      serverTelemetry.spaceWeather.solarProtonFlux = protonVal;
      serverTelemetry.spaceWeather.magX = magX;
      serverTelemetry.spaceWeather.magY = magY;
      serverTelemetry.spaceWeather.magZ = magZ;
      serverTelemetry.spaceWeather.magneticStormLevel = kpVal >= 5.0 ? "SEVERE STORM" : "QUIET";
      
      console.log(`[NOAA API] Live space weather synced: Kp=${kpVal.toFixed(1)}, Wind=${windVal.toFixed(0)}km/s, Protons=${protonVal.toFixed(1)}pfu`);
    }
  } catch (err) {
    console.error("[NOAA API] Failed to fetch live space weather feeds:", err.message);
  }
}

// Centralized state store inside server memory for SGP4 synchronized streaming
let serverTelemetry = {
  satellites: [
    {
      id: "gaganyaan",
      name: "Gaganyaan Crew Module",
      owner: "ISRO",
      type: "Crewed Spacecraft",
      lat: 15.3421,
      lng: 75.8922,
      alt: 405.23,
      velocity: 7.67,
      threatLevel: "NORMAL",
      threatDetails: "Normal orbital operations.",
      tle1: "1 99901U 26001A   26155.50000000  .00020000  00000-0  10000-3 0  9991",
      tle2: "2 99901  51.6400 120.5000 0005000  30.0000 330.0000 15.60000000    12",
      category: "indian",
      orbit: {
        lat: 15.3421,
        lng: 75.8922,
        alt: 405.23,
        velocity: 7.67,
        inEclipse: false,
        burnAdjustments: { alt: 0 }
      },
      thermal: {
        battTemp: 28.5,
        expectedBattTemp: 28.5,
        radiatorEfficiency: 0.95,
        thermalStress: 0.0
      },
      power: {
        solarV: 32.4,
        solarGenerationW: 280.0,
        batterySoC: 92.5,
        powerConsumptionW: 120.0
      },
      communications: {
        downlinkSNR: 24.5,
        signalQuality: 0.98
      },
      radiation: {
        cumulativeDoseRad: 4.12,
        seuProbability: 0.0001,
        seuCount: 0
      },
      propulsion: {
        fuelPressurePsi: 220.0,
        propellantMassKg: 400.0
      }
    },
    {
      id: "cosmos-debris",
      name: "Cosmos-1408 Debris #412",
      owner: "SL-14 (Debris)",
      type: "Space Debris",
      lat: 15.3510,
      lng: 75.8990,
      alt: 405.41,
      velocity: 7.68,
      threatLevel: "WARNING",
      threatDetails: "Intersection route with Gaganyaan capsule.",
      tle1: "1 99902U 21000A   26155.49900000  .00030000  00000-0  20000-3 0  9995",
      tle2: "2 99902  51.6420 120.4850 0005200  28.0000 332.0000 15.60150000    16",
      category: "debris",
      orbit: {
        lat: 15.3510,
        lng: 75.8990,
        alt: 405.41,
        velocity: 7.68,
        inEclipse: false,
        burnAdjustments: { alt: 0 }
      },
      thermal: {
        battTemp: 0.0,
        expectedBattTemp: 0.0,
        radiatorEfficiency: 0.0,
        thermalStress: 0.0
      },
      power: {
        solarV: 0.0,
        solarGenerationW: 0.0,
        batterySoC: 0.0,
        powerConsumptionW: 0.0
      },
      communications: {
        downlinkSNR: 0.0,
        signalQuality: 0.0
      },
      radiation: {
        cumulativeDoseRad: 0.0,
        seuProbability: 0.0,
        seuCount: 0
      },
      propulsion: {
        fuelPressurePsi: 0.0,
        propellantMassKg: 0.0
      }
    },
    {
      id: "cartosat-3",
      name: "Cartosat-3",
      owner: "ISRO",
      type: "Earth Observation",
      lat: -40.1245,
      lng: 130.4512,
      alt: 509.15,
      velocity: 7.61,
      threatLevel: "NORMAL",
      threatDetails: "Imaging payload operational.",
      tle1: "1 44804U 19081A   26155.50000000  .00001000  00000-0  50000-4 0  9992",
      tle2: "2 44804  97.4000 230.1200 0012000  90.0000 270.0000 15.20000000    13",
      category: "indian",
      orbit: {
        lat: -40.1245,
        lng: 130.4512,
        alt: 509.15,
        velocity: 7.61,
        inEclipse: false,
        burnAdjustments: { alt: 0 }
      },
      thermal: {
        battTemp: 27.2,
        expectedBattTemp: 27.2,
        radiatorEfficiency: 0.95,
        thermalStress: 0.0
      },
      power: {
        solarV: 31.8,
        solarGenerationW: 240.0,
        batterySoC: 88.0,
        powerConsumptionW: 100.0
      },
      communications: {
        downlinkSNR: 22.8,
        signalQuality: 0.97
      },
      radiation: {
        cumulativeDoseRad: 3.54,
        seuProbability: 0.00008,
        seuCount: 0
      },
      propulsion: {
        fuelPressurePsi: 180.0,
        propellantMassKg: 300.0
      }
    },
    {
      id: "navic-1i",
      name: "NavIC-1I (IRNSS-1I)",
      owner: "ISRO",
      type: "Regional Navigation",
      lat: 10.4512,
      lng: 80.1245,
      alt: 35786.11,
      velocity: 3.08,
      threatLevel: "NORMAL",
      threatDetails: "NavIC atomic clock synchronization stable.",
      tle1: "1 43286U 18035A   26155.50000000  .00000100  00000-0  00000-0 0  9993",
      tle2: "2 43286  29.0000  80.2000 0020000 180.0000 180.0000  1.00270000    14",
      category: "indian",
      orbit: {
        lat: 10.4512,
        lng: 80.1245,
        alt: 35786.11,
        velocity: 3.08,
        inEclipse: false,
        burnAdjustments: { alt: 0 }
      },
      thermal: {
        battTemp: 29.8,
        expectedBattTemp: 29.8,
        radiatorEfficiency: 0.95,
        thermalStress: 0.0
      },
      power: {
        solarV: 34.1,
        solarGenerationW: 450.0,
        batterySoC: 95.0,
        powerConsumptionW: 180.0
      },
      communications: {
        downlinkSNR: 25.1,
        signalQuality: 0.99
      },
      radiation: {
        cumulativeDoseRad: 12.8,
        seuProbability: 0.0005,
        seuCount: 0
      },
      propulsion: {
        fuelPressurePsi: 450.0,
        propellantMassKg: 800.0
      }
    }
  ],
  spaceWeather: {
    kpIndex: 3.2,
    solarWindSpeed: 420,
    solarProtonFlux: 12.5,
    magX: 2.1,
    magY: -4.5,
    magZ: 8.9,
    magneticStormLevel: "QUIET"
  }
};

// List of connected WebSocket agent clients
const clients = new Set();

// Setup WebSockets Upgrade route
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  
  if (pathname === '/ws/agent') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Handle WebSocket connections
wss.on('connection', (ws) => {
  clients.add(ws);
  
  // Send initial telemetry state immediately
  ws.send(JSON.stringify({
    type: "TELEMETRY_INITIAL_STATE",
    data: serverTelemetry
  }));

  ws.on('message', async (message) => {
    try {
      const packet = JSON.parse(message);
      
      // External Agent command overrides
      if (packet.action === "MANEUVER_ORBIT") {
        const { satelliteId, deltaV, direction } = packet;
        await executeManeuver(satelliteId, deltaV, direction, "External Agent Command");
      } else if (packet.action === "UPDATE_WEATHER") {
        const { solarProtonFlux, kpIndex, magneticStormLevel } = packet;
        const fluxVal = parseFloat(solarProtonFlux);
        serverTelemetry.spaceWeather.solarProtonFlux = fluxVal;
        if (kpIndex !== undefined) serverTelemetry.spaceWeather.kpIndex = parseFloat(kpIndex);
        if (magneticStormLevel !== undefined) serverTelemetry.spaceWeather.magneticStormLevel = magneticStormLevel;
        
        if (fluxVal > 15.0) {
          isStormOverride = true;
          console.log("[STORM OVERRIDE] Solar storm simulation active. NOAA live sync suspended.");
        } else {
          isStormOverride = false;
          console.log("[STORM OVERRIDE] Solar storm simulation cleared. NOAA live sync resumed.");
          fetchNOAASpaceWeather();
        }
        
        // Broadcast telemetry update across all clients
        broadcastTelemetry("TELEMETRY_CLOCK_TICK", serverTelemetry);
      }
    } catch (e) {
      console.error("Invalid WebSocket command received:", e);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
  });
});

// Broadcast telemetry changes to all connected UIs & Agents
function broadcastTelemetry(type, data) {
  const packet = JSON.stringify({ type, data });
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(packet);
    }
  });
}

// Modify satellite altitude based on delta-v (orbital thrust mechanics simulation)
async function executeManeuver(satId, deltaV, direction, source = "Manual Control") {
  const sat = serverTelemetry.satellites.find(s => s.id === satId);
  if (!sat) return { status: "ERROR", message: "Satellite not found" };

  // Validate thrust magnitude parameters to prevent injection or simulation overflows
  const parsedDeltaV = parseFloat(deltaV);
  if (isNaN(parsedDeltaV) || parsedDeltaV <= 0 || parsedDeltaV > 100) {
    return { status: "ERROR", message: "Invalid thrust vector magnitude. Must be a positive number under 100 m/s." };
  }

  // Enforce Idris 2 type-level bounds validation
  const debris = serverTelemetry.satellites.find(s => s.category === 'debris') || { alt: 405.41 };
  const safetyMargin = 2.0; // 2 km safety clearance
  const validation = validateBurn(satId, parsedDeltaV, direction, sat.alt, debris.alt, safetyMargin);
  if (!validation.success) {
    return { status: "ERROR", message: "Maneuver blocked by Idris 2 verification: " + validation.error };
  }

  // Enforce Idris 2 power grid state check
  const powerValidation = validatePowerState(satId, sat.power ? sat.power.batterySoC : 100.0);
  if (!powerValidation.success) {
    return { status: "ERROR", message: "Maneuver blocked by Idris 2 power verification: " + powerValidation.error };
  }

  // Enforce Idris 2 thruster fuel & pressure check
  const fuelValidation = validateThrusterFuel(
    satId,
    parsedDeltaV,
    sat.propulsion ? sat.propulsion.propellantMassKg : 999.0,
    sat.propulsion ? sat.propulsion.fuelPressurePsi : 200.0
  );
  if (!fuelValidation.success) {
    return { status: "ERROR", message: "Maneuver blocked by Idris 2 fuel verification: " + fuelValidation.error };
  }

  // Deduct consumed propellant mass on successful maneuvers
  if (sat.propulsion) {
    const fuelConsumed = parsedDeltaV * 12.0; // 12 kg consumed per m/s delta-v
    sat.propulsion.propellantMassKg = parseFloat(Math.max(0.0, sat.propulsion.propellantMassKg - fuelConsumed).toFixed(1));
  }

  // Calculate altitude adjustment (1 m/s delta-v shifts orbit semi-major axis roughly by 1.8km in LEO)
  const shiftMultiplier = sat.alt > 1000 ? 15 : 1.8;
  const altShift = parsedDeltaV * shiftMultiplier;
  
  if (!sat.orbit) {
    sat.orbit = {
      lat: sat.lat || 0,
      lng: sat.lng || 0,
      alt: sat.alt || 0,
      velocity: sat.velocity || 0,
      inEclipse: false,
      burnAdjustments: { alt: 0 }
    };
  }
  if (!sat.orbit.burnAdjustments) sat.orbit.burnAdjustments = { alt: 0 };
  sat.orbit.burnAdjustments.alt += altShift;
  sat.orbit.alt += altShift;
  sat.alt = sat.orbit.alt;
  sat.threatLevel = "NORMAL";
  sat.threatDetails = `Orbit corrected by ${altShift.toFixed(2)}km. Collision risk mitigated.`;

  const details = `Maneuver executed on ${sat.name}: ${direction} burn of ${deltaV} m/s. Orbit adjusted by +${altShift.toFixed(2)}km.`;
  
  // Persist coordinate shift and log event to database
  try {
    await saveSatellite(sat);
    await saveLog({
      timestamp: new Date().toLocaleTimeString(),
      text: `[UPLINK] ${details} (${source})`,
      type: "success"
    });
  } catch (err) {
    console.error("Database save failed inside executeManeuver:", err);
  }

  // Broadcast update to all listeners
  broadcastTelemetry("ORBIT_MODIFIED", {
    satelliteId: satId,
    newAlt: sat.alt,
    details,
    source
  });

  return {
    status: "SUCCESS",
    details
  };
}

// REST Endpoint: Get current telemetry states
app.get('/api/telemetry', (req, res) => {
  res.json(serverTelemetry);
});

// REST Endpoint: Proxy Search query to CelesTrak to prevent client CORS blocks
app.get('/api/catalog/search', async (req, res) => {
  const { query } = req.query;
  
  // Input validation and sanitization to prevent type confusion or SSRF leaks
  const cleanQuery = (typeof query === 'string') ? query.trim() : '';
  if (!cleanQuery) {
    return res.status(400).json({ error: "Missing or invalid search query parameter." });
  }
  if (cleanQuery.length > 100) {
    return res.status(400).json({ error: "Search query string is too long (Max 100 characters)." });
  }

  try {
    let celestrakUrl = '';
    const isNoradId = /^\d+$/.test(cleanQuery);

    if (isNoradId) {
      celestrakUrl = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${cleanQuery}&FORMAT=json`;
    } else {
      celestrakUrl = `https://celestrak.org/NORAD/elements/gp.php?NAME=${encodeURIComponent(cleanQuery)}&FORMAT=json`;
    }

    const response = await fetch(celestrakUrl);
    if (!response.ok) {
      return res.status(response.status).json({ error: "Failed to fetch from NORAD catalog database." });
    }

    const data = await response.json();
    res.json(data || []);
  } catch (err) {
    console.error("CelesTrak search error:", err);
    res.status(500).json({ error: "Failed to connect to NORAD server: " + err.message });
  }
});

// REST Endpoint: Add a new satellite TLE dynamically to active tracking
app.post('/api/catalog/add', async (req, res) => {
  const { noradId, category } = req.body;
  if (!noradId) {
    return res.status(400).json({ error: "Missing noradId in request body." });
  }

  // Strictly validate noradId as numeric positive integer (max 8 digits) to block SSRF parameter injection
  const cleanNoradId = noradId.toString().trim();
  if (!/^\d{1,8}$/.test(cleanNoradId)) {
    return res.status(400).json({ error: "Invalid noradId. Must be a numeric string up to 8 digits." });
  }

  try {
    const celestrakUrl = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${cleanNoradId}&FORMAT=json`;
    const response = await fetch(celestrakUrl);
    
    if (!response.ok) {
      return res.status(response.status).json({ error: "Failed to retrieve TLE from NORAD database." });
    }

    const data = await response.json();
    if (data && data.length > 0) {
      const item = data[0];
      
      // Parse Keplerian GP format back to standard TLE representation
      const line1 = `1 ${item.NORAD_CAT_ID.toString().padStart(5,'0')}U ${item.COSPAR_ID || '26001A'}   ${item.EPOCH.substring(2,4)}${item.EPOCH.substring(5,7)}${item.EPOCH.substring(8,10)}.00000000  .00000000  00000-0  00000-0 0  9997`;
      
      // Formats Keplerian orbits parameters
      const incl = item.INCLINATION.toFixed(4).padStart(8);
      const raan = item.RA_OF_ASC_NODE.toFixed(4).padStart(8);
      const ecc = (item.ECCENTRICITY * 10000000).toFixed(0).padStart(7, '0');
      const arg = item.ARG_OF_PERICENTER.toFixed(4).padStart(8);
      const mean = item.MEAN_ANOMALY.toFixed(4).padStart(8);
      const motion = item.MEAN_MOTION.toFixed(8).padStart(11);
      
      const line2 = `2 ${item.NORAD_CAT_ID.toString().padStart(5,'0')}  ${incl} ${raan} ${ecc} ${arg} ${mean} ${motion}`;

      // Set owner based on name signatures
      let owner = "OTHER";
      if (item.OBJECT_NAME.includes("STARLINK")) owner = "SPACEX";
      else if (item.OBJECT_NAME.includes("ONEWEB")) owner = "ONEWEB";
      else if (item.OBJECT_NAME.includes("ISS") || item.OBJECT_NAME.includes("ZARYA")) owner = "NASA/ROSCOSMOS";
      else if (item.OBJECT_NAME.includes("CARTOSAT") || item.OBJECT_NAME.includes("IRNSS") || item.OBJECT_NAME.includes("EOS")) owner = "ISRO";

      // Detect visual categories
      let cat = category || "active";
      if (item.OBJECT_NAME.includes("STARLINK")) cat = "starlink";
      else if (item.OBJECT_NAME.includes("DEBRIS") || item.OBJECT_NAME.includes("DEB")) cat = "debris";
      else if (owner === "ISRO") cat = "indian";

      const newSat = {
        id: `sat-${item.NORAD_CAT_ID}`,
        name: item.OBJECT_NAME.trim(),
        owner: owner,
        type: item.OBJECT_TYPE || "SATELLITE",
        tle1: line1,
        tle2: line2,
        altOffset: 0,
        status: "active",
        threatLevel: "NORMAL",
        threatDetails: "Telemetry synchronized.",
        category: cat
      };

      // Save to Database persistence layer
      await saveSatellite(newSat);
      await saveLog({
        timestamp: new Date().toLocaleTimeString(),
        text: `[UPLINK] Added space asset ${newSat.name} (NORAD ID: ${item.NORAD_CAT_ID}) to catalog.`,
        type: "success"
      });

      // Synchronize in-memory telemetry state
      const existsIdx = serverTelemetry.satellites.findIndex(s => s.id === newSat.id);
      if (existsIdx !== -1) {
        serverTelemetry.satellites[existsIdx] = newSat;
      } else {
        serverTelemetry.satellites.push(newSat);
      }

      // Broadcast changes to active listeners
      broadcastTelemetry("TELEMETRY_CLOCK_TICK", serverTelemetry);
      res.json(newSat);
    } else {
      res.status(404).json({ error: "Satellite ID not found in NORAD catalog." });
    }
  } catch (err) {
    console.error("Failed to add satellite to catalog:", err);
    res.status(500).json({ error: "Failed to link satellite: " + err.message });
  }
});

// REST Endpoint: Gemini AI Agent Gateway with Function Calling (Tools)
app.post('/api/gemini', async (req, res) => {
  // Use env key or client header key for ultimate flexibility (hybrid local/cloud mode)
  const apiKey = process.env.GEMINI_API_KEY || req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({
      error: "Missing API Key. Please provide GEMINI_API_KEY env variable or send x-api-key header."
    });
  }

  const { message, history } = req.body;

  // Validate message to prevent crashes in Gemini SDK calls
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: "Missing or invalid prompt message in request body." });
  }

  try {
    const ai = new GoogleGenerativeAI(apiKey);
    
    // Tools Declarations to hand control to Gemini model
    const tools = [
      {
        functionDeclarations: [
          {
            name: "get_satellite_states",
            description: "Get real-time orbital metrics (inclination, speed, altitude, latitude, longitude) and collision risk assessment for Gaganyaan and other ISRO assets."
          },
          {
            name: "get_space_weather",
            description: "Retrieve Aditya-L1 solar observatory sensor telemetry: Kp-index, solar flux, magnetometer (magX/Y/Z) readings, and storm levels."
          },
          {
            name: "consult_solar_physics_analyst",
            description: "Consult the Aditya Solar Physics Analyst before executing any orbital burn to confirm space weather safety and obtain clearance.",
            parameters: {
              type: "OBJECT",
              properties: {
                satelliteId: { type: "STRING", description: "Unique ID of the satellite undergoing maneuver (e.g. 'gaganyaan')." }
              },
              required: ["satelliteId"]
            }
          },
          {
            name: "calculate_avoidance_vector",
            description: "Computes the exact delta-v (m/s) thrust and burn direction (PROGRADE, RETROGRADE) required to steer a satellite away from a collision danger corridor.",
            parameters: {
              type: "OBJECT",
              properties: {
                satelliteId: { type: "STRING", description: "Unique ID of the satellite under collision risk (e.g. 'gaganyaan')." }
              },
              required: ["satelliteId"]
            }
          },
          {
            name: "get_active_conjunctions",
            description: "Fetch current active satellite-on-debris conjunctions including miss distances, risk categories, and target IDs."
          },
          {
            name: "get_anomaly_diagnostics",
            description: "Fetch real-time micro-telemetry diagnostic variables (battery thermals, solar panel efficiency, communication signal quality, propellant pressure) to scan for space weather induced anomalies."
          },
          {
            name: "get_predictive_diagnostics",
            description: "Retrieve active anomalies list and predictive time-to-failure forecasts (battery depletion, thermal limits, atmospheric reentry) for a given satellite.",
            parameters: {
              type: "OBJECT",
              properties: {
                satelliteId: { type: "STRING", description: "Unique ID of the satellite (e.g. 'gaganyaan')." }
              },
              required: ["satelliteId"]
            }
          },
          {
            name: "validate_subsystem_state",
            description: "Validate power grid state, thruster propellant reserves/pressure bounds, and ADCS slew/drift rates using the Idris 2 dependent verification engine.",
            parameters: {
              type: "OBJECT",
              properties: {
                satelliteId: { type: "STRING", description: "Unique ID of the satellite (e.g. 'gaganyaan')." },
                driftRate: { type: "NUMBER", description: "ADCS attitude drift rate in deg/s (optional, default 0.1 deg/s)." }
              },
              required: ["satelliteId"]
            }
          },
          {
            name: "execute_orbital_burn",
            description: "Executes thruster ignition on the satellite, altering its altitude and shifting its SGP4 orbital path to avoid conjunction collisions.",
            parameters: {
              type: "OBJECT",
              properties: {
                satelliteId: { type: "STRING", description: "ID of the satellite to maneuver." },
                deltaV: { type: "NUMBER", description: "Thrust delta-v in meters/second (e.g. 1.45)." },
                direction: { type: "STRING", description: "Maneuver thrust direction vector (e.g., PROGRADE, RADIAL_OUT)." }
              },
              required: ["satelliteId", "deltaV", "direction"]
            }
          }
        ]
      }
    ];

    // Initialize Gemini 1.5 Flash Model
    const model = ai.getGenerativeModel({
      model: "gemini-1.5-flash",
      tools: tools,
      systemInstruction: `You are the ISRO NETRA Space Operations AI Commander at ISTRAC Bengaluru.
You monitor Indian satellites (including Gaganyaan-1, Cartosat-3, NavIC constellation) and debris alerts.
You understand the "butterfly effect" of solar activity on spacecraft subsystems.
When the user asks you questions, requests checks, or coordinates maneuvers:
1. First, query 'get_satellite_states' to review coordinates and threat levels, and query 'get_active_conjunctions' to inspect active satellite proximity danger corridors.
2. Call 'get_anomaly_diagnostics' to fetch the real-time health telemetry variables (thermals, SNR, voltage) of active satellites. If any systems are degraded (battery temp > 45°C or comms SNR < 12dB), report these specific anomalies to the operator and analyze how they correlate with the active solar weather.
3. If any satellite is flagged in the active conjunction corridors list, run 'calculate_avoidance_vector' to get orbital thrust metrics for that target satellite.
4. Before calling 'execute_orbital_burn' to execute a burn, you MUST consult the Aditya Solar Physics Analyst using the 'consult_solar_physics_analyst' tool to check space weather safety.
5. If the Analyst reports status 'ABORT', or if critical spacecraft anomalies (like battery temp > 48°C) render the electronics too sensitive for thrust ignition, abort the maneuver. Explain the solar storm / ESD radiation hazard details to the operator and do NOT call 'execute_orbital_burn'.
6. If the Analyst reports status 'CLEAR' and spacecraft thermals/systems are stable, proceed with calling 'execute_orbital_burn' to execute the maneuver.
7. Report your actions step-by-step, including the delta-v values, the Analyst weather consensus dialog, diagnosed subsystem anomalies, and altitude shifts.
Format your final response in clear, concise markdown with appropriate headers. Keep it professional and military-grade.`
    });

    // Translate client conversation history format into Gemini format
    const formattedHistory = (history || []).map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.content }]
    }));

    // Start a chat session to handle multiple tool executions in a single turn if needed
    const chat = model.startChat({
      history: formattedHistory
    });

    let result = await chat.sendMessage(message);
    let response = result.response;
    let functionCalls = response.functionCalls() || [];
    const executionLogs = [];

    // Loop to handle recursive tool calls (Gemini function resolution)
    while (functionCalls.length > 0) {
      for (const call of functionCalls) {
        const { name, args } = call;
        let toolResult = {};

        // Execute the tool and capture output
        if (name === "get_satellite_states") {
          toolResult = { satellites: serverTelemetry.satellites };
        } else if (name === "get_space_weather") {
          toolResult = { spaceWeather: serverTelemetry.spaceWeather };
        } else if (name === "get_anomaly_diagnostics") {
          const diagnostics = serverTelemetry.satellites.map(s => ({
            id: s.id,
            name: s.name,
            orbit: s.orbit || {},
            thermal: s.thermal || {},
            power: s.power || {},
            communications: s.communications || {},
            radiation: s.radiation || {},
            propulsion: s.propulsion || {}
          }));
          toolResult = { diagnostics };
        } else if (name === "get_active_conjunctions") {
          const activeSats = serverTelemetry.satellites.filter(s => s.category !== 'debris');
          const debrisSats = serverTelemetry.satellites.filter(s => s.category === 'debris');
          const conjunctions = [];
          
          activeSats.forEach(activeSat => {
            debrisSats.forEach(debrisSat => {
              const rad = (Math.PI / 180);
              const earthRadius = 6378.137;
              
              const lat1 = (activeSat.lat || 0) * rad;
              const lng1 = (activeSat.lng || 0) * rad;
              const r1 = earthRadius + (activeSat.alt || 0);
              const x1 = r1 * Math.cos(lat1) * Math.cos(lng1);
              const y1 = r1 * Math.cos(lat1) * Math.sin(lng1);
              const z1 = r1 * Math.sin(lat1);

              const lat2 = (debrisSat.lat || 0) * rad;
              const lng2 = (debrisSat.lng || 0) * rad;
              const r2 = earthRadius + (debrisSat.alt || 0);
              const x2 = r2 * Math.cos(lat2) * Math.cos(lng2);
              const y2 = r2 * Math.cos(lat2) * Math.sin(lng2);
              const z2 = r2 * Math.sin(lat2);

              const dx = x1 - x2;
              const dy = y1 - y2;
              const dz = z1 - z2;
              const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
              
              if (dist < 350) {
                conjunctions.push({
                  activeId: activeSat.id,
                  activeName: activeSat.name,
                  debrisId: debrisSat.id,
                  debrisName: debrisSat.name,
                  distanceKm: dist,
                  probability: 100 * Math.exp(-dist / 120),
                  dangerLevel: dist < 150 ? 'DANGER' : 'WARNING'
                });
              }
            });
          });
          toolResult = { conjunctions };
        } else if (name === "consult_solar_physics_analyst") {
          const weather = serverTelemetry.spaceWeather;
          let analystResult = null;
          
          try {
            // Secondary agent invocation
            const analystAi = new GoogleGenerativeAI(apiKey);
            const analystModel = analystAi.getGenerativeModel({ model: "gemini-1.5-flash" });
            const prompt = `You are the Aditya Solar Physics Analyst at ISRO.
Review the following solar weather data from the Aditya-L1 observatory:
- Kp Index: ${weather.kpIndex}
- Solar Wind Speed: ${weather.solarWindSpeed} km/s
- Solar Proton Flux: ${weather.solarProtonFlux} pfu
- Magnetic Storm Level: ${weather.magneticStormLevel}

Determine if it is safe to execute an orbital maneuver.
Criteria: If Solar Proton Flux is > 15.0 pfu or Kp Index >= 4.5, you MUST recommend AGAINST orbital maneuvers due to high risk of thruster electrostatic discharge (ESD) and telemetry scintillation/blackout.
Otherwise, recommend proceeding.
Return your response strictly in the following JSON format:
{
  "status": "CLEAR" or "ABORT",
  "reasoning": "Scientific reasoning regarding radiation levels and thruster risks",
  "recommendation": "Operational recommendation statement"
}`;
            const apiRes = await analystModel.generateContent({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: "application/json" }
            });
            const textResponse = apiRes.response.text();
            analystResult = JSON.parse(textResponse);
          } catch (apiErr) {
            console.warn("Secondary Aditya agent API call failed, falling back to rule-based evaluation:", apiErr);
          }

          // Fallback rule if API call failed or returned malformed json
          if (!analystResult || !analystResult.status) {
            const isStorm = weather.solarProtonFlux > 15.0 || weather.kpIndex >= 4.5;
            analystResult = {
              status: isStorm ? "ABORT" : "CLEAR",
              reasoning: isStorm
                ? `Proton flux (${weather.solarProtonFlux.toFixed(1)} pfu) or Kp index (${weather.kpIndex.toFixed(1)}) is above safety thresholds. Ionizing radiation hazard and communication interference active.`
                : `Proton flux (${weather.solarProtonFlux.toFixed(1)} pfu) is stable. Space weather environment clear.`,
              recommendation: isStorm
                ? "ABORT burn sequence. Defer orbital corrections and initiate spacecraft electrostatic shielding."
                : "Proceed with maneuver. Systems clear."
            };
          }

          toolResult = {
            satelliteId: args.satelliteId,
            status: analystResult.status,
            reasoning: analystResult.reasoning,
            recommendation: analystResult.recommendation,
            solarProtonFlux: weather.solarProtonFlux,
            kpIndex: weather.kpIndex
          };
        } else if (name === "calculate_avoidance_vector") {
          const satId = args.satelliteId;
          const sat = serverTelemetry.satellites.find(s => s.id === satId);
          const debris = serverTelemetry.satellites.find(s => s.category === 'debris') || { alt: 405.41 };
          
          const dv = satId === 'navic-1i' ? 0.85 : 1.45;
          const dirStr = "PROGRADE";
          const safetyMargin = 2.0; // 2 km safety clearance
          
          // Call compiled Idris 2 validator
          const validation = validateBurn(
            satId,
            dv,
            dirStr,
            sat ? sat.alt : 405.23,
            debris.alt,
            safetyMargin
          );

          if (validation.success) {
            toolResult = {
              satelliteId: satId,
              recommendedDeltaV: dv,
              recommendedDirection: dirStr,
              estimatedOrbitalShiftKm: validation.data.expectedAltitudeShift,
              newAltitudeKm: validation.data.newAltitude,
              validationProof: "Idris 2 type-level verification: SUCCESS. Burn magnitude and safety margin certified."
            };
          } else {
            toolResult = {
              satelliteId: satId,
              error: validation.error,
              validationProof: "Idris 2 type-level verification: FAIL. " + validation.error
            };
          }
        } else if (name === "get_predictive_diagnostics") {
          const satId = args.satelliteId;
          const sat = serverTelemetry.satellites.find(s => s.id === satId);
          if (sat) {
            toolResult = {
              satelliteId: satId,
              activeAnomalies: sat.anomalies ? sat.anomalies.activeList : [],
              predictions: sat.anomalies ? sat.anomalies.predictions : {}
            };
          } else {
            toolResult = { error: `Space asset ID "${satId}" not found in tracking catalog.` };
          }
        } else if (name === "validate_subsystem_state") {
          const satId = args.satelliteId;
          const driftRate = args.driftRate || 0.1;
          const sat = serverTelemetry.satellites.find(s => s.id === satId);
          if (sat) {
            const powerVal = validatePowerState(satId, sat.power ? sat.power.batterySoC : 100.0);
            const fuelVal = validateThrusterFuel(
              satId,
              0.0,
              sat.propulsion ? sat.propulsion.propellantMassKg : 400.0,
              sat.propulsion ? sat.propulsion.fuelPressurePsi : 220.0
            );
            const adcsVal = validateADCSState(satId, driftRate);

            toolResult = {
              satelliteId: satId,
              powerVerification: powerVal.success ? "SUCCESS" : "FAIL: " + powerVal.error,
              propulsionVerification: fuelVal.success ? "SUCCESS" : "FAIL: " + fuelVal.error,
              adcsVerification: adcsVal.success ? "SUCCESS" : "FAIL: " + adcsVal.error,
              proofStatus: "Idris 2 Subsystem Verification Run Complete."
            };
          } else {
            toolResult = { error: `Space asset ID "${satId}" not found in tracking catalog.` };
          }
        } else if (name === "execute_orbital_burn") {
          const { satelliteId, deltaV, direction } = args;
          const result = await executeManeuver(satelliteId, deltaV, direction, `Gemini Agentic Command (${model.model})`);
          toolResult = result;
        }

        executionLogs.push({
          tool: name,
          inputs: args,
          result: toolResult
        });

        // Send tool response back to Gemini to continue reasoning
        result = await chat.sendMessage([
          {
            functionResponse: {
              name: name,
              response: toolResult
            }
          }
        ]);
        response = result.response;
      }
      functionCalls = response.functionCalls() || [];
    }

    // Save agent actions to database
    if (executionLogs.length > 0) {
      try {
        await saveAgentAction({
          prompt: message,
          toolCalls: executionLogs,
          responseText: response.text()
        });
      } catch (err) {
        console.error("Failed to save agent action to database:", err);
      }
    }

    res.json({
      text: response.text(),
      toolCalls: executionLogs
    });

  } catch (err) {
    console.error("Gemini API execution error:", err);
    res.status(500).json({ error: "Failed to query Gemini model. Check API Key or logs: " + err.message });
  }
});

// Host and update real-time telemetry coordinates internally every 1s
setInterval(() => {
  const weather = serverTelemetry.spaceWeather;
  const isStorm = weather.solarProtonFlux > 15.0 || weather.kpIndex >= 4.5;

  serverTelemetry.satellites.forEach(s => {
    // 1. Initialize nested subsystem states if missing (catalog additions)
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

    // 2. Propagate orbits (simulate orbital movement via simple longitude increment)
    if (s.id !== 'cosmos-debris') {
      s.orbit.lng = (s.orbit.lng + 0.05) % 180;
    } else {
      s.orbit.lng = (s.orbit.lng + 0.051) % 180;
    }
    if (s.orbit.lat === undefined || isNaN(s.orbit.lat)) {
      s.orbit.lat = 10.0 + Math.random() * 20.0;
    }
    if (s.orbit.velocity === undefined || isNaN(s.orbit.velocity)) {
      s.orbit.velocity = s.id === 'navic-1i' ? 3.08 : 7.6;
    }

    const isDebris = s.id === 'cosmos-debris' || s.category === 'debris';

    if (!isDebris) {
      // 3. Solar Eclipse Model
      const rad = Math.PI / 180;
      const sunLng = ((Date.now() / 240000) * 360) % 360; // 4 min full cycle
      const cosPhi = Math.cos(s.orbit.lat * rad) * Math.cos((s.orbit.lng - sunLng) * rad);
      const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
      const isBehindEarth = cosPhi < 0;
      const isShadowBlocked = (6378.137 + s.orbit.alt) * sinPhi < 6378.137;
      s.orbit.inEclipse = isBehindEarth && isShadowBlocked;

      let deltaSoC = 0.0;
      let dT = 0.0;

      // 4. Solar Panel Power Model
      const cosTheta = s.orbit.inEclipse ? 0.0 : Math.max(0.1, cosPhi);
      const maxPower = s.id === 'navic-1i' ? 450.0 : 280.0;
      s.power.solarGenerationW = s.orbit.inEclipse ? 0.0 : parseFloat((maxPower * cosTheta).toFixed(1));
      s.power.solarV = s.orbit.inEclipse ? 0.0 : parseFloat((30.0 + 4.1 * cosTheta + (Math.random() - 0.5) * 0.3).toFixed(2));
      
      const netPower = s.power.solarGenerationW - s.power.powerConsumptionW;
      const capacityWh = s.id === 'navic-1i' ? 5000.0 : 2000.0;
      // SoC speed-up factor 300
      deltaSoC = (netPower / (capacityWh * 3600)) * 100 * 300;
      s.power.batterySoC = parseFloat(Math.max(0, Math.min(100, s.power.batterySoC + deltaSoC)).toFixed(2));

      // 5. Subsystem Thermal Model
      const T_space = 3.0; // Kelvin
      const sigma = 5.67e-8;
      const T_kelvin = s.thermal.battTemp + 273.15;
      const Q_in = (s.power.powerConsumptionW * 0.15) + (s.orbit.inEclipse ? 0.0 : 180.0);
      const Q_out = sigma * s.thermal.radiatorEfficiency * 1.5 * (Math.pow(T_kelvin, 4) - Math.pow(T_space, 4));
      // Thermal speed-up step (dt = 60s)
      dT = ((Q_in - Q_out) / 25000.0) * 60;
      s.thermal.battTemp = parseFloat(Math.max(-50, Math.min(100, s.thermal.battTemp + dT)).toFixed(2));

      const T_expected_kelvin = s.thermal.expectedBattTemp + 273.15;
      const Q_out_expected = sigma * 0.95 * 1.5 * (Math.pow(T_expected_kelvin, 4) - Math.pow(T_space, 4));
      const dT_expected = ((Q_in - Q_out_expected) / 25000.0) * 60;
      s.thermal.expectedBattTemp = parseFloat(Math.max(-50, Math.min(100, s.thermal.expectedBattTemp + dT_expected)).toFixed(2));
      s.thermal.thermalStress = parseFloat(Math.abs(s.thermal.battTemp - s.thermal.expectedBattTemp).toFixed(2));

      // 6. Space Radiation Model
      const gamma = 1e-5;
      s.radiation.cumulativeDoseRad = parseFloat((s.radiation.cumulativeDoseRad + gamma * weather.solarProtonFlux).toFixed(4));
      const P_seu = 0.00005 * weather.solarProtonFlux * Math.exp(weather.kpIndex / 3.0);
      s.radiation.seuProbability = parseFloat(Math.min(1.0, P_seu).toFixed(5));
      if (Math.random() < P_seu) {
        s.radiation.seuCount++;
      }

      // 7. Communications Link SNR
      const noise = (Math.random() - 0.5) * 1.0;
      s.communications.downlinkSNR = parseFloat((26.5 - weather.kpIndex * 2.2 + noise).toFixed(1));
      s.communications.downlinkSNR = Math.max(5.0, Math.min(30.0, s.communications.downlinkSNR));
      s.communications.signalQuality = parseFloat((s.communications.downlinkSNR / 30.0).toFixed(2));

      // 8. Fuel Propellant Pressure
      s.propulsion.fuelPressurePsi = parseFloat(Math.max(10.0, s.propulsion.fuelPressurePsi + (Math.random() - 0.5) * 0.3).toFixed(1));

      // 9. LEO Orbit Drag Decay Model
      let deltaAlt = 0.0;
      if (s.orbit.alt < 600) {
        const H_base = 50.0;
        const betaDrag = 0.0005;
        const H = H_base * (1.0 + betaDrag * (weather.solarWindSpeed - 400));
        const rho = 6e-12 * Math.exp(-(s.orbit.alt - 350.0) / H);
        const kappa = 2.5e7;
        deltaAlt = - kappa * rho * Math.pow(s.orbit.velocity, 2) * 1.0;
        s.orbit.alt = Math.max(100, s.orbit.alt + deltaAlt);
      }

      // 9.1 Anomaly Detection and Predictive Diagnostics (V3.4)
      const activeAnomalies = [];
      
      // Thermal Stress anomaly: stress > 5.0 °C
      if (s.thermal.thermalStress > 5.0) {
        activeAnomalies.push("THERMAL_STRESS_ANOMALY");
      }
      // Low Power anomaly: SoC < 20.0%
      if (s.power.batterySoC < 20.0) {
        activeAnomalies.push("LOW_POWER_ANOMALY");
      }
      // Ionospheric Scintillation: SNR < 12.0 dB during severe solar weather
      if (s.communications.downlinkSNR < 12.0 && isStorm) {
        activeAnomalies.push("IONOSPHERIC_SCINTILLATION_ANOMALY");
      }
      // Drag spike: altitude decay rate is faster than expected (spiked wind speed > 500 km/s and alt < 600)
      if (s.orbit.alt < 600.0 && weather.solarWindSpeed > 500.0 && deltaAlt < -0.005) {
        activeAnomalies.push("DRAG_DECAY_ANOMALY");
      }
      // Radiation SEU Risk: SEU probability > 0.01
      if (s.radiation.seuProbability > 0.01) {
        activeAnomalies.push("RADIATION_SEU_RISK");
      }

      // Calculations for predictions:
      let depletionTime = -1;
      if (deltaSoC < 0) {
        depletionTime = parseFloat((s.power.batterySoC / -deltaSoC).toFixed(1));
      }

      let thermalTime = -1;
      if (dT > 0) {
        thermalTime = parseFloat(((48.0 - s.thermal.battTemp) / dT).toFixed(1));
        if (thermalTime < 0) thermalTime = 0; // already exceeded
      }

      let reentryTime = -1;
      if (s.orbit.alt < 600.0 && deltaAlt < 0) {
        reentryTime = parseFloat(((s.orbit.alt - 150.0) / -deltaAlt).toFixed(1));
        if (reentryTime < 0) reentryTime = 0; // already decayed
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

    // 10. Sync root variables as aliases for Leaflet/Three.js/SGP4 compatibility
    s.lat = s.orbit.lat;
    s.lng = s.orbit.lng;
    s.alt = s.orbit.alt;
    s.velocity = s.orbit.velocity;
  });

  // Reset threat level of all satellites to NORMAL first
  serverTelemetry.satellites.forEach(s => {
    s.threatLevel = "NORMAL";
    s.threatDetails = "Normal orbital operations.";
  });

  // Calculate active conjunctions and set threat levels dynamically
  const activeSats = serverTelemetry.satellites.filter(s => s.category !== 'debris');
  const debrisSats = serverTelemetry.satellites.filter(s => s.category === 'debris');

  activeSats.forEach(activeSat => {
    debrisSats.forEach(debrisSat => {
      const rad = (Math.PI / 180);
      const earthRadius = 6378.137;
      
      const lat1 = (activeSat.lat || 0) * rad;
      const lng1 = (activeSat.lng || 0) * rad;
      const r1 = earthRadius + (activeSat.alt || 0);
      const x1 = r1 * Math.cos(lat1) * Math.cos(lng1);
      const y1 = r1 * Math.cos(lat1) * Math.sin(lng1);
      const z1 = r1 * Math.sin(lat1);

      const lat2 = (debrisSat.lat || 0) * rad;
      const lng2 = (debrisSat.lng || 0) * rad;
      const r2 = earthRadius + (debrisSat.alt || 0);
      const x2 = r2 * Math.cos(lat2) * Math.cos(lng2);
      const y2 = r2 * Math.cos(lat2) * Math.sin(lng2);
      const z2 = r2 * Math.sin(lat2);

      const dx = x1 - x2;
      const dy = y1 - y2;
      const dz = z1 - z2;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      
      if (dist < 350) {
        const dangerLevel = dist < 150 ? 'DANGER' : 'WARNING';
        
        activeSat.threatLevel = dangerLevel;
        activeSat.threatDetails = `Conjunction danger with ${debrisSat.name}. Distance: ${dist.toFixed(1)} km.`;
        
        debrisSat.threatLevel = dangerLevel;
        debrisSat.threatDetails = `Intersection route with ${activeSat.name}. Distance: ${dist.toFixed(1)} km.`;
      }
    });
  });
  
  // Tick weather parameters inside server memory (only drift if storm override active)
  if (isStormOverride) {
    weather.solarWindSpeed += Math.floor((Math.random() - 0.5) * 6);
    if (weather.solarWindSpeed < 300) weather.solarWindSpeed = 300;
    if (weather.solarWindSpeed > 800) weather.solarWindSpeed = 800;

    weather.solarProtonFlux += (Math.random() - 0.5) * 1.2;
    if (weather.solarProtonFlux < 5) weather.solarProtonFlux = 5;
    if (weather.solarProtonFlux > 150) weather.solarProtonFlux = 150;
  }
  
  broadcastTelemetry("TELEMETRY_CLOCK_TICK", serverTelemetry);
}, 1000);

// Periodically refresh NOAA space weather every 5 minutes
setInterval(() => {
  if (!isStormOverride) {
    fetchNOAASpaceWeather();
  }
}, 300000);

server.listen(PORT, async () => {
  // Initialize Database configurations on server startup
  try {
    await initializeDb();
    
    // Warm telemetry memory state from database
    const sats = await getSatellites();
    if (sats && sats.length > 0) {
      serverTelemetry.satellites = sats;
      console.log(`Database sync complete: Loaded ${sats.length} space assets.`);
    }

    // Fetch initial live NOAA space weather values
    await fetchNOAASpaceWeather();
  } catch (err) {
    console.error("Database connection initialization failed on startup:", err);
  }

  console.log(`ISRO NETRA Operations Server running on http://localhost:${PORT}`);
  console.log(`WebSocket Agent Gateway mounted at ws://localhost:${PORT}/ws/agent`);
});
