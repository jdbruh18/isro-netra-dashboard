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
  
  // Use nested orbit details if available
  const alt = sat.orbit ? sat.orbit.alt : sat.alt;
  const velocity = sat.orbit ? sat.orbit.velocity : sat.velocity;
  const lat = sat.orbit ? sat.orbit.lat : sat.lat;
  const lng = sat.orbit ? sat.orbit.lng : sat.lng;

  document.getElementById('sat-detail-alt').textContent = typeof alt === 'number' ? `${alt.toFixed(1)} km` : '---';
  document.getElementById('sat-detail-vel').textContent = typeof velocity === 'number' ? `${velocity.toFixed(2)} km/s` : '---';
  document.getElementById('sat-detail-lat').textContent = typeof lat === 'number' ? `${lat.toFixed(4)}° N` : '0.0000° N';
  document.getElementById('sat-detail-lng').textContent = typeof lng === 'number' ? `${lng.toFixed(4)}° E` : '0.0000° E';
  document.getElementById('sat-detail-status').textContent = sat.threatLevel === 'NORMAL' ? 'ORBIT OK' : 'CORRIDOR RISK';
  
  const statVal = document.getElementById('sat-detail-status');
  if (sat.threatLevel === 'NORMAL') {
    statVal.className = 'sat-details-val normal';
  } else {
    statVal.className = 'sat-details-val danger';
  }

  // Update subsystem health indicators (V3.1)
  const eclipseEl = document.getElementById('sat-detail-eclipse');
  const solarEl = document.getElementById('sat-detail-solar');
  const solarGenEl = document.getElementById('sat-detail-solar-gen');
  const socEl = document.getElementById('sat-detail-soc');
  const battEl = document.getElementById('sat-detail-batt-temp');
  const stressEl = document.getElementById('sat-detail-thermal-stress');
  const snrEl = document.getElementById('sat-detail-snr');
  const radEl = document.getElementById('sat-detail-radiation');
  const seuEl = document.getElementById('sat-detail-seu');
  const propEl = document.getElementById('sat-detail-propellant-mass');
  const fuelEl = document.getElementById('sat-detail-fuel');

  const isDebris = sat.id === 'cosmos-debris' || (sat.category && sat.category === 'debris') || (sat.name && sat.name.toLowerCase().includes('debris'));

  // Helper to safely set content and classes
  const setField = (el, text, className) => {
    if (el) {
      el.textContent = text;
      if (className !== undefined) el.className = className;
    }
  };

  if (isDebris) {
    setField(eclipseEl, 'INACTIVE', 'sat-details-val');
    setField(solarEl, '0.0 V');
    setField(solarGenEl, '0 W');
    setField(socEl, '0.0%', 'sat-details-val');
    setField(battEl, '0.0°C');
    setField(stressEl, '0.0°C');
    setField(snrEl, '0.0 dB', 'sat-details-val');
    setField(radEl, '0.00 Rad');
    setField(seuEl, '0 SEU');
    setField(propEl, '0.0 kg');
    setField(fuelEl, '0 psi', 'sat-details-val');
    return;
  }

  if (sat.orbit) {
    setField(eclipseEl, sat.orbit.inEclipse ? 'IN SHADOW' : 'SUNLIGHT', sat.orbit.inEclipse ? 'sat-details-val warning' : 'sat-details-val normal');
  } else {
    setField(eclipseEl, 'SUNLIGHT', 'sat-details-val normal');
  }

  if (sat.power) {
    setField(solarEl, `${sat.power.solarV.toFixed(1)} V`);
    setField(solarGenEl, `${sat.power.solarGenerationW.toFixed(0)} W`);
    
    let socClass = 'sat-details-val normal';
    if (sat.power.batterySoC < 30.0) socClass = 'sat-details-val danger';
    else if (sat.power.batterySoC < 65.0) socClass = 'sat-details-val warning';
    setField(socEl, `${sat.power.batterySoC.toFixed(1)}%`, socClass);
  } else {
    setField(solarEl, 'N/A');
    setField(solarGenEl, 'N/A');
    setField(socEl, 'N/A', 'sat-details-val');
  }

  if (sat.thermal) {
    setField(battEl, `${sat.thermal.battTemp.toFixed(1)}°C`);
    setField(stressEl, `${sat.thermal.thermalStress.toFixed(1)}°C`);
    
    let battClass = 'sat-details-val normal';
    if (sat.thermal.battTemp > 48.0) battClass = 'sat-details-val danger';
    else if (sat.thermal.battTemp > 45.0) battClass = 'sat-details-val warning';
    battEl.className = battClass;
  } else {
    setField(battEl, 'N/A');
    setField(stressEl, 'N/A');
  }

  if (sat.communications) {
    setField(snrEl, `${sat.communications.downlinkSNR.toFixed(1)} dB`);
    
    let snrClass = 'sat-details-val normal';
    if (sat.communications.downlinkSNR < 12.0) snrClass = 'sat-details-val danger';
    else if (sat.communications.downlinkSNR < 15.0) snrClass = 'sat-details-val warning';
    snrEl.className = snrClass;
  } else {
    setField(snrEl, 'N/A', 'sat-details-val');
  }

  if (sat.radiation) {
    setField(radEl, `${sat.radiation.cumulativeDoseRad.toFixed(2)} Rad`);
    setField(seuEl, `${sat.radiation.seuCount} SEU`);
  } else {
    setField(radEl, 'N/A');
    setField(seuEl, 'N/A');
  }

  if (sat.propulsion) {
    setField(propEl, `${sat.propulsion.propellantMassKg.toFixed(1)} kg`);
    setField(fuelEl, `${sat.propulsion.fuelPressurePsi.toFixed(0)} psi`, 'sat-details-val normal');
  } else {
    setField(propEl, 'N/A');
    setField(fuelEl, 'N/A', 'sat-details-val');
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
