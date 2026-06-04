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

    // 2. Perform collision conjunction analysis
    analyzeConjunctionRisks(sats);
  });
}

function renderAssetList(sats) {
  if (!assetListContainer) return;

  const activeId = store.getState().activeSatelliteId;
  assetListContainer.innerHTML = '';

  sats.forEach((s) => {
    // Determine status color dot
    let dotClass = 'active';
    if (s.threatLevel === 'WARNING') dotClass = 'warning';
    if (s.threatLevel === 'DANGER') dotClass = 'danger';

    const row = document.createElement('div');
    row.className = `satellite-row ${s.id === activeId ? 'selected' : ''}`;
    row.addEventListener('click', () => {
      store.updateState('activeSatelliteId', s.id);
      audio.playClick();
      
      // Update Detail UI panel metadata
      document.getElementById('sat-detail-name').textContent = s.name;
      document.getElementById('sat-detail-alt').textContent = `${s.alt.toFixed(1)} km`;
      document.getElementById('sat-detail-vel').textContent = `${s.velocity.toFixed(2)} km/s`;
      document.getElementById('sat-detail-lat').textContent = `${s.lat ? s.lat.toFixed(4) : '0.0000'}° N`;
      document.getElementById('sat-detail-lng').textContent = `${s.lng ? s.lng.toFixed(4) : '0.0000'}° E`;
      document.getElementById('sat-detail-status').textContent = s.threatLevel === 'NORMAL' ? 'ORBIT OK' : 'CORRIDOR RISK';
      
      const statVal = document.getElementById('sat-detail-status');
      if (s.threatLevel === 'NORMAL') {
        statVal.className = 'sat-details-val normal';
      } else {
        statVal.className = 'sat-details-val danger';
      }
    });

    const leftSec = document.createElement('div');
    leftSec.className = 'sat-row-left';
    leftSec.innerHTML = `
      <span class="sat-row-name">${s.name}</span>
      <span class="sat-row-type">${s.owner} | ${s.type}</span>
    `;

    const rightSec = document.createElement('div');
    rightSec.className = 'sat-row-right';
    rightSec.innerHTML = `
      <span class="status-dot ${dotClass}"></span>
      <span class="sat-row-type" style="font-family:var(--font-mono);">${s.alt.toFixed(0)} km</span>
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
