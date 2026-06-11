import store from '../core/state.js';

let canvas, ctx;
let satSelect, metricSelect;
let activeSatelliteId = 'gaganyaan';
let activeMetric = 'batterySoC';

let chartData = [];
let localMemoryBuffer = {};
let offlineMode = false;

// Metric Metadata for styling, units, and scaling
const METRIC_META = {
  batterySoC: {
    label: 'Battery State of Charge',
    unit: '%',
    color: 'rgb(168, 85, 247)', // Cyber Purple
    shadowColor: 'rgba(168, 85, 247, 0.4)',
    min: 0,
    max: 100
  },
  batteryTemp: {
    label: 'Battery Temperature',
    unit: '°C',
    color: 'rgb(245, 158, 11)', // Amber Warning
    shadowColor: 'rgba(245, 158, 11, 0.4)',
    min: -10,
    max: 60
  },
  altitude: {
    label: 'Orbital Altitude',
    unit: 'km',
    color: 'rgb(6, 182, 212)', // Cyan Orbit
    shadowColor: 'rgba(6, 182, 212, 0.4)',
    min: 100,
    max: 40000
  },
  downlinkSNR: {
    label: 'Downlink SNR',
    unit: 'dB',
    color: 'rgb(34, 197, 94)', // Green Signal
    shadowColor: 'rgba(34, 197, 94, 0.4)',
    min: 0,
    max: 35
  }
};

export function initSubsystemCharts() {
  canvas = document.getElementById('subsystem-history-chart');
  satSelect = document.getElementById('chart-sat-select');
  metricSelect = document.getElementById('chart-metric-select');

  if (!canvas || !satSelect || !metricSelect) return;

  ctx = canvas.getContext('2d');

  activeSatelliteId = satSelect.value;
  activeMetric = metricSelect.value;

  // Bind change handlers to selectors
  satSelect.addEventListener('change', () => {
    activeSatelliteId = satSelect.value;
    refreshData();
  });

  metricSelect.addEventListener('change', () => {
    activeMetric = metricSelect.value;
    refreshData();
  });

  // Listen to tab activation custom event to handle layout and drawing
  document.addEventListener('subsystem-charts-activated', () => {
    resizeCanvas();
    refreshData();
  });

  window.addEventListener('resize', resizeCanvas);

  // Subscribe to live state updates to populate local memory backup
  store.subscribe('satellites', (satellites) => {
    // Dynamically rebuild satellite selector options
    const activeSats = satellites.filter(s => s.category !== 'debris' && s.type !== 'Space Debris' && s.id !== 'cosmos-debris');
    const currentOptions = Array.from(satSelect.options).map(o => o.value);
    const activeSatIds = activeSats.map(s => s.id);
    
    if (JSON.stringify(currentOptions) !== JSON.stringify(activeSatIds)) {
      const prevVal = satSelect.value;
      satSelect.innerHTML = '';
      activeSats.forEach(sat => {
        const opt = document.createElement('option');
        opt.value = sat.id;
        opt.textContent = sat.name;
        satSelect.appendChild(opt);
      });
      if (activeSatIds.includes(prevVal)) {
        satSelect.value = prevVal;
      } else if (activeSatIds.length > 0) {
        satSelect.value = activeSatIds[0];
        activeSatelliteId = satSelect.value;
      }
    }

    satellites.forEach(sat => {
      const isDebris = sat.id === 'cosmos-debris' || sat.category === 'debris';
      if (isDebris) return;

      const historyPoint = {
        timestamp: new Date().toISOString(),
        batterySoC: sat.power ? sat.power.batterySoC : 0.0,
        batteryTemp: sat.thermal ? sat.thermal.battTemp : 0.0,
        altitude: sat.orbit ? sat.orbit.alt : sat.alt,
        downlinkSNR: sat.communications ? sat.communications.downlinkSNR : 0.0
      };

      if (!localMemoryBuffer[sat.id]) {
        localMemoryBuffer[sat.id] = [];
      }

      const now = Date.now();
      const lastPoint = localMemoryBuffer[sat.id][localMemoryBuffer[sat.id].length - 1];
      // Capture local metric point roughly once per tick (approx 1s)
      if (!lastPoint || (now - new Date(lastPoint.timestamp).getTime() >= 900)) {
        localMemoryBuffer[sat.id].push(historyPoint);
        if (localMemoryBuffer[sat.id].length > 50) {
          localMemoryBuffer[sat.id].shift();
        }
      }
    });

    // If offline or fetch failed, fallback to local buffer and draw
    if (offlineMode) {
      chartData = localMemoryBuffer[activeSatelliteId] || [];
      drawChart();
    }
  });

  // Periodically refresh history from server (every 5 seconds) if tab visible and online
  setInterval(() => {
    const chartsContainer = document.getElementById('subsystem-charts-container');
    if (chartsContainer && chartsContainer.style.display !== 'none' && !offlineMode) {
      refreshData();
    }
  }, 5000);

  // Initial layout sizing and refresh
  resizeCanvas();
  refreshData();
}

function resizeCanvas() {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  
  if (rect.width > 0 && rect.height > 0) {
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
    drawChart();
  }
}

async function refreshData() {
  try {
    const response = await fetch(`/api/telemetry/history?satelliteId=${activeSatelliteId}&limit=50`);
    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0) {
        chartData = data;
        offlineMode = false;
        drawChart();
        return;
      }
    }
  } catch (err) {
    // Silence errors to prevent console clutter during local/offline operations
  }
  offlineMode = true;
  chartData = localMemoryBuffer[activeSatelliteId] || [];
  drawChart();
}

function drawChart() {
  if (!canvas || !ctx) return;

  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  // Clear Canvas bounds
  ctx.clearRect(0, 0, width, height);

  if (!chartData || chartData.length === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = '0.65rem monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('AWAITING TELEMETRY TICK OR STREAM SYNC...', width / 2, height / 2);
    return;
  }

  // Retrieve metrics
  const meta = METRIC_META[activeMetric];
  const points = chartData.map(d => ({
    timestamp: d.timestamp,
    value: parseFloat(d[activeMetric]) || 0
  }));

  const values = points.map(p => p.value);
  let minVal = Math.min(...values);
  let maxVal = Math.max(...values);

  // Set ranges with nice paddings
  if (activeMetric === 'batterySoC') {
    minVal = Math.min(minVal, 0);
    maxVal = Math.max(maxVal, 100);
  } else {
    let range = maxVal - minVal;
    if (range === 0) range = 1;
    minVal -= range * 0.1;
    maxVal += range * 0.1;
  }

  const paddingLeft = 40;
  const paddingRight = 15;
  const paddingTop = 20;
  const paddingBottom = 20;

  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  // Draw Dashed Y-axis Grid Lines
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);

  const gridSteps = 4;
  ctx.fillStyle = '#64748b';
  ctx.font = '0.55rem monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (let i = 0; i <= gridSteps; i++) {
    const ratio = i / gridSteps;
    const y = paddingTop + plotHeight * (1 - ratio);
    const val = minVal + ratio * (maxVal - minVal);

    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(width - paddingRight, y);
    ctx.stroke();

    ctx.fillText(val.toFixed(1) + meta.unit, paddingLeft - 5, y);
  }

  // Draw X-axis Timestamps
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const labelSteps = 4;
  for (let i = 0; i <= labelSteps; i++) {
    const ratio = i / labelSteps;
    const x = paddingLeft + plotWidth * ratio;
    const index = Math.min(points.length - 1, Math.floor(ratio * (points.length - 1)));
    if (points[index]) {
      const timeStr = new Date(points[index].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      ctx.fillText(timeStr, x, height - paddingBottom + 5);
    }
  }

  ctx.setLineDash([]); // Reset line styling to solid

  // Generate coordinates mapping
  const coords = points.map((p, idx) => {
    const x = paddingLeft + (idx / (points.length - 1)) * plotWidth;
    const y = paddingTop + plotHeight * (1 - (p.value - minVal) / (maxVal - minVal));
    return { x, y };
  });

  // Draw Cyber Glow Area Fill Gradient Underneath
  const grad = ctx.createLinearGradient(0, paddingTop, 0, height - paddingBottom);
  const colorRgb = meta.color;
  const baseColor = colorRgb.substring(4, colorRgb.length - 1);
  grad.addColorStop(0, `rgba(${baseColor}, 0.15)`);
  grad.addColorStop(1, `rgba(${baseColor}, 0.0)`);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(paddingLeft, height - paddingBottom);
  coords.forEach(c => {
    ctx.lineTo(c.x, c.y);
  });
  ctx.lineTo(coords[coords.length - 1].x, height - paddingBottom);
  ctx.closePath();
  ctx.fill();

  // Draw Neon Glow Line
  ctx.strokeStyle = meta.color;
  ctx.lineWidth = 2;
  
  ctx.shadowColor = meta.color;
  ctx.shadowBlur = 6;

  ctx.beginPath();
  ctx.moveTo(coords[0].x, coords[0].y);
  for (let i = 1; i < coords.length; i++) {
    ctx.lineTo(coords[i].x, coords[i].y);
  }
  ctx.stroke();

  ctx.shadowBlur = 0; // Turn off shadows

  // Draw endpoint marker dot
  const lastCoord = coords[coords.length - 1];
  ctx.fillStyle = meta.color;
  ctx.beginPath();
  ctx.arc(lastCoord.x, lastCoord.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Render text summary labels at the top
  const latestValue = values[values.length - 1];
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 0.65rem monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  
  const labelText = `${meta.label}: ${latestValue.toFixed(2)}${meta.unit} [MIN: ${Math.min(...values).toFixed(1)} | MAX: ${Math.max(...values).toFixed(1)}]`;
  ctx.fillText(labelText, width - paddingRight, paddingTop - 4);
}
