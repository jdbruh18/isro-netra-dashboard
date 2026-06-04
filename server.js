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
      threatDetails: "Intersection route with Gaganyaan capsule."
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
      threatDetails: "Imaging payload operational."
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
      threatDetails: "NavIC atomic clock synchronization stable."
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

  // Calculate altitude adjustment (1 m/s delta-v shifts orbit semi-major axis roughly by 1.8km in LEO)
  const shiftMultiplier = sat.alt > 1000 ? 15 : 1.8;
  const altShift = deltaV * shiftMultiplier;
  
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
3. Then, call 'execute_orbital_burn' to maneuver the satellite and save the vehicle.
4. Report your actions step-by-step, including the delta-v values and altitude shifts.
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
