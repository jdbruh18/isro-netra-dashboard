/**
 * Space Weather Database & Aditya-L1 Sensor Constants.
 * Simulates raw values from Indian solar observatory Aditya-L1 payloads:
 * ASPEX (Aditya Solar wind Particle Experiment)
 * PAPA (Plasma Analyser Package for Aditya)
 * MAG (Tri-axial High Resolution Digital Magnetometer)
 */

export const ADITYA_SENSORS_SCHEMA = {
  ASPEX: {
    name: "Aditya Solar wind Particle Experiment",
    telemetry: [
      { id: "sw_speed", name: "Solar Wind Speed", unit: "km/s", normMin: 300, normMax: 500 },
      { id: "sw_density", name: "Solar Wind Density", unit: "n/cm3", normMin: 3, normMax: 10 }
    ]
  },
  PAPA: {
    name: "Plasma Analyser Package for Aditya",
    telemetry: [
      { id: "proton_flux", name: "Solar Proton Flux", unit: "pfu", normMin: 1, normMax: 20 },
      { id: "electron_temp", name: "Electron Temperature", unit: "K", normMin: 50000, normMax: 150000 }
    ]
  },
  MAG: {
    name: "Tri-axial High Resolution Digital Magnetometer",
    telemetry: [
      { id: "mag_x", name: "Interplanetary Magnetic Field (X)", unit: "nT", normMin: -10, normMax: 10 },
      { id: "mag_y", name: "Interplanetary Magnetic Field (Y)", unit: "nT", normMin: -10, normMax: 10 },
      { id: "mag_z", name: "Interplanetary Magnetic Field (Z)", unit: "nT", normMin: -10, normMax: 10 }
    ]
  }
};

// Historic Solar flares and geomagnetic indices
export const SOLAR_STORM_EVENTS_HISTORY = [
  {
    id: "evt-001",
    timestamp: "2026-05-12T04:12:00Z",
    class: "X1.5 Flare",
    sourceRegion: "Active Region 3241",
    kpMax: 6.7,
    status: "RESOLVED",
    impact: "Moderate HF radio blackout, NavIC signal degradation recorded at Port Blair station."
  },
  {
    id: "evt-002",
    timestamp: "2026-05-28T18:45:00Z",
    class: "M8.4 Flare",
    sourceRegion: "Active Region 3254",
    kpMax: 4.8,
    status: "RESOLVED",
    impact: "Minor proton flux elevation, solar cells on Cartosat-3 output reduced by 1.2% temporarily."
  },
  {
    id: "evt-003",
    timestamp: "2026-06-03T11:00:00Z",
    class: "X2.1 Flare",
    sourceRegion: "Active Region 3260",
    kpMax: 7.2,
    status: "ACTIVE",
    impact: "Severe Geomagnetic Storm. Polar orbits undergoing orbital drag expansion. Gemini auto-diagnostic recommended."
  }
];

// Determine Geomagnetic Storm threat status based on Kp index
export function getKpThreatLevel(kp) {
  if (kp < 4.0) return { label: "QUIET", class: "normal", code: 0 };
  if (kp < 5.0) return { label: "ACTIVE", class: "warning", code: 1 };
  if (kp < 6.0) return { label: "MINOR STORM", class: "warning", code: 2 };
  if (kp < 7.0) return { label: "MODERATE STORM", class: "danger", code: 3 };
  return { label: "SEVERE GEOMAGNETIC STORM", class: "danger", code: 4 };
}
