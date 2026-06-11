import store from '../core/state.js';
import { SemanticKnowledgeGraph } from '../core/knowledge-graph.js';
import audio from '../core/audio.js';

let graphInstance = null;

export function initRootCauseAnalyzer() {
  graphInstance = new SemanticKnowledgeGraph();

  const container = document.getElementById('subsystem-rca-container');
  const resultsTree = document.getElementById('rca-results-tree');
  const satSelect = document.getElementById('rca-sat-select');
  const triggerBtn = document.getElementById('btn-trigger-rca');

  if (!container || !resultsTree || !satSelect || !triggerBtn) return;

  // Listen for activation event
  document.addEventListener('subsystem-rca-activated', () => {
    runAnalysis();
  });

  // Subscribe to live state updates to populate dropdown
  store.subscribe('satellites', (satellites) => {
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
      }
    }
  });

  triggerBtn.addEventListener('click', () => {
    audio.playClick();
    runAnalysis();
  });

  satSelect.addEventListener('change', () => {
    audio.playClick();
    runAnalysis();
  });

  async function runAnalysis() {
    const satelliteId = satSelect.value;
    resultsTree.innerHTML = `<div style="text-align: center; color: hsl(var(--color-cyan)); margin-top: 20px;">
      <span class="scanning-loader">DIAGNOSTIC SEARCH IN PROGRESS...</span>
    </div>`;

    const isOnline = store.isOnline;
    let data = null;

    if (isOnline) {
      try {
        const res = await fetch(`/api/telemetry/rca?satelliteId=${satelliteId}`);
        if (!res.ok) throw new Error("RCA API request failed");
        data = await res.json();
      } catch (err) {
        console.warn("RCA API failed, falling back to local graph evaluation", err);
      }
    }

    // Fallback to local evaluation (standalone or API failure)
    if (!data) {
      const satellites = store.getState().satellites || [];
      const sat = satellites.find(s => s.id === satelliteId);
      const weather = store.getState().spaceWeather || {};

      if (!sat) {
        resultsTree.innerHTML = `<div style="text-align: center; color: hsl(var(--color-red)); margin-top: 20px;">ERROR: Spacecraft data not found.</div>`;
        return;
      }

      data = graphInstance.analyzeRootCause(sat, weather);
    }

    renderRcaTree(data);
  }
}

function renderRcaTree(data) {
  const resultsTree = document.getElementById('rca-results-tree');
  if (!resultsTree) return;

  resultsTree.innerHTML = '';

  const activeAnomalies = data.activeAnomalies || [];
  const chains = data.chains || [];

  if (activeAnomalies.length === 0) {
    resultsTree.innerHTML = `
      <div style="border: 1px solid rgba(34, 197, 94, 0.2); background: rgba(34, 197, 94, 0.05); padding: 15px; border-radius: 4px; text-align: center;">
        <div style="color: hsl(var(--color-green)); font-weight: bold; font-size: 0.8rem; margin-bottom: 5px;">
          ✓ ALL SUBSYSTEMS NOMINAL
        </div>
        <div style="color: #94a3b8; font-size: 0.65rem;">
          No active anomalies detected on this space asset. Semantic causal predicates validated.
        </div>
      </div>
    `;
    return;
  }

  // Draw each causal chain
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.gap = '15px';

  const title = document.createElement('div');
  title.style.fontSize = '0.65rem';
  title.style.color = 'hsl(var(--color-red))';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '5px';
  title.textContent = `ALERT: ${activeAnomalies.length} ACTIVE SUBSYSTEM ANOMALIES DETECTED`;
  wrapper.appendChild(title);

  chains.forEach(c => {
    const chainBox = document.createElement('div');
    chainBox.style.border = '1px solid rgba(239, 68, 68, 0.2)';
    chainBox.style.background = 'rgba(239, 68, 68, 0.02)';
    chainBox.style.borderRadius = '4px';
    chainBox.style.padding = '10px';

    const header = document.createElement('div');
    header.style.fontSize = '0.65rem';
    header.style.color = '#f87171';
    header.style.fontWeight = '600';
    header.style.marginBottom = '10px';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.innerHTML = `<span>ANOMALY: ${c.anomaly}</span><span style="font-family: monospace; font-size: 0.6rem; color: #64748b;">ROOT: ${c.chain[0]?.nodeId || 'Unknown'}</span>`;
    chainBox.appendChild(header);

    const treeContainer = document.createElement('div');
    treeContainer.style.display = 'flex';
    treeContainer.style.flexDirection = 'column';
    treeContainer.style.gap = '12px';
    treeContainer.style.position = 'relative';
    treeContainer.style.paddingLeft = '12px';
    treeContainer.style.borderLeft = '1px dashed rgba(239, 68, 68, 0.3)';

    c.chain.forEach((node, idx) => {
      const isRoot = idx === 0;
      const isLeaf = idx === c.chain.length - 1;

      const nodeRow = document.createElement('div');
      nodeRow.style.display = 'flex';
      nodeRow.style.flexDirection = 'column';
      nodeRow.style.gap = '2px';
      nodeRow.style.position = 'relative';

      // Left indicator dot
      const dot = document.createElement('div');
      dot.style.position = 'absolute';
      dot.style.left = '-16px';
      dot.style.top = '4px';
      dot.style.width = '8px';
      dot.style.height = '8px';
      dot.style.borderRadius = '50%';
      dot.style.background = isRoot ? 'hsl(var(--color-amber))' : (isLeaf ? 'hsl(var(--color-red))' : 'hsl(var(--color-cyan))');
      if (isLeaf) dot.classList.add('pulse');
      nodeRow.appendChild(dot);

      const nodeHeader = document.createElement('div');
      nodeHeader.style.display = 'flex';
      nodeHeader.style.alignItems = 'center';
      nodeHeader.style.gap = '6px';

      const nodeName = document.createElement('span');
      nodeName.style.fontWeight = 'bold';
      nodeName.style.color = isRoot ? 'hsl(var(--color-amber))' : (isLeaf ? '#f87171' : 'hsl(var(--color-cyan))');
      nodeName.textContent = node.nodeId;

      const nodeType = document.createElement('span');
      nodeType.style.fontSize = '0.55rem';
      nodeType.style.color = '#64748b';
      nodeType.style.background = 'rgba(255,255,255,0.03)';
      nodeType.style.padding = '1px 4px';
      nodeType.style.borderRadius = '2px';
      nodeType.textContent = node.type;

      nodeHeader.appendChild(nodeName);
      nodeHeader.appendChild(nodeType);
      nodeRow.appendChild(nodeHeader);

      const nodeDesc = document.createElement('div');
      nodeDesc.style.fontSize = '0.6rem';
      nodeDesc.style.color = '#94a3b8';
      nodeDesc.textContent = node.description;
      nodeRow.appendChild(nodeDesc);

      if (!isRoot) {
        const rel = document.createElement('div');
        rel.style.fontSize = '0.55rem';
        rel.style.color = '#fca5a5';
        rel.style.fontStyle = 'italic';
        rel.style.paddingLeft = '5px';
        rel.style.borderLeft = '2px solid rgba(239, 68, 68, 0.15)';
        rel.style.marginTop = '-8px';
        rel.style.marginBottom = '2px';
        rel.textContent = `↳ ${node.relationship}`;
        treeContainer.appendChild(rel);
      }

      treeContainer.appendChild(nodeRow);
    });

    chainBox.appendChild(treeContainer);
    wrapper.appendChild(chainBox);
  });

  resultsTree.appendChild(wrapper);
}
