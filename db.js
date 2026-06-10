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
  }
];

function readLocalJson() {
  try {
    const raw = fs.readFileSync(LOCAL_DB_PATH, 'utf-8');
    const data = JSON.parse(raw || '{}');
    if (!data.satellites) data.satellites = [...DEFAULT_SATELLITES];
    if (!data.telemetryLogs) data.telemetryLogs = [];
    if (!data.agentActions) data.agentActions = [];
    return data;
  } catch (e) {
    return { satellites: [...DEFAULT_SATELLITES], telemetryLogs: [], agentActions: [] };
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
      agentActions: []
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

    const countRes = await client.query("SELECT COUNT(*) FROM satellites");
    const count = parseInt(countRes.rows[0].count);
    if (count === 0) {
      console.log("Postgres: Satellites table empty. Seeding initial catalog...");
      for (const sat of DEFAULT_SATELLITES) {
        await client.query(
          `INSERT INTO satellites 
          (id, name, owner, type, lat, lng, alt, velocity, threat_level, threat_details, tle1, tle2, category, orbit, thermal, power, communications, radiation, propulsion, anomalies) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
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
