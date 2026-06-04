import store from '../core/state.js';
import audio from '../core/audio.js';

let logContainer, inputField, submitBtn;

export function initTelemetryTerminal() {
  logContainer = document.getElementById('terminal-screen-container');
  inputField = document.getElementById('inp-terminal-command');
  submitBtn = document.getElementById('btn-terminal-submit');

  if (!logContainer) return;

  // 1. Subscribe to state log events
  store.subscribe('telemetryLogs', (logs) => {
    renderTerminalLogs(logs);
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
      store.addLog('  /weather                       - Pull data from Aditya-L1 solar probes.', 'info');
      store.addLog('  /storm                         - Toggle simulated solar storm state.', 'info');
      store.addLog('  /clear                         - Clear console log lines.', 'info');
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
        store.addLog(`[UPLINK SUCCESS] ${target.name} orbit raised by +${altShift.toFixed(2)} km.`, 'success');
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
