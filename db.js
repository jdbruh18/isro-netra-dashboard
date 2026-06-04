import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCAL_DB_PATH = path.join(__dirname, 'db-local.json');

let firestoreInstance = null;
let useLocalDb = false;

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
    category: "indian"
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
    category: "debris"
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
    category: "indian"
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
    category: "indian"
  }
];

export async function initializeDb() {
  // Check if GCP Project ID environment variable or credentials exist
  const hasGcpConfig = process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (hasGcpConfig) {
    try {
      // Dynamically import Firestore SDK so local developers don't need it installed to run locally
      const { Firestore } = await import('@google-cloud/firestore');
      firestoreInstance = new Firestore();
      console.log("Firestore Database: Connection initialized successfully.");
      return;
    } catch (err) {
      console.warn("Failed to load @google-cloud/firestore. Falling back to local filesystem DB.", err);
      useLocalDb = true;
    }
  }

  // Fallback to local file database
  useLocalDb = true;
  console.log(`Local Database: Active. Path: ${LOCAL_DB_PATH}`);
  
  // Seed local DB file if it doesn't exist
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

// Local helper to read JSON file
function readLocalJson() {
  try {
    const raw = fs.readFileSync(LOCAL_DB_PATH, 'utf-8');
    const data = JSON.parse(raw || '{}');
    if (!data.satellites) data.satellites = [...DEFAULT_SATELLITES];
    if (!data.telemetryLogs) data.telemetryLogs = [];
    if (!data.agentActions) data.agentActions = [];
    return data;
  } catch (e) {
    console.error("Failed to read local JSON database, returning empty schema.", e);
    return { satellites: [...DEFAULT_SATELLITES], telemetryLogs: [], agentActions: [] };
  }
}

// Local helper to write JSON file
function writeLocalJson(data) {
  try {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error("Failed to write to local JSON database.", e);
  }
}

/**
 * DB query: Fetch tracked space assets
 */
export async function getSatellites() {
  if (useLocalDb) {
    const data = readLocalJson();
    return data.satellites || DEFAULT_SATELLITES;
  }

  try {
    const snapshot = await firestoreInstance.collection('satellites').get();
    if (snapshot.empty) {
      // Seed firestore database on first run
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

/**
 * DB write: Update satellite properties (TLE modifications, threat levels)
 */
export async function saveSatellite(sat) {
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

/**
 * DB query: Fetch recent telemetry logs
 */
export async function getLogs(limitVal = 40) {
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
    return logs.reverse(); // return chronological order
  } catch (err) {
    console.error("Firestore getLogs failed, returning empty log list.", err);
    return [];
  }
}

/**
 * DB write: Persist a telemetry event
 */
export async function saveLog(log) {
  const timestamp_ms = Date.now();
  if (useLocalDb) {
    const data = readLocalJson();
    data.telemetryLogs = data.telemetryLogs || [];
    data.telemetryLogs.push(log);
    // Keep last 150 log entries to prevent file bloating
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

/**
 * DB write: Record Gemini AI actions into audits database
 */
export async function saveAgentAction(action) {
  const timestamp_ms = Date.now();
  const dateStr = new Date().toISOString();
  
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
