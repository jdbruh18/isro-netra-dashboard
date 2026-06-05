import store from '../core/state.js';
import audio from '../core/audio.js';

let alertCard, detailsLabel, solutionLabel, assetListContainer;

export function initCollisionMonitor() {
  alertCard = document.getElementById('card-conjunction-warning');
  detailsLabel = document.getElementById('lbl-conjunction-details');
  solutionLabel = document.getElementById('lbl-ai-burn-solution');
  assetListContainer = document.getElementById('asset-list-container');

  if (!alertCard) return;

  // Subscribe to satellites state updates
  store.subscribe('satellites', (sats) => {
    // 1. Render Left panel list of assets
    renderAssetList(sats);

    // 2. Perform conjunction risk calculations
    analyzeConjunctionRisks(sats);
  });

  // Subscribe to activeCategory and searchQuery updates to re-render asset list instantly
  store.subscribe('activeCategory', () => {
    renderAssetList(store.getState().satellites);
  });

  store.subscribe('searchQuery', () => {
    renderAssetList(store.getState().satellites);
  });

  // Re-render when active selection changes to highlight correct row
  store.subscribe('activeSatelliteId', () => {
    renderAssetList(store.getState().satellites);
  });
}

function updateSatelliteDetails(sat) {
  if (!sat) return;
  document.getElementById('sat-detail-name').textContent = sat.name;
  document.getElementById('sat-detail-alt').textContent = typeof sat.alt === 'number' ? `${sat.alt.toFixed(1)} km` : '---';
  document.getElementById('sat-detail-vel').textContent = typeof sat.velocity === 'number' ? `${sat.velocity.toFixed(2)} km/s` : '---';
  document.getElementById('sat-detail-lat').textContent = typeof sat.lat === 'number' ? `${sat.lat.toFixed(4)}° N` : '0.0000° N';
  document.getElementById('sat-detail-lng').textContent = typeof sat.lng === 'number' ? `${sat.lng.toFixed(4)}° E` : '0.0000° E';
  document.getElementById('sat-detail-status').textContent = sat.threatLevel === 'NORMAL' ? 'ORBIT OK' : 'CORRIDOR RISK';
  
  const statVal = document.getElementById('sat-detail-status');
  if (sat.threatLevel === 'NORMAL') {
    statVal.className = 'sat-details-val normal';
  } else {
    statVal.className = 'sat-details-val danger';
  }

  // Update subsystem health indicators (Sprint 4)
  const solarEl = document.getElementById('sat-detail-solar');
  const battEl = document.getElementById('sat-detail-batt-temp');
  const snrEl = document.getElementById('sat-detail-snr');
  const fuelEl = document.getElementById('sat-detail-fuel');

  if (solarEl && battEl && snrEl && fuelEl) {
    if (sat.health) {
      solarEl.textContent = `${sat.health.solarV.toFixed(1)} V`;
      battEl.textContent = `${sat.health.battTemp.toFixed(1)}°C`;
      snrEl.textContent = `${sat.health.downlinkSNR.toFixed(1)} dB`;
      fuelEl.textContent = `${sat.health.fuelPressure.toFixed(0)} psi`;

      const isDebris = sat.id === 'cosmos-debris' || (sat.category && sat.category === 'debris') || (sat.name && sat.name.toLowerCase().includes('debris'));

      if (isDebris) {
        solarEl.className = 'sat-details-val';
        battEl.className = 'sat-details-val';
        snrEl.className = 'sat-details-val';
        fuelEl.className = 'sat-details-val';
      } else {
        // Solar panel voltage: normal ~32V, warning < 25V, danger < 20V
        if (sat.health.solarV < 20.0) {
          solarEl.className = 'sat-details-val danger';
        } else if (sat.health.solarV < 25.0) {
          solarEl.className = 'sat-details-val warning';
        } else {
          solarEl.className = 'sat-details-val normal';
        }

        // Battery Temp: normal < 40°C, warning > 45°C, danger > 48°C
        if (sat.health.battTemp > 48.0) {
          battEl.className = 'sat-details-val danger';
        } else if (sat.health.battTemp > 45.0) {
          battEl.className = 'sat-details-val warning';
        } else {
          battEl.className = 'sat-details-val normal';
        }

        // Comms SNR: normal > 18dB, warning < 15dB, danger < 12dB
        if (sat.health.downlinkSNR < 12.0) {
          snrEl.className = 'sat-details-val danger';
        } else if (sat.health.downlinkSNR < 15.0) {
          snrEl.className = 'sat-details-val warning';
        } else {
          snrEl.className = 'sat-details-val normal';
        }

        fuelEl.className = 'sat-details-val normal';
      }
    } else {
      solarEl.textContent = 'N/A';
      battEl.textContent = 'N/A';
      snrEl.textContent = 'N/A';
      fuelEl.textContent = 'N/A';
      solarEl.className = 'sat-details-val';
      battEl.className = 'sat-details-val';
      snrEl.className = 'sat-details-val';
      fuelEl.className = 'sat-details-val';
    }
  }
}

function renderAssetList(sats) {
  if (!assetListContainer) return;

  const { activeCategory, searchQuery, activeSatelliteId } = store.getState();
  assetListContainer.innerHTML = '';

  const filtered = sats.filter(s => {
    // 1. Category Filter
    if (activeCategory !== 'all' && s.category !== activeCategory) {
      return false;
    }

    // 2. Search Query Filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const nameMatch = s.name && s.name.toLowerCase().includes(q);
      const idMatch = s.id && s.id.toLowerCase().includes(q);
      const noradMatch = s.tle2 && s.tle2.substring(2, 7).includes(q);
      if (!nameMatch && !idMatch && !noradMatch) return false;
    }
    return true;
  });

  // Update dynamic count of shown assets vs active count
  const lblAssetCount = document.getElementById('lbl-asset-count');
  if (lblAssetCount) {
    lblAssetCount.textContent = filtered.length;
  }
  const lblActiveCount = document.getElementById('lbl-active-count');
  if (lblActiveCount) {
    lblActiveCount.textContent = sats.length;
  }

  // Live coordinate update for the currently active satellite card
  const activeSat = sats.find(s => s.id === activeSatelliteId);
  if (activeSat) {
    updateSatelliteDetails(activeSat);
  }

  filtered.forEach((s) => {
    // Determine status color dot
    let dotClass = 'active';
    if (s.threatLevel === 'WARNING') dotClass = 'warning';
    if (s.threatLevel === 'DANGER') dotClass = 'danger';

    const row = document.createElement('div');
    row.className = `satellite-row ${s.id === activeSatelliteId ? 'selected' : ''}`;
    row.addEventListener('click', () => {
      store.updateState('activeSatelliteId', s.id);
      audio.playClick();
      updateSatelliteDetails(s);
    });

    const leftSec = document.createElement('div');
    leftSec.className = 'sat-row-left';
    leftSec.innerHTML = `
      <span class="sat-row-name">${s.name}</span>
      <span class="sat-row-type">${s.owner} | ${s.type}</span>
    `;

    const rightSec = document.createElement('div');
    rightSec.className = 'sat-row-right';
    const altValue = typeof s.alt === 'number' ? s.alt.toFixed(0) : '---';
    rightSec.innerHTML = `
      <span class="status-dot ${dotClass}"></span>
      <span class="sat-row-type" style="font-family:var(--font-mono);">${altValue} km</span>
    `;

    row.appendChild(leftSec);
    row.appendChild(rightSec);
    assetListContainer.appendChild(row);
  });
}

function analyzeConjunctionRisks(sats) {
  // 1. Reset threat markers for all satellites
  sats.forEach(s => {
    s.threatLevel = 'NORMAL';
    s.threatDetails = 'Telemetry synchronized.';
  });

  const activeSats = sats.filter(s => s.category !== 'debris');
  const debrisSats = sats.filter(s => s.category === 'debris');
  const conjunctions = [];

  activeSats.forEach(activeSat => {
    debrisSats.forEach(debrisSat => {
      if (activeSat.position3d && debrisSat.position3d) {
        const dx = activeSat.position3d.x - debrisSat.position3d.x;
        const dy = activeSat.position3d.y - debrisSat.position3d.y;
        const dz = activeSat.position3d.z - debrisSat.position3d.z;
        const distanceScaled = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        // Scale back to physical kilometers
        const distanceKm = distanceScaled * 1275.6;

        if (distanceKm < 350) {
          const dangerLevel = distanceKm < 150 ? 'DANGER' : 'WARNING';
          
          // Set threat markers
          activeSat.threatLevel = dangerLevel;
          activeSat.threatDetails = `Conjunction danger with ${debrisSat.name}. Distance: ${distanceKm.toFixed(1)} km.`;
          
          // Also set on debris for visual coloring of both rows in the list
          debrisSat.threatLevel = dangerLevel;
          debrisSat.threatDetails = `Intersection route with ${activeSat.name}. Distance: ${distanceKm.toFixed(1)} km.`;

          // Threat probability calculation: P = 100 * e^(-dist / 120)
          const probability = 100 * Math.exp(-distanceKm / 120);

          conjunctions.push({
            activeId: activeSat.id,
            activeName: activeSat.name,
            debrisId: debrisSat.id,
            debrisName: debrisSat.name,
            distance: distanceKm,
            probability: probability,
            dangerLevel: dangerLevel
          });

          // Log warning alerts periodically (approx. once every 15 ticks)
          if (Math.random() < 0.08) {
            store.addLog(`[ALERT-NETRA] Proximity warning for ${activeSat.name} and ${debrisSat.name}. Miss distance: ${distanceKm.toFixed(1)} km.`, 'danger');
          }
        }
      }
    });
  });

  // Update global state store activeConjunctions
  store.state.activeConjunctions = conjunctions;
  renderConjunctionMatrix(conjunctions);
}

function renderConjunctionMatrix(conjunctions) {
  const container = document.getElementById('conjunction-list-container');
  if (!container) return;

  container.innerHTML = '';

  if (conjunctions.length === 0) {
    container.innerHTML = `
      <div class="alert-card warning-only" style="background: rgba(74, 222, 128, 0.05); border-color: rgba(74, 222, 128, 0.3); display: flex; flex-direction: column;">
        <div class="alert-card-header">
          <span class="alert-card-title" style="color: hsl(var(--color-green)); text-shadow: 0 0 6px hsl(var(--color-green));">CORRIDORS SECURE</span>
          <i data-lucide="shield" style="width: 14px; height: 14px; color: hsl(var(--color-green));"></i>
        </div>
        <span class="alert-card-desc">All orbital paths verified. No conjunction risks detected in monitoring corridors.</span>
      </div>
    `;
    lucide.createIcons();
    // Stop alarm sound if active
    const alertsPanel = document.getElementById('panel-alerts-weather');
    if (alertsPanel) alertsPanel.className = 'hud-panel';
    audio.stopAlarm();
    return;
  }

  let hasDanger = false;

  conjunctions.forEach(c => {
    const isDanger = c.dangerLevel === 'DANGER';
    if (isDanger) hasDanger = true;

    const reqDeltaV = isDanger ? 1.85 : 1.45;
    const cardClass = isDanger ? 'alert-card animate-pulse-red' : 'alert-card warning-only';
    const alertTitle = isDanger ? 'CRITICAL CONJUNCTION ALERT' : 'GEOMETRIC PROXIMITY WARNING';
    const iconName = isDanger ? 'alert-triangle' : 'alert-circle';
    const iconColor = isDanger ? 'hsl(var(--color-red))' : 'hsl(var(--color-amber))';

    const card = document.createElement('div');
    card.className = cardClass;
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.innerHTML = `
      <div class="alert-card-header">
        <span class="alert-card-title">${alertTitle}</span>
        <i data-lucide="${iconName}" style="width: 14px; height: 14px; color: ${iconColor};"></i>
      </div>
      <div class="alert-card-desc">
        <strong>${c.activeName}</strong> approaching <strong>${c.debrisName}</strong>.<br/>
        Proximity: <span style="font-family: var(--font-mono); color: #fff;">${c.distance.toFixed(1)} km</span> | 
        Threat Score: <span style="font-family: var(--font-mono); color: ${iconColor};">${c.probability.toFixed(1)}%</span>
      </div>
      <div class="ai-suggestion-box" style="margin-top: 6px; padding: 6px 10px;">
        <div class="ai-suggestion-title">Mitigation Vector</div>
        <div class="ai-suggestion-body" style="font-size: 0.65rem;">
          Recommend: Delta-V ${reqDeltaV} m/s PROGRADE burn. Alt shift: +${(reqDeltaV * 1.8).toFixed(1)} km.
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  lucide.createIcons();

  // Set the panel container highlight
  const alertsPanel = document.getElementById('panel-alerts-weather');
  if (alertsPanel) {
    if (hasDanger) {
      alertsPanel.className = 'hud-panel alert-active';
      if (store.getState().alarmActive) {
        audio.startAlarm();
      }
    } else {
      alertsPanel.className = 'hud-panel';
      audio.stopAlarm();
    }
  }
}
