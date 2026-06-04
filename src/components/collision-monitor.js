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
  const gaganyaan = sats.find(s => s.id === 'gaganyaan');
  const debris = sats.find(s => s.id === 'cosmos-debris');

  if (!gaganyaan || !debris || !gaganyaan.lat || !debris.lat) {
    clearConjunctionWarning();
    return;
  }

  // Calculate coordinates distance in 3D (scaled units)
  // Or compute great-circle distance + altitude difference.
  // In our propagator, scale is 5 units = 6378.1 km (Earth radius)
  if (gaganyaan.position3d && debris.position3d) {
    const dx = gaganyaan.position3d.x - debris.position3d.x;
    const dy = gaganyaan.position3d.y - debris.position3d.y;
    const dz = gaganyaan.position3d.z - debris.position3d.z;
    const distanceScaled = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    // Scale back to physical kilometers
    const distanceKm = distanceScaled * 1275.6;

    // Check collision danger: Threshold is 350km for initial warnings, 150km for critical red alert
    if (distanceKm < 350) {
      const dangerLevel = distanceKm < 150 ? 'DANGER' : 'WARNING';
      
      // Update global threat markers on gaganyaan and debris
      gaganyaan.threatLevel = dangerLevel;
      gaganyaan.threatDetails = `Conjunction danger with Cosmos-1408 fragment. Distance: ${distanceKm.toFixed(1)} km.`;
      
      // Trigger warning UI card styling
      alertCard.style.display = 'flex';
      
      if (dangerLevel === 'DANGER') {
        alertCard.className = 'alert-card animate-pulse-red';
        alertCard.querySelector('.alert-card-title').textContent = 'CRITICAL CONJUNCTION RED ALERT';
        document.getElementById('panel-alerts-weather').className = 'hud-panel alert-active';
        
        // If alarm enabled, start siren audio
        if (store.getState().alarmActive) {
          audio.startAlarm();
        }
      } else {
        alertCard.className = 'alert-card warning-only';
        alertCard.querySelector('.alert-card-title').textContent = 'GEOMETRIC CORRIDOR WARNING';
        document.getElementById('panel-alerts-weather').className = 'hud-panel';
      }

      detailsLabel.textContent = `Gaganyaan-1 intersects Debris corridor. Proximity: ${distanceKm.toFixed(1)} km. Relative speed: 7.68 km/s. Intersection in under 4 mins.`;
      
      // Calculate recommended Delta-V (closer = higher delta-v required to shift orbit enough)
      const reqDeltaV = distanceKm < 150 ? 1.85 : 1.45;
      solutionLabel.textContent = `PROGRADE thrust: Delta-V ${reqDeltaV} m/s. Raise orbit by +${(reqDeltaV * 1.8).toFixed(1)} km.`;
      
      // Log alert warning periodically to terminal (once every 15 seconds to prevent spam)
      if (Math.random() < 0.08) {
        store.addLog(`[ALERT-NETRA] Collision threat detected. Proximity: ${distanceKm.toFixed(1)} km. Mitigation recommended.`, 'danger');
      }
    } else {
      clearConjunctionWarning();
    }
  } else {
    clearConjunctionWarning();
  }
}

function clearConjunctionWarning() {
  if (alertCard) {
    alertCard.style.display = 'none';
    document.getElementById('panel-alerts-weather').className = 'hud-panel';
    solutionLabel.textContent = 'Operational corridors clear. No thrust required.';
    
    // Stop siren
    audio.stopAlarm();
  }
}
