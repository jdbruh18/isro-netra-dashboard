import store from '../core/state.js';
import audio from '../core/audio.js';
import { validateBurn } from '../core/avoidance-proof.js';
import { SemanticKnowledgeGraph } from '../core/knowledge-graph.js';

let logContainer, inputField, submitBtn;

export function initTelemetryTerminal() {
  logContainer = document.getElementById('terminal-screen-container');
  inputField = document.getElementById('inp-terminal-command');
  submitBtn = document.getElementById('btn-terminal-submit');

  if (!logContainer) return;

  // Tab switching UI elements
  const tabTerminalBtn = document.getElementById('tab-terminal-btn');
  const tabHistoryBtn = document.getElementById('tab-history-btn');
  const tabChartsBtn = document.getElementById('tab-charts-btn');
  const tabRcaBtn = document.getElementById('tab-rca-btn');
  const tabIntegrationsBtn = document.getElementById('tab-integrations-btn');
  
  const terminalScreen = document.getElementById('terminal-screen-container');
  const historyContainer = document.getElementById('maneuver-history-container');
  const chartsContainer = document.getElementById('subsystem-charts-container');
  const rcaContainer = document.getElementById('subsystem-rca-container');
  const integrationsContainer = document.getElementById('integration-manager-container');
  const inputRow = document.getElementById('terminal-input-row-container');

  let activeTab = 'terminal';

  const updateTabViews = () => {
    if (activeTab === 'terminal') {
      if (tabTerminalBtn) tabTerminalBtn.style.opacity = '1';
      if (tabHistoryBtn) tabHistoryBtn.style.opacity = '0.5';
      if (tabChartsBtn) tabChartsBtn.style.opacity = '0.5';
      if (tabRcaBtn) tabRcaBtn.style.opacity = '0.5';
      if (tabIntegrationsBtn) tabIntegrationsBtn.style.opacity = '0.5';
      if (terminalScreen) terminalScreen.style.display = 'block';
      if (historyContainer) historyContainer.style.display = 'none';
      if (chartsContainer) chartsContainer.style.display = 'none';
      if (rcaContainer) rcaContainer.style.display = 'none';
      if (integrationsContainer) integrationsContainer.style.display = 'none';
      if (inputRow) inputRow.style.display = 'flex';
      if (terminalScreen) terminalScreen.scrollTop = terminalScreen.scrollHeight;
    } else if (activeTab === 'history') {
      if (tabTerminalBtn) tabTerminalBtn.style.opacity = '0.5';
      if (tabHistoryBtn) tabHistoryBtn.style.opacity = '1';
      if (tabChartsBtn) tabChartsBtn.style.opacity = '0.5';
      if (tabRcaBtn) tabRcaBtn.style.opacity = '0.5';
      if (tabIntegrationsBtn) tabIntegrationsBtn.style.opacity = '0.5';
      if (terminalScreen) terminalScreen.style.display = 'none';
      if (historyContainer) historyContainer.style.display = 'block';
      if (chartsContainer) chartsContainer.style.display = 'none';
      if (rcaContainer) rcaContainer.style.display = 'none';
      if (integrationsContainer) integrationsContainer.style.display = 'none';
      if (inputRow) inputRow.style.display = 'none';
      renderManeuverHistory();
    } else if (activeTab === 'charts') {
      if (tabTerminalBtn) tabTerminalBtn.style.opacity = '0.5';
      if (tabHistoryBtn) tabHistoryBtn.style.opacity = '0.5';
      if (tabChartsBtn) tabChartsBtn.style.opacity = '1';
      if (tabRcaBtn) tabRcaBtn.style.opacity = '0.5';
      if (tabIntegrationsBtn) tabIntegrationsBtn.style.opacity = '0.5';
      if (terminalScreen) terminalScreen.style.display = 'none';
      if (historyContainer) historyContainer.style.display = 'none';
      if (chartsContainer) chartsContainer.style.display = 'flex';
      if (rcaContainer) rcaContainer.style.display = 'none';
      if (integrationsContainer) integrationsContainer.style.display = 'none';
      if (inputRow) inputRow.style.display = 'none';
      
      // Dispatch custom event to let the charting module know the tab is active
      document.dispatchEvent(new CustomEvent('subsystem-charts-activated'));
    } else if (activeTab === 'rca') {
      if (tabTerminalBtn) tabTerminalBtn.style.opacity = '0.5';
      if (tabHistoryBtn) tabHistoryBtn.style.opacity = '0.5';
      if (tabChartsBtn) tabChartsBtn.style.opacity = '0.5';
      if (tabRcaBtn) tabRcaBtn.style.opacity = '1';
      if (tabIntegrationsBtn) tabIntegrationsBtn.style.opacity = '0.5';
      if (terminalScreen) terminalScreen.style.display = 'none';
      if (historyContainer) historyContainer.style.display = 'none';
      if (chartsContainer) chartsContainer.style.display = 'none';
      if (rcaContainer) rcaContainer.style.display = 'flex';
      if (integrationsContainer) integrationsContainer.style.display = 'none';
      if (inputRow) inputRow.style.display = 'none';
      
      // Dispatch custom event to let the RCA analyzer know the tab is active
      document.dispatchEvent(new CustomEvent('subsystem-rca-activated'));
    } else if (activeTab === 'integrations') {
      if (tabTerminalBtn) tabTerminalBtn.style.opacity = '0.5';
      if (tabHistoryBtn) tabHistoryBtn.style.opacity = '0.5';
      if (tabChartsBtn) tabChartsBtn.style.opacity = '0.5';
      if (tabRcaBtn) tabRcaBtn.style.opacity = '0.5';
      if (tabIntegrationsBtn) tabIntegrationsBtn.style.opacity = '1';
      if (terminalScreen) terminalScreen.style.display = 'none';
      if (historyContainer) historyContainer.style.display = 'none';
      if (chartsContainer) chartsContainer.style.display = 'none';
      if (rcaContainer) rcaContainer.style.display = 'none';
      if (integrationsContainer) integrationsContainer.style.display = 'flex';
      if (inputRow) inputRow.style.display = 'none';
      
      // Dispatch custom event to let the integrations module know the tab is active
      document.dispatchEvent(new CustomEvent('integrations-activated'));
    }
  };

  if (tabTerminalBtn) {
    tabTerminalBtn.addEventListener('click', () => {
      audio.playClick();
      activeTab = 'terminal';
      updateTabViews();
    });
  }

  if (tabHistoryBtn) {
    tabHistoryBtn.addEventListener('click', () => {
      audio.playClick();
      activeTab = 'history';
      updateTabViews();
    });
  }

  if (tabChartsBtn) {
    tabChartsBtn.addEventListener('click', () => {
      audio.playClick();
      activeTab = 'charts';
      updateTabViews();
    });
  }

  if (tabRcaBtn) {
    tabRcaBtn.addEventListener('click', () => {
      audio.playClick();
      activeTab = 'rca';
      updateTabViews();
    });
  }

  if (tabIntegrationsBtn) {
    tabIntegrationsBtn.addEventListener('click', () => {
      audio.playClick();
      activeTab = 'integrations';
      updateTabViews();
    });
  }

  // 1. Subscribe to state log events
  store.subscribe('telemetryLogs', (logs) => {
    renderTerminalLogs(logs);
    if (activeTab === 'history') {
      renderManeuverHistory();
    }
  });

  // 2. Submit Action Command handlers
  const executeCommandInput = () => {
    const cmdText = inputField.value.trim();
    if (!cmdText) return;

    audio.playClick();
    inputField.value = '';

    // Log the typed command in terminal
    store.addLog(`ISTRAC-UPLINK> ${cmdText}`, 'cmd');

    // Parse command action
    setTimeout(() => {
      parseUplinkCommand(cmdText);
    }, 400);
  };

  submitBtn.addEventListener('click', executeCommandInput);
  
  inputField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      executeCommandInput();
    }
  });
}

function renderTerminalLogs(logs) {
  if (!logContainer) return;

  logContainer.innerHTML = '';
  
  logs.forEach((log) => {
    const row = document.createElement('div');
    row.className = 'terminal-line';

    const timestampSpan = document.createElement('span');
    timestampSpan.className = 'terminal-line timestamp';
    timestampSpan.textContent = `[${log.timestamp}]`;

    const textSpan = document.createElement('span');
    textSpan.className = `terminal-line ${log.type}`;
    textSpan.textContent = log.text;

    row.appendChild(timestampSpan);
    row.appendChild(textSpan);
    logContainer.appendChild(row);
  });

  // Keep screen scrolled to bottom
  logContainer.scrollTop = logContainer.scrollHeight;
}

// Submits actions to ISTRAC space command core
function parseUplinkCommand(command) {
  const parts = command.split(' ');
  const baseCmd = parts[0].toLowerCase();

  switch (baseCmd) {
    case '/help':
      store.addLog('Available Uplink Commands:', 'info');
      store.addLog('  /diagnose                      - Execute satellite sensor checks.', 'info');
      store.addLog('  /burn <satelliteId> <deltaV>   - Execute thruster burn to shift orbit (e.g. /burn gaganyaan 1.45).', 'info');
      store.addLog('  /rca <satelliteId>             - Diagnose root causes of active anomalies (e.g. /rca gaganyaan).', 'info');
      store.addLog('  /weather                       - Pull data from Aditya-L1 solar probes.', 'info');
      store.addLog('  /storm                         - Toggle simulated solar storm state.', 'info');
      store.addLog('  /clear                         - Clear console log lines.', 'info');
      break;

    case '/rca':
      {
        const satId = parts[1] ? parts[1].toLowerCase() : 'gaganyaan';
        const targetSat = store.getState().satellites.find(s => s.id === satId);
        if (!targetSat) {
          store.addLog(`ERROR: Spacecraft ID "${satId}" not recognized in catalog.`, 'danger');
          return;
        }
        store.addLog(`Initiating Root Cause Analysis (RCA) on spacecraft: ${targetSat.name}...`, 'info');
        
        setTimeout(() => {
          const graph = new SemanticKnowledgeGraph();
          const weather = store.getState().spaceWeather || {};
          const rcaResult = graph.analyzeRootCause(targetSat, weather);
          
          if (rcaResult.activeAnomalies.length === 0) {
            store.addLog(`✓ RCA Complete: ${targetSat.name} has no active anomalies. Subsystems nominal.`, 'success');
            audio.playSuccess();
            return;
          }
          
          store.addLog(`RCA COMPLETE: ${rcaResult.activeAnomalies.length} active anomalies diagnosed.`, 'warning');
          rcaResult.chains.forEach(c => {
            store.addLog(`  Anomaly Chain for [${c.anomaly}]:`, 'warning');
            const chainStr = c.chain.map(node => `${node.nodeId} (${node.type})`).join(' ➔ ');
            store.addLog(`    Path: ${chainStr}`, 'info');
          });
          audio.playSuccess();
        }, 800);
      }
      break;

    case '/clear':
    case '/clear_logs':
      store.updateState('telemetryLogs', []);
      store.addLog('Console cleared by operator.', 'info');
      break;

    case '/diagnose':
      store.addLog('Running self-diagnostic sequence on active space assets...', 'info');
      setTimeout(() => {
        const sats = store.getState().satellites;
        sats.forEach(s => {
          if (s.id === 'cosmos-debris') return;
          const status = s.threatLevel === 'NORMAL' ? 'HEALTHY' : 'CORRIDOR RISK';
          const type = s.threatLevel === 'NORMAL' ? 'success' : 'warning';
          store.addLog(`  Asset ${s.name}: SGP4 status [${status}] | Solar panels: 100% | Battery: 48.2V`, type);
        });
        store.addLog('Global diagnostics check complete. All telemetry streams online.', 'success');
        audio.playSuccess();
      }, 1000);
      break;

    case '/weather':
      const w = store.getState().spaceWeather;
      store.addLog('Pinging Aditya-L1 spacecraft solar sensor array...', 'info');
      setTimeout(() => {
        store.addLog(`  ASPEX Solar Wind: Speed ${w.solarWindSpeed} km/s`, 'success');
        store.addLog(`  MAG Interplanetary Field (Z-axis): ${w.magZ.toFixed(2)} nT`, 'success');
        store.addLog(`  PAPA Proton Flux density: ${w.solarProtonFlux.toFixed(2)} pfu`, 'success');
        store.addLog('Aditya-L1 connection synchronized. Magnetic storm threat is ' + w.magneticStormLevel + '.', 'success');
        audio.playSuccess();
      }, 800);
      break;

    case '/storm':
      const currentStorm = store.getState().spaceWeather;
      const isStormActive = currentStorm.solarProtonFlux > 15.0;
      if (isStormActive) {
        currentStorm.solarProtonFlux = 12.5; // restore normal
        currentStorm.kpIndex = 3.2;
        currentStorm.magneticStormLevel = 'QUIET';
        store.addLog('UPLINK: Resetting space weather to QUIET conditions.', 'success');
      } else {
        currentStorm.solarProtonFlux = 55.0; // activate storm!
        currentStorm.kpIndex = 6.5;
        currentStorm.magneticStormLevel = 'SEVERE STORM';
        store.addLog('WARNING: Severe solar storm simulated. Proton flux exceeds 50 pfu!', 'danger');
      }
      store.updateState('spaceWeather', { ...currentStorm });
      
      // Dispatch event to forward this to server over WebSocket
      document.dispatchEvent(new CustomEvent('uplink-weather', {
        detail: {
          solarProtonFlux: currentStorm.solarProtonFlux,
          kpIndex: currentStorm.kpIndex,
          magneticStormLevel: currentStorm.magneticStormLevel
        }
      }));
      break;

    case '/burn':
      if (parts.length < 3) {
        store.addLog('ERROR: Incomplete burn parameters. Usage: /burn <satelliteId> <deltaV>', 'danger');
        return;
      }
      const satId = parts[1].toLowerCase();
      const deltaV = parseFloat(parts[2]);

      if (isNaN(deltaV) || deltaV <= 0) {
        store.addLog('ERROR: Invalid thrust velocity delta-V parameter. Must be positive number.', 'danger');
        return;
      }

      // Find satellite
      const sats = store.getState().satellites;
      const target = sats.find(s => s.id === satId);

      if (!target) {
        store.addLog(`ERROR: Space asset ID "${satId}" not recognized in catalog.`, 'danger');
        return;
      }

      // Enforce Idris 2 type-level bounds validation locally
      const debris = sats.find(s => s.category === 'debris') || { alt: 405.41 };
      const safetyMargin = 2.0; // 2 km safety clearance
      const validation = validateBurn(
        satId,
        deltaV,
        "PROGRADE",
        target.alt,
        debris.alt,
        safetyMargin,
        target.thermal ? target.thermal.thermalStress : 0.0,
        target.radiation ? target.radiation.seuProbability : 0.0
      );
      if (!validation.success) {
        store.addLog(`ERROR: Maneuver blocked by Idris 2 verification: ${validation.error}`, 'danger');
        audio.playHover();
        return;
      }

      store.addLog(`Initiating thruster burn payload sync for ${target.name}...`, 'warning');
      store.addLog(`Uplinking delta-V vectors: ${deltaV.toFixed(2)} m/s prograde...`, 'warning');
      
      setTimeout(() => {
        // Adjust altitude in state store (simulating physical SGP4 shift)
        const shiftMultiplier = target.alt > 1000 ? 15 : 1.8;
        const altShift = deltaV * shiftMultiplier;
        
        if (!target.burnAdjustments) target.burnAdjustments = { alt: 0 };
        target.burnAdjustments.alt += altShift;
        target.alt += altShift;
        target.threatLevel = 'NORMAL';
        target.threatDetails = 'Orbit shifted. Conjunction threat cleared.';
        
        store.updateState('satellites', [...sats]);
        store.addLog(`[UPLINK] Maneuver executed on ${target.name}: PROGRADE burn of ${deltaV.toFixed(2)} m/s. Orbit adjusted by +${altShift.toFixed(2)}km. (Manual Control)`, 'success');
        audio.playSuccess();

        // Dispatch custom event to notify main websocket controller of manual thrust command
        document.dispatchEvent(new CustomEvent('uplink-maneuver', {
          detail: {
            satelliteId: target.id,
            deltaV: deltaV,
            direction: "PROGRADE"
          }
        }));
      }, 1500);
      break;

    default:
      store.addLog(`Command "${baseCmd}" not recognized. Type "/help" to view command registry.`, 'danger');
      break;
  }
}

function renderManeuverHistory() {
  const container = document.getElementById('maneuver-history-container');
  if (!container) return;

  const logs = store.getState().telemetryLogs || [];
  
  // Filter logs for maneuvers using the regex
  const regex = /Maneuver executed on\s+([^:]+):\s+(\w+)\s+burn of\s+([\d.]+)\s+m\/s\.\s+Orbit adjusted by\s+\+?([\d.-]+)km\.\s*(?:\(([^)]+)\))?/;
  
  const maneuvers = [];
  
  logs.forEach(log => {
    const match = log.text.match(regex);
    if (match) {
      maneuvers.push({
        timestamp: log.timestamp,
        satellite: match[1].trim(),
        direction: match[2].trim(),
        deltaV: parseFloat(match[3]),
        shift: parseFloat(match[4]),
        source: match[5] ? match[5].trim() : 'Manual Control'
      });
    }
  });

  if (maneuvers.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: #64748b; margin-top: 25px;">No orbital maneuvers recorded in session.</div>`;
    return;
  }

  let html = `
    <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.65rem;">
      <thead>
        <tr style="border-bottom: 1px solid rgba(100, 116, 139, 0.4); color: #64748b; text-transform: uppercase;">
          <th style="padding: 6px 4px;">Time</th>
          <th style="padding: 6px 4px;">Space Asset</th>
          <th style="padding: 6px 4px;">Direction</th>
          <th style="padding: 6px 4px;">Delta-V</th>
          <th style="padding: 6px 4px;">Orbit Shift</th>
          <th style="padding: 6px 4px;">Initiated By</th>
        </tr>
      </thead>
      <tbody>
  `;

  maneuvers.reverse().forEach(m => {
    const isAI = m.source.includes('Gemini') || m.source.includes('Agent');
    const sourceColor = isAI ? 'rgb(168, 85, 247)' : 'rgb(6, 182, 212)';
    
    html += `
      <tr style="border-bottom: 1px solid rgba(100, 116, 139, 0.15);">
        <td style="padding: 6px 4px; color: #64748b;">${m.timestamp}</td>
        <td style="padding: 6px 4px; font-weight: bold; color: #fff;">${m.satellite}</td>
        <td style="padding: 6px 4px; color: hsl(var(--color-amber));">${m.direction}</td>
        <td style="padding: 6px 4px; font-family: var(--font-mono); color: #fff;">${m.deltaV.toFixed(2)} m/s</td>
        <td style="padding: 6px 4px; font-family: var(--font-mono); color: hsl(var(--color-green));">+${m.shift.toFixed(2)} km</td>
        <td style="padding: 6px 4px; color: ${sourceColor}; font-weight: 500;">${m.source}</td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  container.innerHTML = html;
}
