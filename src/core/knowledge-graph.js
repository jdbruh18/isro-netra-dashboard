/**
 * ISRO NETRA Semantic Knowledge Graph & RCA Engine
 */

export class SemanticKnowledgeGraph {
  constructor() {
    this.nodes = new Map(); // nodeId -> NodeMetadata
    this.edges = []; // Array of { from, to, relationship, checkFn }
    this.initializeGraph();
  }

  initializeGraph() {
    // Add Nodes representing sensors, environmental factors, and subsystem metrics
    this.addNode('SolarWindSpeed', 'Space Weather Sensor', 'Solar Wind Velocity (km/s)');
    this.addNode('SolarProtonFlux', 'Space Weather Sensor', 'Proton Flux Density (pfu)');
    this.addNode('KpIndex', 'Space Weather Sensor', 'Geomagnetic Kp-Index Activity');
    
    this.addNode('AtmosphereDrag', 'Environmental Factor', 'LEO Atmospheric Density Expansion');
    this.addNode('IonosphereScintillation', 'Environmental Factor', 'Ionospheric Scintillation Scattering');
    this.addNode('AvionicsSEURisk', 'Avionics System', 'Single Event Upset (SEU) Rate');
    
    this.addNode('Altitude', 'Orbital Subsystem', 'Orbital Semi-Major Axis altitude (km)');
    this.addNode('SolarGeneration', 'Power Subsystem', 'Solar Panels Current Generation (W)');
    this.addNode('BatterySoC', 'Power Subsystem', 'Battery State of Charge (%)');
    this.addNode('BatteryTemp', 'Thermal Subsystem', 'Battery Bay Temperature (°C)');
    this.addNode('ThermalStress', 'Thermal Subsystem', 'Thermal Gradient Stress Delta (°C)');
    this.addNode('DownlinkSNR', 'Communications Subsystem', 'Telemetry Downlink Signal SNR (dB)');

    // Add Directed causality linkages with check predicates
    this.addEdge('SolarWindSpeed', 'AtmosphereDrag', 'heats the thermosphere expanding gas density layers', (sat, weather) => weather.solarWindSpeed > 500);
    this.addEdge('AtmosphereDrag', 'Altitude', 'increases drag forces triggering orbital decay', (sat, weather) => weather.solarWindSpeed > 500 && sat.alt < 600);
    
    this.addEdge('SolarProtonFlux', 'AvionicsSEURisk', 'spikes ionizing radiation fluxes causing SEU bit flips', (sat, weather) => weather.solarProtonFlux > 15.0);
    this.addEdge('SolarProtonFlux', 'BatteryTemp', 'induces electrostatic discharge heating currents in batteries', (sat, weather) => weather.solarProtonFlux > 15.0);
    this.addEdge('SolarProtonFlux', 'SolarGeneration', 'degrades photovoltaic cell conversion rates', (sat, weather) => sat.radiation && sat.radiation.cumulativeDoseRad > 2.0);
    
    this.addEdge('KpIndex', 'IonosphereScintillation', 'creates ionospheric scintillation path delays', (sat, weather) => weather.kpIndex >= 4.5);
    this.addEdge('IonosphereScintillation', 'DownlinkSNR', 'causes RF signal scattering and fades', (sat, weather) => weather.kpIndex >= 4.5);
    
    this.addEdge('BatteryTemp', 'ThermalStress', 'exceeds passive radiator heat rejection boundaries', (sat, weather) => sat.thermal && sat.thermal.thermalStress > 5.0);
    this.addEdge('SolarGeneration', 'BatterySoC', 'depletes battery reserves due to net power deficits', (sat, weather) => sat.power && (sat.power.solarGenerationW - sat.power.powerConsumptionW < 0));
  }

  addNode(id, type, description) {
    this.nodes.set(id, { id, type, description });
  }

  addEdge(from, to, relationship, checkFn) {
    this.edges.push({ from, to, relationship, checkFn });
  }

  // Back-propagates graph from symptom nodes to root sensors
  analyzeRootCause(sat, weather) {
    const activeAnomalies = sat.anomalies ? sat.anomalies.activeList : [];
    const chains = [];

    const anomalyNodeMap = {
      'THERMAL_STRESS_ANOMALY': 'ThermalStress',
      'LOW_POWER_ANOMALY': 'BatterySoC',
      'IONOSPHERIC_SCINTILLATION_ANOMALY': 'DownlinkSNR',
      'DRAG_DECAY_ANOMALY': 'Altitude',
      'RADIATION_SEU_RISK': 'AvionicsSEURisk'
    };

    activeAnomalies.forEach(anomaly => {
      const startNode = anomalyNodeMap[anomaly];
      if (!startNode) return;

      const path = [];
      const visited = new Set();
      
      this.findCausationPath(startNode, sat, weather, path, visited);

      if (path.length > 0) {
        chains.push({
          anomaly: anomaly,
          node: startNode,
          chain: path.reverse() // Show chronological flow: Root Cause -> Symptom
        });
      }
    });

    return {
      satelliteId: sat.id,
      timestamp: new Date().toISOString(),
      activeAnomalies: activeAnomalies,
      chains: chains
    };
  }

  findCausationPath(currentNode, sat, weather, path, visited) {
    visited.add(currentNode);
    
    // Scan for active triggers leading into the current node
    const activeIncoming = this.edges.filter(edge => edge.to === currentNode && edge.checkFn(sat, weather));

    if (activeIncoming.length === 0) {
      const nodeMeta = this.nodes.get(currentNode);
      path.push({
        nodeId: currentNode,
        type: nodeMeta ? nodeMeta.type : 'Unknown',
        description: nodeMeta ? nodeMeta.description : 'Unknown',
        relationship: 'Primary Root Cause Trigger'
      });
      return;
    }

    const nodeMeta = this.nodes.get(currentNode);
    path.push({
      nodeId: currentNode,
      type: nodeMeta ? nodeMeta.type : 'Unknown',
      description: nodeMeta ? nodeMeta.description : 'Unknown',
      relationship: activeIncoming[0].relationship
    });

    const parentNode = activeIncoming[0].from;
    if (!visited.has(parentNode)) {
      this.findCausationPath(parentNode, sat, weather, path, visited);
    }
  }
}
