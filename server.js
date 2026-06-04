import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDb, getSatellites, saveSatellite, saveLog, saveAgentAction } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

app.use(express.json());
app.use(express.static(__dirname));

// Default port for Google Cloud Run is 8080
const PORT = process.env.PORT || 8080;

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
      burnAdjustments: { alt: 0 } // Tracks delta-V shifts
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
      category: "debris"
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
      category: "indian"
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
      category: "indian"
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
        serverTelemetry.spaceWeather.solarProtonFlux = parseFloat(solarProtonFlux);
        if (kpIndex !== undefined) serverTelemetry.spaceWeather.kpIndex = parseFloat(kpIndex);
        if (magneticStormLevel !== undefined) serverTelemetry.spaceWeather.magneticStormLevel = magneticStormLevel;
        
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

  // Calculate altitude adjustment (1 m/s delta-v shifts orbit semi-major axis roughly by 1.8km in LEO)
  const shiftMultiplier = sat.alt > 1000 ? 15 : 1.8;
  const altShift = parsedDeltaV * shiftMultiplier;
  
  if (!sat.burnAdjustments) sat.burnAdjustments = { alt: 0 };
  sat.burnAdjustments.alt += altShift;
  sat.alt += altShift;
  sat.threatLevel = "NORMAL";
  sat.threatDetails = `Orbit corrected by ${altShift.toFixed(2)}km. Collision risk mitigated.`;

  const details = `Maneuver executed: ${direction} burn of ${deltaV} m/s. Orbit adjusted by +${altShift.toFixed(2)}km.`;
  
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
When the user asks you questions or requests checks:
1. First, query 'get_satellite_states' to review coordinates and danger flags.
2. If any satellite has a threat level of 'WARNING' or 'DANGER', immediately run 'calculate_avoidance_vector' to get orbital thrust metrics.
3. Before calling 'execute_orbital_burn' to execute a burn, you MUST consult the Aditya Solar Physics Analyst using the 'consult_solar_physics_analyst' tool to check space weather safety.
4. If the Analyst reports status 'ABORT', you MUST abort the maneuver. Explain the Aditya-L1 solar storm / ESD radiation hazard details to the operator and do NOT call 'execute_orbital_burn'.
5. If the Analyst reports status 'CLEAR', proceed with calling 'execute_orbital_burn' to execute the maneuver.
6. Report your actions step-by-step, including the delta-v values, the Analyst weather consensus dialog, and altitude shifts.
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
          const isLeo = satId === 'gaganyaan' || satId === 'cosmos-debris';
          toolResult = {
            satelliteId: satId,
            recommendedDeltaV: isLeo ? 1.45 : 0.85,
            recommendedDirection: "PROGRADE",
            estimatedOrbitalShiftKm: isLeo ? 2.61 : 12.75
          };
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
  // Simulates small movements or tracks real SGP4 values when frontend streams them
  // Keep values updated inside server memory
  serverTelemetry.satellites.forEach(s => {
    if (s.id !== 'cosmos-debris') {
      s.lng = (s.lng + 0.05) % 180;
    } else {
      s.lng = (s.lng + 0.051) % 180; // Debris moves slightly faster to simulate intersection
    }
  });
  
  // Tick weather parameters inside server memory
  serverTelemetry.spaceWeather.solarWindSpeed += Math.floor((Math.random() - 0.5) * 6);
  serverTelemetry.spaceWeather.solarProtonFlux = 10 + Math.random() * 8;
  
  broadcastTelemetry("TELEMETRY_CLOCK_TICK", serverTelemetry);
}, 1000);

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
  } catch (err) {
    console.error("Database connection initialization failed on startup:", err);
  }

  console.log(`ISRO NETRA Operations Server running on http://localhost:${PORT}`);
  console.log(`WebSocket Agent Gateway mounted at ws://localhost:${PORT}/ws/agent`);
});
