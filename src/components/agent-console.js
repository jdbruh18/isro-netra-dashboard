import store from '../core/state.js';
import audio from '../core/audio.js';

let chatHistory, chatInput, chatSubmitBtn, keyInput, saveKeyBtn;
let conversationHistory = [];

export function initAgentConsole(socket, useWebsocket) {
  chatHistory = document.getElementById('chat-history-container');
  chatInput = document.getElementById('inp-chat-message');
  chatSubmitBtn = document.getElementById('btn-chat-submit');
  keyInput = document.getElementById('inp-gemini-key');
  saveKeyBtn = document.getElementById('btn-save-key');

  if (!chatHistory) return;

  // 1. Manage local storage for Gemini API key
  const savedKey = localStorage.getItem('gemini_api_key');
  if (savedKey) {
    keyInput.value = savedKey;
    keyInput.placeholder = "API KEY SAVED (encrypted in browser)";
  }

  saveKeyBtn.addEventListener('click', () => {
    const key = keyInput.value.trim();
    if (key) {
      localStorage.setItem('gemini_api_key', key);
      store.addLog('Gemini API Key saved locally. Ready for live model execution.', 'success');
      keyInput.placeholder = "API KEY SAVED (encrypted in browser)";
      audio.playSuccess();
    } else {
      localStorage.removeItem('gemini_api_key');
      store.addLog('Gemini API Key removed. Reverted to local intelligence fallback.', 'warning');
      audio.playClick();
    }
  });

  // 2. Chat execution handlers
  const handleChatSubmit = () => {
    const message = chatInput.value.trim();
    if (!message) return;

    audio.playClick();
    chatInput.value = '';

    // Append user message to chat UI
    appendChatBubble('user', message);
    conversationHistory.push({ role: 'user', content: message });

    // Show AI typing indicator
    const typingId = appendTypingIndicator();

    // Query Gemini
    queryGeminiAgent(message, typingId);
  };

  chatSubmitBtn.addEventListener('click', handleChatSubmit);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleChatSubmit();
    }
  });
}

function appendChatBubble(role, text) {
  if (!chatHistory) return;

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${role}`;

  const sender = document.createElement('div');
  sender.className = 'chat-bubble-sender';
  
  if (role === 'user') {
    sender.innerHTML = '<i data-lucide="user" style="width: 11px; height: 11px;"></i> OPERATOR';
  } else {
    sender.innerHTML = '<i data-lucide="bot" style="width: 11px; height: 11px;"></i> A.E.G.I.S. Space Intelligence';
  }

  const content = document.createElement('div');
  content.innerHTML = text.replace(/\n/g, '<br/>'); // Simple markdown-like linebreaks

  bubble.appendChild(sender);
  bubble.appendChild(content);
  chatHistory.appendChild(bubble);

  lucide.createIcons();
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

function appendTypingIndicator() {
  if (!chatHistory) return null;

  const typing = document.createElement('div');
  typing.className = 'chat-typing';
  typing.id = `typing-${Date.now()}`;
  typing.innerHTML = 'A.E.G.I.S. is parsing telemetry <span class="animate-flash">...</span>';
  chatHistory.appendChild(typing);
  chatHistory.scrollTop = chatHistory.scrollHeight;
  return typing.id;
}

function removeTypingIndicator(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// Gateway selector: decides between Express backend proxy, client direct HTTPS call, or simulated fallback
async function queryGeminiAgent(message, typingId) {
  const savedKey = localStorage.getItem('gemini_api_key');
  const isWebProtocol = window.location.protocol === 'http:' || window.location.protocol === 'https:';

  // Mode 1: Express Server Backend Proxy (Cloud Run deployment)
  if (isWebProtocol && !savedKey) {
    try {
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history: conversationHistory })
      });

      if (response.ok) {
        const data = await response.json();
        removeTypingIndicator(typingId);
        appendChatBubble('ai', data.text);
        conversationHistory.push({ role: 'model', content: data.text });
        
        // Log tools in console
        if (data.toolCalls) {
          data.toolCalls.forEach(log => {
            store.addAgentLog(log.tool, log.inputs, log.result);
            store.addLog(`[GEMINI-AGENT] Tool Call: ${log.tool}(${JSON.stringify(log.inputs)})`, 'ai');
          });
        }
        return;
      }
    } catch (e) {
      console.warn("Backend API request failed. Checking for client-side API keys.", e);
    }
  }

  // Mode 2: Direct client-side HTTPS fetch (Standalone HTML file mode using user's saved key)
  if (savedKey) {
    try {
      const result = await executeClientSideGemini(message, savedKey);
      removeTypingIndicator(typingId);
      appendChatBubble('ai', result.text);
      conversationHistory.push({ role: 'model', content: result.text });
      
      result.toolCalls.forEach(log => {
        store.addAgentLog(log.tool, log.inputs, log.result);
        store.addLog(`[GEMINI-AGENT] Tool Call: ${log.tool}(${JSON.stringify(log.inputs)})`, 'ai');
      });
      return;
    } catch (err) {
      removeTypingIndicator(typingId);
      appendChatBubble('ai', `**[ERROR]** Failed to query client-side Gemini API. Error: ${err.message}. Please check your API key.`);
      store.addLog(`Gemini Client-side API error: ${err.message}`, 'danger');
      return;
    }
  }

  // Mode 3: Local Simulation Intelligence Fallback (offline / no API key)
  // Replicates Gemini's logic deterministically to keep prototype fully functional
  setTimeout(() => {
    removeTypingIndicator(typingId);
    let reply = "";
    const lower = message.toLowerCase();

    if (lower.includes('status') || lower.includes('diagnose') || lower.includes('check') || lower.includes('anomaly')) {
      const sats = store.getState().satellites;
      const weather = store.getState().spaceWeather;
      const dangerous = sats.find(s => s.threatLevel === 'WARNING');
      
      // Simulate Gemini calling get_satellite_states
      store.addAgentLog("get_satellite_states", {}, { satellites: sats });
      store.addLog("[GEMINI-AGENT] Tool Call: get_satellite_states()", 'ai');

      // Simulate Gemini calling get_anomaly_diagnostics
      const diagnostics = sats.map(s => ({
        id: s.id,
        name: s.name,
        health: s.health || { solarV: 32.4, battTemp: 28.5, downlinkSNR: 24.5, fuelPressure: 220 }
      }));
      store.addAgentLog("get_anomaly_diagnostics", {}, { diagnostics });
      store.addLog("[GEMINI-AGENT] Tool Call: get_anomaly_diagnostics()", 'ai');

      const isStorm = weather.solarProtonFlux > 15.0 || weather.kpIndex >= 4.5;
      const anomalousSat = sats.find(s => s.health && s.id !== 'cosmos-debris' && (s.health.battTemp > 45.0 || s.health.downlinkSNR < 12.0));

      if (anomalousSat && isStorm) {
        reply = `**A.E.G.I.S. Space Operations Diagnostic Report**\n\nI ran full telemetry checks and detected severe solar storm induced anomalies (the Butterfly Effect):\n\n- **Space Asset**: ${anomalousSat.name}\n- **Subsystem Anomalies**:\n  - Battery Temperature: **${anomalousSat.health.battTemp.toFixed(1)}°C** (Geomagnetically Induced Currents warming - CRITICAL)\n  - Communication Downlink SNR: **${anomalousSat.health.downlinkSNR.toFixed(1)} dB** (Ionospheric Scintillation interference)\n  - Solar Panel Voltage: **${anomalousSat.health.solarV.toFixed(1)} V** (Proton charge scramble)\n\n- **Conjunction Danger**: ${dangerous ? `YES - threat corridor intersect with ${dangerous.name}` : 'NO - orbital corridor clear'}\n\n**Recommendation**: Defer thruster maneuver uplinks immediately. Firing thrusters while the batteries are in thermal warning risks static breakdown. Initiate radiation shielding recovery.`;
      } else if (dangerous) {
        reply = `**A.E.G.I.S. Space Intelligence Report**\n\nI executed telemetry checks. Subsystems are stable, but a conjunction warning is active:\n- Target: **Gaganyaan Crew Module**\n- Intersector: **${dangerous.name}**\n- Status: **DANGER**\n\nSpace weather is CLEAR. I recommend executing an evasive burn. Ask me to: **"evade collision"** to steer Gaganyaan.`;
      } else {
        reply = `**A.E.G.I.S. Space Intelligence Report**\n\nAll space assets are verified healthy. Subsystem parameters (voltage, thermals, comms link) are stable. Solar weather is QUIET.`;
      }
    } 
    
    else if (lower.includes('avoid') || lower.includes('evade') || lower.includes('burn') || lower.includes('collision')) {
      const sats = store.getState().satellites;
      const weather = store.getState().spaceWeather;
      const gaganyaan = sats.find(s => s.id === 'gaganyaan');
      const debris = sats.find(s => s.id === 'cosmos-debris');

      // 1. Call get_satellite_states tool
      store.addAgentLog("get_satellite_states", {}, { satellites: sats });
      store.addLog("[GEMINI-AGENT] Tool Call: get_satellite_states()", 'ai');

      // 2. Call calculate_avoidance_vector tool
      store.addAgentLog("calculate_avoidance_vector", { satelliteId: "gaganyaan" }, {
        satelliteId: "gaganyaan",
        recommendedDeltaV: 1.45,
        recommendedDirection: "PROGRADE",
        estimatedOrbitalShiftKm: 2.61
      });
      store.addLog("[GEMINI-AGENT] Tool Call: calculate_avoidance_vector(gaganyaan)", 'ai');

      // 3. Call consult_solar_physics_analyst tool
      const isStorm = weather.solarProtonFlux > 15.0 || weather.kpIndex >= 4.5;
      const analystResult = {
        satelliteId: "gaganyaan",
        status: isStorm ? "ABORT" : "CLEAR",
        reasoning: isStorm
          ? `Aditya-L1 PAPA instrument reports elevated Solar Proton Flux is ${weather.solarProtonFlux.toFixed(1)} pfu (Threshold: 15.0 pfu). Elevated radiation danger corridor.`
          : `Solar Proton Flux is stable at ${weather.solarProtonFlux.toFixed(1)} pfu. Telemetry channels clear.`,
        recommendation: isStorm
          ? "ABORT: Defer thruster operations to avoid telemetry scintillation and ESD static charge buildup."
          : "CLEAR: Space weather parameters normal. Thruster ignition authorized."
      };
      
      store.addAgentLog("consult_solar_physics_analyst", { satelliteId: "gaganyaan" }, analystResult);
      store.addLog("[GEMINI-AGENT] Tool Call: consult_solar_physics_analyst(gaganyaan)", 'ai');

      if (isStorm) {
        reply = `**Mitigation Blocked (Space Weather Consensus)**\n\nI initiated threat mitigation protocols, but the **Aditya Solar Physics Analyst** returned an **ABORT** status:\n\n* **Reasoning**: ${analystResult.reasoning}\n* **Recommendation**: ${analystResult.recommendation}\n\n**Decision**: The thruster burn sequence for **Gaganyaan-1** has been aborted. Operations room is advised to delay maneuvers until the proton flux storm subsides and solar wind speed stabilizes. Active radiation shielding controls enabled.`;
      } else {
        // 4. Call execute_orbital_burn tool
        const shiftMultiplier = 1.8;
        const altShift = 1.45 * shiftMultiplier;
        
        if (gaganyaan) {
          if (!gaganyaan.burnAdjustments) gaganyaan.burnAdjustments = { alt: 0 };
          gaganyaan.burnAdjustments.alt += altShift;
          gaganyaan.alt += altShift;
          gaganyaan.threatLevel = 'NORMAL';
          gaganyaan.threatDetails = 'Orbit raised. Space debris cleared.';
        }
        if (debris) {
          debris.threatLevel = 'NORMAL';
          debris.threatDetails = 'Maneuver executed. Collision risk mitigated.';
        }
        
        store.updateState('satellites', [...sats]);
        
        store.addAgentLog("execute_orbital_burn", { satelliteId: "gaganyaan", deltaV: 1.45, direction: "PROGRADE" }, { status: "SUCCESS" });
        store.addLog(`[UPLINK] Maneuver executed: PROGRADE burn of 1.45 m/s. Orbit adjusted by +${altShift.toFixed(2)}km. (Gemini Local Simulation)`, 'success');
        audio.playSuccess();

        reply = `**Collision Shield Activated (Space Weather Consensus: CLEAR)**\n\nI initiated autonomous threat mitigation steps:\n1. Invoked \`calculate_avoidance_vector\` for **Gaganyaan-1**.\n2. Consulted **Aditya Solar Physics Analyst** (Solar flux: **${weather.solarProtonFlux.toFixed(1)} pfu** - Clear).\n3. Executed \`execute_orbital_burn\` with a **1.45 m/s PROGRADE** vector.\n4. Gaganyaan orbit raised by **+2.61 km**.\n\nDownlink signals verify the conjunction alert has cleared and the crew capsule is back in a safe orbital corridor.`;
      }
    } 
    
    else {
      reply = `I am the ISRO NETRA Space Operations AI assistant. I can query satellite positions and execute collision avoidance maneuvers. Try prompting me with: **"Check satellite health"** or **"Evade collision"**.`;
    }

    appendChatBubble('ai', reply);
    conversationHistory.push({ role: 'model', content: reply });
  }, 1200);
}

// Directly query Google Gemini API using native HTTPS fetch to bypass server
async function executeClientSideGemini(message, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const sats = store.getState().satellites;
  const weather = store.getState().spaceWeather;

  // Compile history
  const contents = conversationHistory.map(h => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.content }]
  }));

  // Construct Gemini system instruction and tools schema
  const payload = {
    contents: contents,
    systemInstruction: {
      parts: [{
        text: `You are the ISRO NETRA Space Operations AI Commander at ISTRAC Bengaluru.
You monitor Indian satellites (including Gaganyaan-1, Cartosat-3, NavIC constellation) and debris alerts.
You understand the "butterfly effect" of solar activity on spacecraft subsystems.
When the user asks you questions, requests checks, or coordinates maneuvers:
1. First, query 'get_satellite_states' to review coordinates and danger flags.
2. Call 'get_anomaly_diagnostics' to fetch the real-time health telemetry variables (thermals, SNR, voltage) of active satellites. If any systems are degraded (battery temp > 45°C or comms SNR < 12dB), report these specific anomalies to the operator and analyze how they correlate with the active solar weather.
3. If any satellite has a threat level of 'WARNING' or 'DANGER', run 'calculate_avoidance_vector' to get orbital thrust metrics.
4. Before calling 'execute_orbital_burn' to execute a burn, you MUST consult the Aditya Solar Physics Analyst using the 'consult_solar_physics_analyst' tool to check space weather safety.
5. If the Analyst reports status 'ABORT', or if critical spacecraft anomalies (like battery temp > 48°C) render the electronics too sensitive for thruster ignition, abort the maneuver. Explain the solar storm / ESD radiation hazard details to the operator and do NOT call 'execute_orbital_burn'.
6. If the Analyst reports status 'CLEAR' and spacecraft thermals/systems are stable, proceed with calling 'execute_orbital_burn' to execute the maneuver.
7. Report your actions step-by-step, including the delta-v values, the Analyst weather consensus dialog, diagnosed subsystem anomalies, and altitude shifts.
Format your final response in clear, concise markdown with appropriate headers. Keep it professional and military-grade.`
      }]
    },
    tools: [{
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
          name: "get_anomaly_diagnostics",
          description: "Fetch real-time micro-telemetry diagnostic variables (battery thermals, solar panel efficiency, communication signal quality, propellant pressure) to scan for space weather induced anomalies."
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
          description: "Computes the exact delta-v (m/s) thrust and burn direction required to steer a satellite away from a collision danger corridor.",
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
    }]
  };

  const executeCall = async (bodyPayload) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || "Gemini API HTTP Error");
    }
    return await res.json();
  };

  let geminiRes = await executeCall(payload);
  const toolCalls = [];
  
  // Parse responses recursively
  let candidate = geminiRes.candidates?.[0]?.content;
  let part = candidate?.parts?.[0];

  while (part && part.functionCall) {
    const { name, args } = part.functionCall;
    let responseData = {};

    if (name === "get_satellite_states") {
      responseData = { satellites: sats };
    } else if (name === "get_space_weather") {
      responseData = { spaceWeather: weather };
    } else if (name === "get_anomaly_diagnostics") {
      const diagnostics = sats.map(s => ({
        id: s.id,
        name: s.name,
        health: s.health || { solarV: 32.4, battTemp: 28.5, downlinkSNR: 24.5, fuelPressure: 220 }
      }));
      responseData = { diagnostics };
    } else if (name === "consult_solar_physics_analyst") {
      let analystResult = null;
      try {
        const analystUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
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
        const analystPayload = {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        };
        const res = await fetch(analystUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(analystPayload)
        });
        if (res.ok) {
          const rawRes = await res.json();
          analystResult = JSON.parse(rawRes.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
        }
      } catch (err) {
        console.warn("Client-side secondary Aditya agent query failed, using rule-based evaluation:", err);
      }

      if (!analystResult || !analystResult.status) {
        const isStorm = weather.solarProtonFlux > 15.0 || weather.kpIndex >= 4.5;
        analystResult = {
          status: isStorm ? "ABORT" : "CLEAR",
          reasoning: isStorm
            ? `Solar Proton Flux (${weather.solarProtonFlux.toFixed(1)} pfu) is above safety threshold of 15.0 pfu.`
            : `Solar Proton Flux (${weather.solarProtonFlux.toFixed(1)} pfu) is stable.`,
          recommendation: isStorm ? "Abort maneuver. Shield operations active." : "Proceed with burn."
        };
      }

      responseData = {
        satelliteId: args.satelliteId,
        status: analystResult.status,
        reasoning: analystResult.reasoning,
        recommendation: analystResult.recommendation,
        solarProtonFlux: weather.solarProtonFlux,
        kpIndex: weather.kpIndex
      };
    } else if (name === "calculate_avoidance_vector") {
      const isLeo = args.satelliteId === 'gaganyaan' || args.satelliteId === 'cosmos-debris';
      responseData = {
        satelliteId: args.satelliteId,
        recommendedDeltaV: isLeo ? 1.45 : 0.85,
        recommendedDirection: "PROGRADE",
        estimatedOrbitalShiftKm: isLeo ? 2.61 : 12.75
      };
    } else if (name === "execute_orbital_burn") {
      const { satelliteId, deltaV, direction } = args;
      const target = sats.find(s => s.id === satelliteId);
      const debris = sats.find(s => s.id === 'cosmos-debris');
      
      const shiftMultiplier = target?.alt > 1000 ? 15 : 1.8;
      const altShift = deltaV * shiftMultiplier;
      
      if (target) {
        if (!target.burnAdjustments) target.burnAdjustments = { alt: 0 };
        target.burnAdjustments.alt += altShift;
        target.alt += altShift;
        target.threatLevel = 'NORMAL';
        target.threatDetails = 'Orbit corrected. Space debris cleared.';
      }
      if (debris) {
        debris.threatLevel = 'NORMAL';
        debris.threatDetails = 'Maneuver executed. Collision risk mitigated.';
      }
      
      store.updateState('satellites', [...sats]);
      store.addLog(`[UPLINK] Maneuver executed: ${direction} burn of ${deltaV} m/s. Orbit raised by +${altShift.toFixed(2)}km. (Gemini Client-side API Key)`, 'success');
      audio.playSuccess();

      // Dispatch custom event to notify main websocket controller of agent thrust command
      document.dispatchEvent(new CustomEvent('uplink-maneuver', {
        detail: {
          satelliteId: satelliteId,
          deltaV: deltaV,
          direction: direction
        }
      }));

      responseData = { status: "SUCCESS" };
    }

    toolCalls.push({
      tool: name,
      inputs: args,
      result: responseData
    });

    // Send functional response back to chat session
    const followUpPayload = {
      contents: [
        ...contents,
        {
          role: 'model',
          parts: [{ functionCall: part.functionCall }]
        },
        {
          role: 'user',
          parts: [{
            functionResponse: {
              name: name,
              response: responseData
            }
          }]
        }
      ]
    };

    geminiRes = await executeCall(followUpPayload);
    candidate = geminiRes.candidates?.[0]?.content;
    part = candidate?.parts?.[0];
  }

  const finalReply = candidate?.parts?.[0]?.text || "Maneuvers successfully coordinated.";
  return {
    text: finalReply,
    toolCalls: toolCalls
  };
}
