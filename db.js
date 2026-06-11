import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCAL_DB_PATH = path.join(__dirname, 'db-local.json');

let firestoreInstance = null;
export let useLocalDb = false;
export let pgPool = null;
export let usePostgres = false;

// Default initial catalog database to seed if empty
const DEFAULT_SATELLITES = [
  {
    id: "gaganyaan",
    name: "Gaganyaan Crew Module",
    owner: "ISRO",
    type: "Crewed Spacecraft",
    lat: 15.3421,
    lng: 75.8922,
    alt: 405.23,
    velocity: 7.67,
    threatLevel: "NORMAL",
    threatDetails: "Normal orbital operations.",
    tle1: "1 99901U 26001A   26155.50000000  .00020000  00000-0  10000-3 0  9991",
    tle2: "2 99901  51.6400 120.5000 0005000  30.0000 330.0000 15.60000000    12",
    category: "indian",
    orbit: {
      lat: 15.3421,
      lng: 75.8922,
      alt: 405.23,
      velocity: 7.67,
      inEclipse: false,
      burnAdjustments: { alt: 0 }
    },
    thermal: {
      battTemp: 28.5,
      expectedBattTemp: 28.5,
      radiatorEfficiency: 0.95,
      thermalStress: 0.0
    },
    power: {
      solarV: 32.4,
      solarGenerationW: 280.0,
      batterySoC: 92.5,
      powerConsumptionW: 120.0
    },
    communications: {
      downlinkSNR: 24.5,
      signalQuality: 0.98
    },
    radiation: {
      cumulativeDoseRad: 4.12,
      seuProbability: 0.0001,
      seuCount: 0
    },
    propulsion: {
      fuelPressurePsi: 220.0,
      propellantMassKg: 400.0
    }
  },
  {
    id: "cosmos-debris",
    name: "Cosmos-1408 Debris #412",
    owner: "SL-14 (Debris)",
    type: "Space Debris",
    lat: 15.3510,
    lng: 75.8990,
    alt: 405.41,
    velocity: 7.68,
    threatLevel: "WARNING",
    threatDetails: "Intersection route with Gaganyaan capsule.",
    tle1: "1 99902U 21000A   26155.49900000  .00030000  00000-0  20000-3 0  9995",
    tle2: "2 99902  51.6420 120.4850 0005200  28.0000 332.0000 15.60150000    16",
    category: "debris",
    orbit: {
      lat: 15.3510,
      lng: 75.8990,
      alt: 405.41,
      velocity: 7.68,
      inEclipse: false,
      burnAdjustments: { alt: 0 }
    },
    thermal: {
      battTemp: 0.0,
      expectedBattTemp: 0.0,
      radiatorEfficiency: 0.0,
      thermalStress: 0.0
    },
    power: {
      solarV: 0.0,
      solarGenerationW: 0.0,
      batterySoC: 0.0,
      powerConsumptionW: 0.0
    },
    communications: {
      downlinkSNR: 0.0,
      signalQuality: 0.0
    },
    radiation: {
      cumulativeDoseRad: 0.0,
      seuProbability: 0.0,
      seuCount: 0
    },
    propulsion: {
      fuelPressurePsi: 0.0,
      propellantMassKg: 0.0
    }
  },
  {
    id: "cartosat-3",
    name: "Cartosat-3",
    owner: "ISRO",
    type: "Earth Observation",
    lat: -40.1245,
    lng: 130.4512,
    alt: 509.15,
    velocity: 7.61,
    threatLevel: "NORMAL",
    threatDetails: "Imaging payload operational.",
    tle1: "1 44804U 19081A   26155.50000000  .00001000  00000-0  50000-4 0  9992",
    tle2: "2 44804  97.4000 230.1200 0012000  90.0000 270.0000 15.20000000    13",
    category: "indian",
    orbit: {
      lat: -40.1245,
      lng: 130.4512,
      alt: 509.15,
      velocity: 7.61,
      inEclipse: false,
      burnAdjustments: { alt: 0 }
    },
    thermal: {
      battTemp: 27.2,
      expectedBattTemp: 27.2,
      radiatorEfficiency: 0.95,
      thermalStress: 0.0
    },
    power: {
      solarV: 31.8,
      solarGenerationW: 240.0,
      batterySoC: 88.0,
      powerConsumptionW: 100.0
    },
    communications: {
      downlinkSNR: 22.8,
      signalQuality: 0.97
    },
    radiation: {
      cumulativeDoseRad: 3.54,
      seuProbability: 0.00008,
      seuCount: 0
    },
    propulsion: {
      fuelPressurePsi: 180.0,
      propellantMassKg: 300.0
    }
  },
  {
    id: "navic-1i",
    name: "NavIC-1I (IRNSS-1I)",
    owner: "ISRO",
    type: "Regional Navigation",
    lat: 10.4512,
    lng: 80.1245,
    alt: 35786.11,
    velocity: 3.08,
    threatLevel: "NORMAL",
    threatDetails: "NavIC atomic clock synchronization stable.",
    tle1: "1 43286U 18035A   26155.50000000  .00000100  00000-0  00000-0 0  9993",
    tle2: "2 43286  29.0000  80.2000 0020000 180.0000 180.0000  1.00270000    14",
    category: "indian",
    orbit: {
      lat: 10.4512,
      lng: 80.1245,
      alt: 35786.11,
      velocity: 3.08,
      inEclipse: false,
      burnAdjustments: { alt: 0 }
    },
    thermal: {
      battTemp: 29.8,
      expectedBattTemp: 29.8,
      radiatorEfficiency: 0.95,
      thermalStress: 0.0
    },
    power: {
      solarV: 34.1,
      solarGenerationW: 450.0,
      batterySoC: 95.0,
      powerConsumptionW: 180.0
    },
    communications: {
      downlinkSNR: 25.1,
      signalQuality: 0.99
    },
    radiation: {
      cumulativeDoseRad: 12.8,
      seuProbability: 0.0005,
      seuCount: 0
    },
    propulsion: {
      fuelPressurePsi: 450.0,
      propellantMassKg: 800.0
    }
  },
  {
    id: "iss",
    name: "International Space Station",
    owner: "NASA/ROSCOSMOS",
    type: "Space Station",
    lat: 51.64,
    lng: 140.2,
    alt: 418.5,
    velocity: 7.66,
    threatLevel: "NORMAL",
    threatDetails: "Normal orbital tracking.",
    tle1: "1 25544U 98067A   26155.50000000  .00010000  00000-0  10000-3 0  9992",
    tle2: "2 25544  51.6400 140.2000 0005000  45.0000 315.0000 15.50000000    15",
    category: "active",
    orbit: {
      lat: 51.64,
      lng: 140.2,
      alt: 418.5,
      velocity: 7.66,
      inEclipse: false,
      burnAdjustments: { alt: 0 }
    },
    thermal: {
      battTemp: 26.8,
      expectedBattTemp: 26.8,
      radiatorEfficiency: 0.95,
      thermalStress: 0.0
    },
    power: {
      solarV: 120.0,
      solarGenerationW: 12000.0,
      batterySoC: 94.2,
      powerConsumptionW: 8000.0
    },
    communications: {
      downlinkSNR: 28.5,
      signalQuality: 0.99
    },
    radiation: {
      cumulativeDoseRad: 6.25,
      seuProbability: 0.00015,
      seuCount: 0
    },
    propulsion: {
      fuelPressurePsi: 240.0,
      propellantMassKg: 1500.0
    }
  },
  {
    id: "hubble",
    name: "Hubble Space Telescope",
    owner: "NASA/ESA",
    type: "Space Telescope",
    lat: 28.47,
    lng: 160.1,
    alt: 525.2,
    velocity: 7.59,
    threatLevel: "NORMAL",
    threatDetails: "Scientific observing windows active.",
    tle1: "1 20580U 90037B   26155.50000000  .00001000  00000-0  50000-4 0  9993",
    tle2: "2 20580  28.4700 160.1000 0003000  90.0000 270.0000 15.08000000    13",
    category: "active",
    orbit: {
      lat: 28.47,
      lng: 160.1,
      alt: 525.2,
      velocity: 7.59,
      inEclipse: false,
      burnAdjustments: { alt: 0 }
    },
    thermal: {
      battTemp: 18.4,
      expectedBattTemp: 18.4,
      radiatorEfficiency: 0.95,
      thermalStress: 0.0
    },
    power: {
      solarV: 33.2,
      solarGenerationW: 1200.0,
      batterySoC: 85.0,
      powerConsumptionW: 900.0
    },
    communications: {
      downlinkSNR: 20.4,
      signalQuality: 0.95
    },
    radiation: {
      cumulativeDoseRad: 8.82,
      seuProbability: 0.0002,
      seuCount: 0
    },
    propulsion: {
      fuelPressurePsi: 0.0,
      propellantMassKg: 0.0
    }
  },
  {
    id: "starlink-1007",
    name: "Starlink-1007",
    owner: "SPACEX",
    type: "Communication Satellite",
    lat: 53.0,
    lng: 180.5,
    alt: 550.1,
    velocity: 7.58,
    threatLevel: "NORMAL",
    threatDetails: "Broadband constellation operations.",
    tle1: "1 44713U 19074A   26155.50000000  .00005000  00000-0  80000-4 0  9994",
    tle2: "2 44713  53.0000 180.5000 0001000  30.0000 330.0000 15.06000000    11",
    category: "starlink",
    orbit: {
      lat: 53.0,
      lng: 180.5,
      alt: 550.1,
      velocity: 7.58,
      inEclipse: false,
      burnAdjustments: { alt: 0 }
    },
    thermal: {
      battTemp: 22.1,
      expectedBattTemp: 22.1,
      radiatorEfficiency: 0.95,
      thermalStress: 0.0
    },
    power: {
      solarV: 28.5,
      solarGenerationW: 400.0,
      batterySoC: 78.4,
      powerConsumptionW: 220.0
    },
    communications: {
      downlinkSNR: 18.2,
      signalQuality: 0.92
    },
    radiation: {
      cumulativeDoseRad: 2.15,
      seuProbability: 0.00005,
      seuCount: 0
    },
    propulsion: {
      fuelPressurePsi: 110.0,
      propellantMassKg: 50.0
    }
  },
  {
    id: "soho",
    name: "SOHO Solar Observatory",
    owner: "ESA/NASA",
    type: "Solar Probe",
    lat: 23.44,
    lng: 110.2,
    alt: 35786.11,
    velocity: 1.25,
    threatLevel: "NORMAL",
    threatDetails: "Deep space solar environment monitor.",
    tle1: "1 23743U 95115A   26155.50000000  .00000010  00000-0  00000-0 0  9995",
    tle2: "2 23743  23.4400 110.2000 0010000 180.0000 180.0000  1.00270000    12",
    category: "active",
    orbit: {
      lat: 23.44,
      lng: 110.2,
      alt: 35786.11,
      velocity: 1.25,
      inEclipse: false,
      burnAdjustments: { alt: 0 }
    },
    thermal: {
      battTemp: 32.5,
      expectedBattTemp: 32.5,
      radiatorEfficiency: 0.95,
      thermalStress: 0.0
    },
    power: {
      solarV: 35.8,
      solarGenerationW: 950.0,
      batterySoC: 92.0,
      powerConsumptionW: 650.0
    },
    communications: {
      downlinkSNR: 15.4,
      signalQuality: 0.85
    },
    radiation: {
      cumulativeDoseRad: 48.5,
      seuProbability: 0.0012,
      seuCount: 0
    },
    propulsion: {
      fuelPressurePsi: 320.0,
      propellantMassKg: 120.0
    }
  },
  {
    id: "jwst",
    name: "James Webb Space Telescope",
    owner: "NASA/ESA/CSA",
    type: "Space Telescope",
    lat: 0.0,
    lng: 0.0,
    alt: 1500000.0,
    velocity: 0.20,
    threatLevel: "NORMAL",
    threatDetails: "Deep space halo orbit tracking.",
    tle1: "1 50463U 21130A   26155.50000000  .00000005  00000-0  00000-0 0  9996",
    tle2: "2 50463  39.5800 135.2000 0001000  60.0000 300.0000  0.03660000    13",
    category: "active",
    orbit: {
      lat: 0.0,
      lng: 0.0,
      alt: 1500000.0,
      velocity: 0.20,
      inEclipse: false,
      burnAdjustments: { alt: 0 }
    },
    thermal: {
      battTemp: 20.5,
      expectedBattTemp: 20.5,
      radiatorEfficiency: 0.95,
      thermalStress: 0.0
    },
    power: {
      solarV: 34.5,
      solarGenerationW: 2000.0,
      batterySoC: 96.4,
      powerConsumptionW: 1200.0
    },
    communications: {
      downlinkSNR: 14.8,
      signalQuality: 0.82
    },
    radiation: {
      cumulativeDoseRad: 85.4,
      seuProbability: 0.002,
      seuCount: 0
    },
    propulsion: {
      fuelPressurePsi: 350.0,
      propellantMassKg: 150.0
    }
  },
  {
    id: "parker",
    name: "Parker Solar Probe",
    owner: "NASA",
    type: "Solar Probe",
    lat: 0.0,
    lng: 0.0,
    alt: 140000.0,
    velocity: 95.0,
    threatLevel: "NORMAL",
    threatDetails: "Heliocentric solar corona pass.",
    tle1: "1 43613U 18065A   26155.50000000  .00000010  00000-0  00000-0 0  9997",
    tle2: "2 43613  15.0000  45.0000 0005000  90.0000 270.0000  0.07300000    14",
    category: "active",
    orbit: {
      lat: 0.0,
      lng: 0.0,
      alt: 140000.0,
      velocity: 95.0,
      inEclipse: false,
      burnAdjustments: { alt: 0 }
    },
    thermal: {
      battTemp: 42.5,
      expectedBattTemp: 42.5,
      radiatorEfficiency: 0.98,
      thermalStress: 0.0
    },
    power: {
      solarV: 36.8,
      solarGenerationW: 3400.0,
      batterySoC: 88.0,
      powerConsumptionW: 850.0
    },
    communications: {
      downlinkSNR: 16.5,
      signalQuality: 0.88
    },
    radiation: {
      cumulativeDoseRad: 240.5,
      seuProbability: 0.005,
      seuCount: 0
    },
    propulsion: {
      fuelPressurePsi: 280.0,
      propellantMassKg: 80.0
    }
  },
  {
    id: "tiangong",
    name: "Tiangong Space Station",
    owner: "CNSA",
    type: "Space Station",
    lat: 41.58,
    lng: 150.3,
    alt: 390.5,
    velocity: 7.68,
    threatLevel: "NORMAL",
    threatDetails: "Manned station operations.",
    tle1: "1 48274U 21035A   26155.50000000  .00015000  00000-0  15000-3 0  9991",
    tle2: "2 48274  41.5840 150.3200 0008000  50.0000 310.0000 15.62000000    14",
    category: "active",
    orbit: {
      lat: 41.58,
      lng: 150.3,
      alt: 390.5,
      velocity: 7.68,
      inEclipse: false,
      burnAdjustments: { alt: 0 }
    },
    thermal: {
      battTemp: 25.4,
      expectedBattTemp: 25.4,
      radiatorEfficiency: 0.95,
      thermalStress: 0.0
    },
    power: {
      solarV: 115.0,
      solarGenerationW: 9000.0,
      batterySoC: 93.8,
      powerConsumptionW: 6200.0
    },
    communications: {
      downlinkSNR: 26.8,
      signalQuality: 0.98
    },
    radiation: {
      cumulativeDoseRad: 5.82,
      seuProbability: 0.00012,
      seuCount: 0
    },
    propulsion: {
      fuelPressurePsi: 230.0,
      propellantMassKg: 1200.0
    }
  },
  {
    id: "voyager1",
    name: "Voyager 1",
    owner: "NASA",
    type: "Interstellar Probe",
    lat: 0.0,
    lng: 0.0,
    alt: 24000000000.0,
    velocity: 17.0,
    threatLevel: "NORMAL",
    threatDetails: "Exploring the interstellar medium.",
    tle1: "1 10312U 77076A   26155.50000000  .00000000  00000-0  00000-0 0  9999",
    tle2: "2 10312  35.7000 280.5000 0000000   0.0000   0.0000  0.00000000     1",
    category: "active",
    orbit: {
      lat: 0.0,
      lng: 0.0,
      alt: 24000000000.0,
      velocity: 17.0,
      inEclipse: true,
      burnAdjustments: { alt: 0 }
    },
    thermal: {
      battTemp: 5.4,
      expectedBattTemp: 5.4,
      radiatorEfficiency: 0.45,
      thermalStress: 0.0
    },
    power: {
      solarV: 0.0,
      solarGenerationW: 0.0,
      batterySoC: 100.0,
      powerConsumptionW: 240.0
    },
    communications: {
      downlinkSNR: 6.8,
      signalQuality: 0.22
    },
    radiation: {
      cumulativeDoseRad: 45000.0,
      seuProbability: 0.055,
      seuCount: 0
    },
    propulsion: {
      fuelPressurePsi: 0.0,
      propellantMassKg: 0.0
    }
  }
];

function readLocalJson() {
  try {
    const raw = fs.readFileSync(LOCAL_DB_PATH, 'utf-8');
    const data = JSON.parse(raw || '{}');
    if (!data.satellites) {
      data.satellites = [...DEFAULT_SATELLITES];
    } else {
      // Upsert default satellites
      DEFAULT_SATELLITES.forEach(defSat => {
        const idx = data.satellites.findIndex(s => s.id === defSat.id);
        if (idx === -1) {
          data.satellites.push(defSat);
        } else {
          // Keep dynamic telemetry fields, but sync names/categories/TLE
          data.satellites[idx].name = defSat.name;
          data.satellites[idx].owner = defSat.owner;
          data.satellites[idx].type = defSat.type;
          data.satellites[idx].category = defSat.category;
          data.satellites[idx].tle1 = defSat.tle1;
          data.satellites[idx].tle2 = defSat.tle2;
          if (!data.satellites[idx].orbit) data.satellites[idx].orbit = defSat.orbit;
          if (!data.satellites[idx].thermal) data.satellites[idx].thermal = defSat.thermal;
          if (!data.satellites[idx].power) data.satellites[idx].power = defSat.power;
          if (!data.satellites[idx].communications) data.satellites[idx].communications = defSat.communications;
          if (!data.satellites[idx].radiation) data.satellites[idx].radiation = defSat.radiation;
          if (!data.satellites[idx].propulsion) data.satellites[idx].propulsion = defSat.propulsion;
        }
      });
      // Save merged copy back
      try {
        fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
      } catch (writeErr) {}
    }
    if (!data.telemetryLogs) data.telemetryLogs = [];
    if (!data.agentActions) data.agentActions = [];
    if (!data.webhooks) data.webhooks = [];
    return data;
  } catch (e) {
    return { satellites: [...DEFAULT_SATELLITES], telemetryLogs: [], agentActions: [], webhooks: [] };
  }
}

function writeLocalJson(data) {
  try {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {}
}

export async function initializeDb() {
  // 1. Try connecting to PostgreSQL / TimescaleDB if DATABASE_URL is set
  const pgUrl = process.env.DATABASE_URL;
  if (pgUrl) {
    try {
      const pg = await import('pg');
      const { Pool } = pg.default || pg;
      pgPool = new Pool({
        connectionString: pgUrl,
        connectionTimeoutMillis: 5000
      });
      const client = await pgPool.connect();
      client.release();
      usePostgres = true;
      console.log("PostgreSQL Database: Connected successfully.");
      await initializePostgresSchema();
      return;
    } catch (err) {
      console.warn("Failed to connect to PostgreSQL/TimescaleDB. Falling back to local/Firestore.", err.message);
    }
  }

  // 2. Fallback to Firestore
  const hasGcpConfig = process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (hasGcpConfig) {
    try {
      const { Firestore } = await import('@google-cloud/firestore');
      firestoreInstance = new Firestore();
      console.log("Firestore Database: Connection initialized successfully.");
      return;
    } catch (err) {
      console.warn("Failed to load @google-cloud/firestore. Falling back to local filesystem DB.", err);
      useLocalDb = true;
    }
  }

  // 3. Fallback to local file database
  useLocalDb = true;
  console.log(`Local Database: Active. Path: ${LOCAL_DB_PATH}`);
  
  if (!fs.existsSync(LOCAL_DB_PATH)) {
    const initialData = {
      satellites: DEFAULT_SATELLITES,
      telemetryLogs: [
        { timestamp: new Date().toLocaleTimeString(), text: "Local database seeded successfully.", type: "success" }
      ],
      agentActions: [],
      webhooks: []
    };
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(initialData, null, 2), 'utf-8');
  }
}

export async function initializePostgresSchema() {
  if (!pgPool) return;
  const client = await pgPool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS satellites (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        owner VARCHAR(50),
        type VARCHAR(50),
        lat DOUBLE PRECISION,
        lng DOUBLE PRECISION,
        alt DOUBLE PRECISION,
        velocity DOUBLE PRECISION,
        threat_level VARCHAR(20),
        threat_details TEXT,
        tle1 TEXT,
        tle2 TEXT,
        category VARCHAR(50),
        orbit JSONB,
        thermal JSONB,
        power JSONB,
        communications JSONB,
        radiation JSONB,
        propulsion JSONB,
        anomalies JSONB
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS telemetry_logs (
        id SERIAL PRIMARY KEY,
        timestamp VARCHAR(50) NOT NULL,
        text TEXT NOT NULL,
        type VARCHAR(20) NOT NULL,
        timestamp_ms BIGINT NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_actions (
        id SERIAL PRIMARY KEY,
        timestamp VARCHAR(50) NOT NULL,
        action_details JSONB NOT NULL,
        timestamp_ms BIGINT NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS webhooks (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        url TEXT NOT NULL,
        events JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS telemetry_history (
        id SERIAL PRIMARY KEY,
        satellite_id VARCHAR(50) NOT NULL,
        timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        altitude DOUBLE PRECISION NOT NULL,
        velocity DOUBLE PRECISION NOT NULL,
        battery_soc DOUBLE PRECISION NOT NULL,
        battery_temp DOUBLE PRECISION NOT NULL,
        thermal_stress DOUBLE PRECISION NOT NULL,
        downlink_snr DOUBLE PRECISION NOT NULL,
        propellant_mass DOUBLE PRECISION NOT NULL,
        fuel_pressure DOUBLE PRECISION NOT NULL
      );
    `);

    try {
      await client.query("SELECT create_hypertable('telemetry_history', 'timestamp', if_not_exists => TRUE);");
      console.log("TimescaleDB Hypertable initialized for telemetry_history.");
    } catch (e) {
      // Standard PostgreSQL fallback (ignore hypertable error)
    }

    console.log("Postgres: Seeding initial and missing catalog assets...");
    for (const sat of DEFAULT_SATELLITES) {
      await client.query(
        `INSERT INTO satellites 
        (id, name, owner, type, lat, lng, alt, velocity, threat_level, threat_details, tle1, tle2, category, orbit, thermal, power, communications, radiation, propulsion, anomalies) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        ON CONFLICT (id) DO UPDATE SET 
          name = EXCLUDED.name, owner = EXCLUDED.owner, type = EXCLUDED.type,
          tle1 = EXCLUDED.tle1, tle2 = EXCLUDED.tle2, category = EXCLUDED.category`,
        [
          sat.id, sat.name, sat.owner, sat.type, sat.lat, sat.lng, sat.alt, sat.velocity,
          sat.threatLevel, sat.threatDetails, sat.tle1, sat.tle2, sat.category,
          JSON.stringify(sat.orbit || null), JSON.stringify(sat.thermal || null),
          JSON.stringify(sat.power || null), JSON.stringify(sat.communications || null),
          JSON.stringify(sat.radiation || null), JSON.stringify(sat.propulsion || null),
          JSON.stringify(sat.anomalies || null)
        ]
      );
    }
  } catch (err) {
    console.error("Failed to initialize PostgreSQL schema:", err);
    throw err;
  } finally {
    client.release();
  }
}

export async function getSatellites() {
  if (usePostgres && pgPool) {
    try {
      const res = await pgPool.query("SELECT * FROM satellites");
      return res.rows.map(r => ({
        id: r.id,
        name: r.name,
        owner: r.owner,
        type: r.type,
        lat: r.lat,
        lng: r.lng,
        alt: r.alt,
        velocity: r.velocity,
        threatLevel: r.threat_level,
        threatDetails: r.threat_details,
        tle1: r.tle1,
        tle2: r.tle2,
        category: r.category,
        orbit: r.orbit,
        thermal: r.thermal,
        power: r.power,
        communications: r.communications,
        radiation: r.radiation,
        propulsion: r.propulsion,
        anomalies: r.anomalies
      }));
    } catch (err) {
      console.error("Postgres getSatellites failed:", err);
    }
  }

  if (useLocalDb) {
    const data = readLocalJson();
    return data.satellites || DEFAULT_SATELLITES;
  }

  try {
    const snapshot = await firestoreInstance.collection('satellites').get();
    if (snapshot.empty) {
      console.log("Firestore: Mapped empty collection. Seeding initial catalog...");
      for (const sat of DEFAULT_SATELLITES) {
        await firestoreInstance.collection('satellites').doc(sat.id).set(sat);
      }
      return DEFAULT_SATELLITES;
    }
    const sats = [];
    snapshot.forEach(doc => sats.push(doc.data()));
    return sats;
  } catch (err) {
    console.error("Firestore getSatellites failed. Reverting to local fallback data.", err);
    return DEFAULT_SATELLITES;
  }
}

export async function saveSatellite(sat) {
  if (usePostgres && pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO satellites 
        (id, name, owner, type, lat, lng, alt, velocity, threat_level, threat_details, tle1, tle2, category, orbit, thermal, power, communications, radiation, propulsion, anomalies) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        ON CONFLICT (id) DO UPDATE SET 
          name = EXCLUDED.name, owner = EXCLUDED.owner, type = EXCLUDED.type, 
          lat = EXCLUDED.lat, lng = EXCLUDED.lng, alt = EXCLUDED.alt, velocity = EXCLUDED.velocity, 
          threat_level = EXCLUDED.threat_level, threat_details = EXCLUDED.threat_details, 
          tle1 = EXCLUDED.tle1, tle2 = EXCLUDED.tle2, category = EXCLUDED.category, 
          orbit = EXCLUDED.orbit, thermal = EXCLUDED.thermal, power = EXCLUDED.power, 
          communications = EXCLUDED.communications, radiation = EXCLUDED.radiation, 
          propulsion = EXCLUDED.propulsion, anomalies = EXCLUDED.anomalies`,
        [
          sat.id, sat.name, sat.owner, sat.type, sat.lat, sat.lng, sat.alt, sat.velocity,
          sat.threatLevel, sat.threatDetails, sat.tle1, sat.tle2, sat.category,
          JSON.stringify(sat.orbit || null), JSON.stringify(sat.thermal || null),
          JSON.stringify(sat.power || null), JSON.stringify(sat.communications || null),
          JSON.stringify(sat.radiation || null), JSON.stringify(sat.propulsion || null),
          JSON.stringify(sat.anomalies || null)
        ]
      );
    } catch (err) {
      console.error(`Postgres saveSatellite failed for ${sat.id}:`, err);
    }
    return;
  }

  if (useLocalDb) {
    const data = readLocalJson();
    const idx = data.satellites.findIndex(s => s.id === sat.id);
    if (idx !== -1) {
      data.satellites[idx] = { ...data.satellites[idx], ...sat };
    } else {
      data.satellites.push(sat);
    }
    writeLocalJson(data);
    return;
  }

  try {
    await firestoreInstance.collection('satellites').doc(sat.id).set(sat, { merge: true });
  } catch (err) {
    console.error(`Firestore saveSatellite failed for ${sat.id}:`, err);
  }
}

export async function getLogs(limitVal = 40) {
  if (usePostgres && pgPool) {
    try {
      const res = await pgPool.query(`SELECT timestamp, text, type FROM telemetry_logs ORDER BY timestamp_ms DESC LIMIT $1`, [limitVal]);
      return res.rows.reverse();
    } catch (err) {
      console.error("Postgres getLogs failed:", err);
    }
  }

  if (useLocalDb) {
    const data = readLocalJson();
    return (data.telemetryLogs || []).slice(-limitVal);
  }

  try {
    const snapshot = await firestoreInstance.collection('telemetry_logs')
      .orderBy('timestamp_ms', 'desc')
      .limit(limitVal)
      .get();
    const logs = [];
    snapshot.forEach(doc => {
      const d = doc.data();
      logs.push({ timestamp: d.timestamp, text: d.text, type: d.type });
    });
    return logs.reverse();
  } catch (err) {
    console.error("Firestore getLogs failed, returning empty log list.", err);
    return [];
  }
}

export async function saveLog(log) {
  const timestamp_ms = Date.now();
  if (usePostgres && pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO telemetry_logs (timestamp, text, type, timestamp_ms) VALUES ($1, $2, $3, $4)`,
        [log.timestamp, log.text, log.type, timestamp_ms]
      );
    } catch (err) {
      console.error("Postgres saveLog failed:", err);
    }
    return;
  }

  if (useLocalDb) {
    const data = readLocalJson();
    data.telemetryLogs = data.telemetryLogs || [];
    data.telemetryLogs.push(log);
    if (data.telemetryLogs.length > 150) data.telemetryLogs.shift();
    writeLocalJson(data);
    return;
  }

  try {
    await firestoreInstance.collection('telemetry_logs').add({
      ...log,
      timestamp_ms
    });
  } catch (err) {
    console.error("Firestore saveLog failed:", err);
  }
}

export async function saveAgentAction(action) {
  const timestamp_ms = Date.now();
  const dateStr = new Date().toISOString();
  
  if (usePostgres && pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO agent_actions (timestamp, action_details, timestamp_ms) VALUES ($1, $2, $3)`,
        [dateStr, JSON.stringify(action), timestamp_ms]
      );
    } catch (err) {
      console.error("Postgres saveAgentAction failed:", err);
    }
    return;
  }

  if (useLocalDb) {
    const data = readLocalJson();
    data.agentActions = data.agentActions || [];
    data.agentActions.push({ ...action, timestamp: dateStr });
    writeLocalJson(data);
    return;
  }

  try {
    await firestoreInstance.collection('agent_actions').add({
      ...action,
      timestamp: dateStr,
      timestamp_ms
    });
  } catch (err) {
    console.error("Firestore saveAgentAction failed:", err);
  }
}

export async function saveTelemetryHistory(sat) {
  if (usePostgres && pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO telemetry_history 
        (satellite_id, altitude, velocity, battery_soc, battery_temp, thermal_stress, downlink_snr, propellant_mass, fuel_pressure) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          sat.id, 
          sat.orbit ? sat.orbit.alt : sat.alt,
          sat.orbit ? sat.orbit.velocity : sat.velocity,
          sat.power ? sat.power.batterySoC : 0.0,
          sat.thermal ? sat.thermal.battTemp : 0.0,
          sat.thermal ? sat.thermal.thermalStress : 0.0,
          sat.communications ? sat.communications.downlinkSNR : 0.0,
          sat.propulsion ? sat.propulsion.propellantMassKg : 0.0,
          sat.propulsion ? sat.propulsion.fuelPressurePsi : 0.0
        ]
      );
    } catch (err) {
      console.error(`Postgres saveTelemetryHistory failed for ${sat.id}:`, err.message);
    }
  }
}

export async function getTelemetryHistory(satId, limitVal = 50) {
  if (usePostgres && pgPool) {
    try {
      const res = await pgPool.query(
        `SELECT timestamp, battery_soc as "batterySoC", battery_temp as "batteryTemp", 
                altitude, downlink_snr as "downlinkSNR"
         FROM telemetry_history 
         WHERE satellite_id = $1 
         ORDER BY timestamp DESC 
         LIMIT $2`,
        [satId, limitVal]
      );
      return res.rows.reverse();
    } catch (err) {
      console.error(`Postgres getTelemetryHistory failed for ${satId}:`, err.message);
      return [];
    }
  }
  return [];
}

export async function getWebhooks() {
  if (usePostgres && pgPool) {
    try {
      const res = await pgPool.query('SELECT * FROM webhooks ORDER BY created_at DESC');
      return res.rows.map(r => ({
        id: r.id,
        name: r.name,
        url: r.url,
        events: typeof r.events === 'string' ? JSON.parse(r.events) : r.events,
        createdAt: r.created_at
      }));
    } catch (err) {
      console.error("Postgres getWebhooks failed:", err.message);
      return [];
    }
  }

  if (useLocalDb) {
    const data = readLocalJson();
    return data.webhooks || [];
  }

  if (firestoreInstance) {
    try {
      const snapshot = await firestoreInstance.collection('webhooks').orderBy('createdAt', 'desc').get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.error("Firestore getWebhooks failed:", err.message);
      return [];
    }
  }

  return [];
}

export async function saveWebhook(webhook) {
  const id = webhook.id || `wh-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  const wh = {
    id,
    name: webhook.name || 'Webhook Link',
    url: webhook.url,
    events: webhook.events || [],
    createdAt: webhook.createdAt || new Date().toISOString()
  };

  if (usePostgres && pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO webhooks (id, name, url, events) 
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET 
           name = EXCLUDED.name, url = EXCLUDED.url, events = EXCLUDED.events`,
        [wh.id, wh.name, wh.url, JSON.stringify(wh.events)]
      );
    } catch (err) {
      console.error("Postgres saveWebhook failed:", err.message);
      throw err;
    }
    return wh;
  }

  if (useLocalDb) {
    const data = readLocalJson();
    if (!data.webhooks) data.webhooks = [];
    const idx = data.webhooks.findIndex(w => w.id === wh.id);
    if (idx !== -1) {
      data.webhooks[idx] = wh;
    } else {
      data.webhooks.push(wh);
    }
    writeLocalJson(data);
    return wh;
  }

  if (firestoreInstance) {
    try {
      await firestoreInstance.collection('webhooks').doc(wh.id).set(wh, { merge: true });
    } catch (err) {
      console.error("Firestore saveWebhook failed:", err.message);
      throw err;
    }
    return wh;
  }

  return wh;
}

export async function deleteWebhook(id) {
  if (usePostgres && pgPool) {
    try {
      await pgPool.query('DELETE FROM webhooks WHERE id = $1', [id]);
    } catch (err) {
      console.error("Postgres deleteWebhook failed:", err.message);
      throw err;
    }
    return { success: true };
  }

  if (useLocalDb) {
    const data = readLocalJson();
    if (data.webhooks) {
      data.webhooks = data.webhooks.filter(w => w.id !== id);
      writeLocalJson(data);
    }
    return { success: true };
  }

  if (firestoreInstance) {
    try {
      await firestoreInstance.collection('webhooks').doc(id).delete();
    } catch (err) {
      console.error("Firestore deleteWebhook failed:", err.message);
      throw err;
    }
    return { success: true };
  }

  return { success: true };
}

