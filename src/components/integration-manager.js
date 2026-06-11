import store from '../core/state.js';
import audio from '../core/audio.js';

export function initIntegrationManager() {
  const container = document.getElementById('integration-manager-container');
  if (!container) return;

  // Render initial template
  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 15px; height: 100%;">
      
      <!-- Live Service Health Board -->
      <div style="border: 1px solid rgba(100, 116, 139, 0.2); background: rgba(5, 7, 12, 0.3); border-radius: 4px; padding: 10px;">
        <div style="font-size: 0.65rem; color: #64748b; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 6px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
          <i data-lucide="activity" style="width: 12px; height: 12px; color: hsl(var(--color-cyan));"></i>
          Live Integration Feeds Status
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px;" id="services-health-grid">
          <!-- Status cards will be rendered here -->
        </div>
      </div>

      <!-- Add Webhook form & Registered Webhooks panel -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; flex: 1;">
        
        <!-- Left: Register Webhook Form -->
        <div style="border: 1px solid rgba(100, 116, 139, 0.2); background: rgba(5, 7, 12, 0.3); border-radius: 4px; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
          <div style="font-size: 0.65rem; color: #64748b; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 6px;">
            Register Outbound Gateway
          </div>
          
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 0.55rem; color: #94a3b8; font-weight: bold;">CHANNEL NAME</label>
            <input type="text" id="webhook-name" class="terminal-input-box" placeholder="e.g. Discord Space Channel" style="padding: 5px; font-size: 0.65rem; margin-top: 0;" />
          </div>

          <div style="display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 0.55rem; color: #94a3b8; font-weight: bold;">TARGET ENDPOINT URL</label>
            <input type="url" id="webhook-url" class="terminal-input-box" placeholder="e.g. https://api.service.com/webhook" style="padding: 5px; font-size: 0.65rem; margin-top: 0;" />
          </div>

          <div style="display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 0.55rem; color: #94a3b8; font-weight: bold;">EVENT SUBSCRIPTIONS</label>
            <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 2px;">
              <label style="display: flex; align-items: center; gap: 6px; font-size: 0.6rem; color: #e2e8f0; cursor: pointer;">
                <input type="checkbox" id="event-conjunction" checked /> Conjunction Threats (WARNING, CLEARED)
              </label>
              <label style="display: flex; align-items: center; gap: 6px; font-size: 0.6rem; color: #e2e8f0; cursor: pointer;">
                <input type="checkbox" id="event-weather" checked /> Solar Weather Alerts (SOLAR_STORM_ALERT)
              </label>
              <label style="display: flex; align-items: center; gap: 6px; font-size: 0.6rem; color: #e2e8f0; cursor: pointer;">
                <input type="checkbox" id="event-anomaly" checked /> Subsystem Anomalies (TRIGGERED, CLEARED)
              </label>
              <label style="display: flex; align-items: center; gap: 6px; font-size: 0.6rem; color: #e2e8f0; cursor: pointer;">
                <input type="checkbox" id="event-maneuver" checked /> Maneuver Burns (MANEUVER_EXECUTED)
              </label>
            </div>
          </div>

          <div style="display: flex; gap: 8px; margin-top: 6px;">
            <button id="btn-webhook-test" class="hud-btn" style="flex: 1; padding: 6px; font-size: 0.65rem;">
              <i data-lucide="send" style="width: 10px; height: 10px; display: inline; vertical-align: middle; margin-right: 2px;"></i> TEST CONNECTION
            </button>
            <button id="btn-webhook-save" class="hud-btn" style="flex: 1; padding: 6px; font-size: 0.65rem; background: rgba(34, 197, 94, 0.1); border-color: rgba(34, 197, 94, 0.4); color: hsl(var(--color-green));">
              <i data-lucide="plus" style="width: 10px; height: 10px; display: inline; vertical-align: middle; margin-right: 2px;"></i> ADD GATEWAY
            </button>
          </div>
          
          <div id="webhook-form-feedback" style="font-size: 0.55rem; min-height: 12px; margin-top: 4px; font-family: monospace;"></div>
        </div>

        <!-- Right: Channels List -->
        <div style="border: 1px solid rgba(100, 116, 139, 0.2); background: rgba(5, 7, 12, 0.3); border-radius: 4px; padding: 10px; display: flex; flex-direction: column;">
          <div style="font-size: 0.65rem; color: #64748b; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 6px; margin-bottom: 8px;">
            Active Outbound Channels
          </div>
          <div id="webhooks-list-container" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;">
            <!-- Registered webhooks will render here -->
          </div>
        </div>
      </div>
      
    </div>
  `;

  // Initialize Lucide icons inside this tab
  lucide.createIcons({
    attrs: {
      style: "width: 12px; height: 12px;"
    }
  });

  const nameInput = document.getElementById('webhook-name');
  const urlInput = document.getElementById('webhook-url');
  const conjCheckbox = document.getElementById('event-conjunction');
  const weatherCheckbox = document.getElementById('event-weather');
  const anomalyCheckbox = document.getElementById('event-anomaly');
  const maneuverCheckbox = document.getElementById('event-maneuver');
  const testBtn = document.getElementById('btn-webhook-test');
  const saveBtn = document.getElementById('btn-webhook-save');
  const feedbackDiv = document.getElementById('webhook-form-feedback');
  const listContainer = document.getElementById('webhooks-list-container');

  // Load and render lists
  loadWebhooks();
  updateServicesHealth();

  // Listen for tab activation to reload lists
  document.addEventListener('integrations-activated', () => {
    loadWebhooks();
    updateServicesHealth();
  });

  // Periodically refresh service health status every 5 seconds if tab is active
  setInterval(() => {
    const parentContainer = document.getElementById('integration-manager-container');
    if (parentContainer && parentContainer.style.display !== 'none') {
      updateServicesHealth();
    }
  }, 5000);

  // Test Connection
  testBtn.addEventListener('click', async () => {
    audio.playClick();
    const url = urlInput.value.trim();
    if (!url) {
      showFeedback("Target URL is required to test connection.", "danger");
      return;
    }

    showFeedback("Testing connection...", "info");
    testBtn.disabled = true;

    try {
      const res = await fetch('/api/webhooks/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (res.ok) {
        showFeedback(`SUCCESS: ${data.message}`, "success");
      } else {
        showFeedback(`FAILED: ${data.error}`, "danger");
      }
    } catch (err) {
      showFeedback(`ERROR: ${err.message}`, "danger");
    } finally {
      testBtn.disabled = false;
    }
  });

  // Save Webhook
  saveBtn.addEventListener('click', async () => {
    audio.playClick();
    const name = nameInput.value.trim() || "Gateway Uplink";
    const url = urlInput.value.trim();
    if (!url) {
      showFeedback("Target URL is required to save gateway.", "danger");
      return;
    }

    // Accumulate selected events
    const events = [];
    if (conjCheckbox.checked) {
      events.push('CONJUNCTION_WARNING', 'CONJUNCTION_CLEARED');
    }
    if (weatherCheckbox.checked) {
      events.push('SOLAR_STORM_ALERT');
    }
    if (anomalyCheckbox.checked) {
      events.push('ANOMALY_TRIGGERED', 'ANOMALY_CLEARED');
    }
    if (maneuverCheckbox.checked) {
      events.push('MANEUVER_EXECUTED');
    }

    if (events.length === 0) {
      showFeedback("Select at least one event subscription.", "danger");
      return;
    }

    saveBtn.disabled = true;
    showFeedback("Saving gateway...", "info");

    try {
      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          url,
          events
        })
      });
      if (res.ok) {
        showFeedback("Outbound gateway registered successfully.", "success");
        nameInput.value = '';
        urlInput.value = '';
        loadWebhooks();
      } else {
        const errData = await res.json();
        showFeedback(`Failed to save: ${errData.error}`, "danger");
      }
    } catch (err) {
      showFeedback(`Error saving: ${err.message}`, "danger");
    } finally {
      saveBtn.disabled = false;
    }
  });

  // Helper: Display feedback message
  function showFeedback(msg, type) {
    if (!feedbackDiv) return;
    feedbackDiv.textContent = msg;
    if (type === 'success') {
      feedbackDiv.style.color = 'hsl(var(--color-green))';
    } else if (type === 'danger') {
      feedbackDiv.style.color = 'hsl(var(--color-red))';
    } else {
      feedbackDiv.style.color = 'hsl(var(--color-cyan))';
    }
  }

  // Load registered webhooks from backend
  async function loadWebhooks() {
    if (!listContainer) return;
    
    const isOnline = store.isOnline;
    if (!isOnline) {
      listContainer.innerHTML = `<div style="text-align: center; color: #64748b; font-size: 0.6rem; margin-top: 15px;">Stand-alone client mode. Webhook configuration requires active backend link.</div>`;
      return;
    }

    try {
      const res = await fetch('/api/webhooks');
      if (!res.ok) throw new Error("Failed to fetch webhooks list");
      const list = await res.json();
      
      if (list.length === 0) {
        listContainer.innerHTML = `<div style="text-align: center; color: #64748b; font-size: 0.6rem; margin-top: 25px;">No active channels. Register a target endpoint on the left.</div>`;
        return;
      }

      listContainer.innerHTML = '';
      list.forEach(w => {
        const card = document.createElement('div');
        card.style.border = '1px solid rgba(100, 116, 139, 0.15)';
        card.style.background = 'rgba(255, 255, 255, 0.02)';
        card.style.borderRadius = '3px';
        card.style.padding = '8px';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.gap = '4px';

        // Translate specific events to shorter labels
        const labelsMap = {
          'CONJUNCTION_WARNING': 'Conjunctions',
          'CONJUNCTION_CLEARED': 'Conjunctions',
          'SOLAR_STORM_ALERT': 'Weather',
          'ANOMALY_TRIGGERED': 'Anomalies',
          'ANOMALY_CLEARED': 'Anomalies',
          'MANEUVER_EXECUTED': 'Maneuvers'
        };
        const uniqueLabels = [...new Set(w.events.map(e => labelsMap[e] || e))];

        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <span style="font-weight: bold; font-size: 0.65rem; color: #fff;">${w.name}</span>
            <button class="hud-btn danger btn-delete-webhook" data-id="${w.id}" style="padding: 2px 6px; font-size: 0.55rem; margin: 0;">DELETE</button>
          </div>
          <div style="font-size: 0.55rem; color: #94a3b8; font-family: monospace; word-break: break-all;">${w.url}</div>
          <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 2px;">
            ${uniqueLabels.map(l => `<span style="font-size: 0.5rem; background: rgba(6, 182, 212, 0.15); color: hsl(var(--color-cyan)); border: 1px solid rgba(6, 182, 212, 0.3); padding: 1px 4px; border-radius: 2px; text-transform: uppercase;">${l}</span>`).join('')}
          </div>
        `;

        // Bind delete trigger
        const delBtn = card.querySelector('.btn-delete-webhook');
        delBtn.addEventListener('click', async () => {
          audio.playClick();
          const id = delBtn.getAttribute('data-id');
          try {
            const delRes = await fetch(`/api/webhooks/${id}`, {
              method: 'DELETE'
            });
            if (delRes.ok) {
              loadWebhooks();
            } else {
              showFeedback("Failed to delete webhook channel.", "danger");
            }
          } catch (err) {
            showFeedback(`Error deleting webhook: ${err.message}`, "danger");
          }
        });

        listContainer.appendChild(card);
      });
    } catch (err) {
      listContainer.innerHTML = `<div style="text-align: center; color: hsl(var(--color-red)); font-size: 0.6rem; margin-top: 15px;">Failed to load channels: ${err.message}</div>`;
    }
  }

  // Update Services Health status displays
  async function updateServicesHealth() {
    const healthGrid = document.getElementById('services-health-grid');
    if (!healthGrid) return;

    const isOnline = store.isOnline;
    
    // Default fallback values
    let noaaStatus = isOnline ? 'ONLINE' : 'OFFLINE';
    let noaaClass = isOnline ? 'normal' : 'danger';
    let celestrakStatus = isOnline ? 'ONLINE' : 'OFFLINE';
    let celestrakClass = isOnline ? 'normal' : 'danger';
    let geminiStatus = 'OFFLINE';
    let geminiClass = 'danger';
    let mcpStdioStatus = isOnline ? 'ACTIVE' : 'OFFLINE';
    let mcpStdioClass = isOnline ? 'normal' : 'danger';
    let mcpWebStatus = isOnline ? 'CONNECTED' : 'OFFLINE';
    let mcpWebClass = isOnline ? 'normal' : 'danger';

    // If online, ping details from memory or endpoints
    if (isOnline) {
      try {
        // Evaluate Gemini status based on saved API key
        const savedKey = localStorage.getItem('gemini_api_key') || '';
        if (savedKey) {
          geminiStatus = 'READY';
          geminiClass = 'normal';
        } else {
          geminiStatus = 'NO KEY';
          geminiClass = 'warning';
        }
      } catch (e) {
        console.error(e);
      }
    }

    const services = [
      { name: "NOAA SWPC API", status: noaaStatus, class: noaaClass, icon: "sun" },
      { name: "CelesTrak Proxy", status: celestrakStatus, class: celestrakClass, icon: "database" },
      { name: "Gemini AI Ops", status: geminiStatus, class: geminiClass, icon: "sparkles" },
      { name: "MCP Stdio Gateway", status: mcpStdioStatus, class: mcpStdioClass, icon: "terminal" },
      { name: "Web MCP SSE Server", status: mcpWebStatus, class: mcpWebClass, icon: "split" }
    ];

    healthGrid.innerHTML = services.map(s => {
      const colorStyle = s.class === 'normal' ? 'hsl(var(--color-green))' : (s.class === 'warning' ? 'hsl(var(--color-amber))' : 'hsl(var(--color-red))');
      return `
        <div style="border: 1px solid rgba(100, 116, 139, 0.15); background: rgba(255,255,255,0.01); border-radius: 3px; padding: 6px 8px; display: flex; flex-direction: column; gap: 2px;">
          <div style="font-size: 0.55rem; color: #64748b; font-family: monospace; text-transform: uppercase;">${s.name}</div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 2px;">
            <i data-lucide="${s.icon}" style="width: 11px; height: 11px; color: ${colorStyle};"></i>
            <span style="font-size: 0.6rem; font-weight: bold; color: ${colorStyle}; letter-spacing: 0.5px;">${s.status}</span>
          </div>
        </div>
      `;
    }).join('');

    lucide.createIcons({
      attrs: {
        style: "width: 11px; height: 11px;"
      }
    });
  }
}
