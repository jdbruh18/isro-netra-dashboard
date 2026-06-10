import { initializeDb, getSatellites, saveSatellite, saveTelemetryHistory, getTelemetryHistory, usePostgres, useLocalDb } from './db.js';

async function runTests() {
  console.log("=== Database Integration & Fallback Unit Tests ===");

  // Use the default docker-compose environment URL if not set
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:netrasecret@localhost:5432/netra_data';
  
  try {
    console.log("Initializing database connection...");
    await initializeDb();
    
    console.log(`Database engine state - Postgres: ${usePostgres}, Local JSON: ${useLocalDb}`);
    
    console.log("Testing getSatellites...");
    const sats = await getSatellites();
    if (sats && sats.length > 0) {
      console.log(`  [PASS] Successfully retrieved ${sats.length} satellites.`);
    } else {
      throw new Error("No satellites retrieved");
    }

    const testSat = {
      id: "gaganyaan",
      name: "Gaganyaan Crew Module",
      owner: "ISRO",
      type: "Crewed Spacecraft",
      alt: 405.23,
      velocity: 7.67,
      threatLevel: "NORMAL",
      orbit: { alt: 405.23, velocity: 7.67 },
      power: { batterySoC: 92.5 },
      thermal: { battTemp: 28.5, thermalStress: 0.0 },
      communications: { downlinkSNR: 24.5 },
      propulsion: { propellantMassKg: 400.0, fuelPressurePsi: 220.0 }
    };

    console.log("Testing saveSatellite...");
    await saveSatellite(testSat);
    console.log("  [PASS] saveSatellite completed successfully.");

    console.log("Testing saveTelemetryHistory...");
    await saveTelemetryHistory(testSat);
    console.log("  [PASS] saveTelemetryHistory completed successfully.");

    console.log("Testing getTelemetryHistory...");
    const history = await getTelemetryHistory("gaganyaan", 5);
    console.log(`  [PASS] getTelemetryHistory retrieved ${history.length} records.`);
    
    console.log("\n[ALL PASS] Database verification unit tests succeeded.");
    process.exit(0);
  } catch (err) {
    console.error("\n[FAIL] Database verification failed:", err);
    process.exit(1);
  }
}

runTests();
