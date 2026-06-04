import store from '../core/state.js';

let canvas, ctx;

export function initSpaceWeather() {
  canvas = document.getElementById('weather-chart');
  if (!canvas) return;

  ctx = canvas.getContext('2d');

  // Adjust canvas pixel density for crisp retina rendering
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Subscribe to spaceWeather state changes
  store.subscribe('spaceWeather', (weather) => {
    // 1. Update text fields in UI
    document.getElementById('lbl-kp-index').textContent = `${weather.kpIndex.toFixed(1)} Kp`;
    
    // Set color coding depending on geomagnetic storm severity
    const kpElement = document.getElementById('lbl-kp-index');
    if (weather.kpIndex >= 6.0) {
      kpElement.className = 'metric-value danger animate-flash';
    } else if (weather.kpIndex >= 4.5) {
      kpElement.className = 'metric-value warning';
    } else {
      kpElement.className = 'metric-value normal';
    }

    document.getElementById('val-solar-wind').textContent = `${weather.solarWindSpeed} km/s`;
    document.getElementById('val-mag-flux').textContent = `${weather.magZ.toFixed(1)} nT`;

    // 2. Render rolling timeline chart
    drawWeatherChart(weather.fluxHistory);
  });
}

function resizeCanvas() {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = 120 * window.devicePixelRatio; // lock height to 120px
}

function drawWeatherChart(history) {
  if (!ctx || !canvas) return;

  const w = canvas.width;
  const h = canvas.height;
  
  // Clear canvas
  ctx.clearRect(0, 0, w, h);

  // Draw background grid lines
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.04)';
  ctx.lineWidth = 1;
  const gridSpacing = 20 * window.devicePixelRatio;
  
  for (let x = 0; x < w; x += gridSpacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += gridSpacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Draw alert threshold lines (e.g. Alert at 50 pfu)
  const thresholdY = h - (50 / 160) * h; // mapped to height scale
  ctx.strokeStyle = 'rgba(255, 0, 60, 0.2)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(0, thresholdY);
  ctx.lineTo(w, thresholdY);
  ctx.stroke();
  ctx.setLineDash([]); // reset

  // Label for alert threshold
  ctx.font = `${8 * window.devicePixelRatio}px Share Tech Mono`;
  ctx.fillStyle = 'rgba(255, 0, 60, 0.4)';
  ctx.fillText('CRITICAL PROTON STORM CORRIDOR (>50 pfu)', 10 * window.devicePixelRatio, thresholdY - 4);

  if (!history || history.length < 2) return;

  // Scale calculations (max value expected around 160 pfu)
  const maxVal = 160;
  const points = [];
  const stepX = w / (history.length - 1);

  for (let i = 0; i < history.length; i++) {
    const val = history[i];
    const px = i * stepX;
    // Map value to canvas height (invert coordinates since Y=0 is top)
    const py = h - (val / maxVal) * h;
    points.push({ x: px, y: py });
  }

  // 3. Draw gradient area under curve
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, 'rgba(255, 183, 0, 0.15)'); // Solar orange glow
  gradient.addColorStop(1, 'rgba(255, 183, 0, 0.0)');
  
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(points[0].x, h);
  for (let p of points) {
    ctx.lineTo(p.x, p.y);
  }
  ctx.lineTo(points[points.length - 1].x, h);
  ctx.closePath();
  ctx.fill();

  // 4. Draw stroke line
  ctx.strokeStyle = 'rgba(255, 183, 0, 0.85)'; // Neon Amber line
  ctx.lineWidth = 2 * window.devicePixelRatio;
  ctx.shadowColor = 'rgba(255, 183, 0, 0.5)';
  ctx.shadowBlur = 8;
  
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
  
  // Reset shadow effects for other operations
  ctx.shadowBlur = 0;

  // 5. Draw flashing node marker on latest telemetry point
  const lastP = points[points.length - 1];
  const lastVal = history[history.length - 1];
  const isHigh = lastVal > 50;

  ctx.fillStyle = isHigh ? 'rgba(255, 0, 60, 1)' : 'rgba(255, 183, 0, 1)';
  ctx.beginPath();
  ctx.arc(lastP.x, lastP.y, 4 * window.devicePixelRatio, 0, Math.PI * 2);
  ctx.fill();

  // Pulse ring around point
  const pulseRadius = (4 + (Date.now() % 1000) / 100) * window.devicePixelRatio;
  ctx.strokeStyle = isHigh ? 'rgba(255, 0, 60, 0.4)' : 'rgba(255, 183, 0, 0.4)';
  ctx.lineWidth = 1 * window.devicePixelRatio;
  ctx.beginPath();
  ctx.arc(lastP.x, lastP.y, pulseRadius, 0, Math.PI * 2);
  ctx.stroke();

  // Text label for latest value
  ctx.fillStyle = '#fff';
  ctx.font = `${9 * window.devicePixelRatio}px Share Tech Mono`;
  ctx.fillText(
    `${lastVal.toFixed(1)} pfu`, 
    lastP.x - (50 * window.devicePixelRatio), 
    lastP.y - (8 * window.devicePixelRatio)
  );
}
