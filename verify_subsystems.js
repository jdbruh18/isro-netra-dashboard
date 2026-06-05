import { validatePowerState, validateThrusterFuel, validateADCSState } from './src/core/subsystem-safety-proof.js';

console.log("=== Idris 2 Subsystem Safety Verification Unit Tests ===");

// 1. Power State Checks
console.log("Testing Power State Validations:");
const p1 = validatePowerState("gaganyaan", 85.0);
if (p1.success) {
  console.log("  [PASS] Allowed normal SoC (85.0%).");
} else {
  console.error("  [FAIL] Blocked normal SoC:", p1);
  process.exit(1);
}

const p2 = validatePowerState("gaganyaan", 10.0);
if (!p2.success && p2.error.includes("critically low")) {
  console.log("  [PASS] Successfully blocked critically low SoC (10.0%).");
} else {
  console.error("  [FAIL] Failed to block low SoC:", p2);
  process.exit(1);
}

// 2. Thruster Fuel and Pressure Checks
console.log("\nTesting Thruster Fuel & Pressure Validations:");
const f1 = validateThrusterFuel("gaganyaan", 1.45, 400.0, 220.0);
if (f1.success) {
  console.log("  [PASS] Allowed normal burn vectors with sufficient propellant and pressure.");
} else {
  console.error("  [FAIL] Blocked valid burn vector:", f1);
  process.exit(1);
}

const f2 = validateThrusterFuel("gaganyaan", 1.45, 400.0, 80.0);
if (!f2.success && f2.error.includes("outside safe operational limits")) {
  console.log("  [PASS] Successfully blocked low pressure line bounds (80.0 psi).");
} else {
  console.error("  [FAIL] Failed to block low pressure:", f2);
  process.exit(1);
}

const f3 = validateThrusterFuel("gaganyaan", 1.45, 400.0, 650.0);
if (!f3.success && f3.error.includes("outside safe operational limits")) {
  console.log("  [PASS] Successfully blocked high pressure line bounds (650.0 psi).");
} else {
  console.error("  [FAIL] Failed to block high pressure:", f3);
  process.exit(1);
}

const f4 = validateThrusterFuel("gaganyaan", 5.0, 30.0, 220.0); // requires 60.0kg fuel
if (!f4.success && f4.error.includes("Insufficient propellant")) {
  console.log("  [PASS] Successfully blocked burn requiring more propellant than available.");
} else {
  console.error("  [FAIL] Failed to block fuel depletion:", f4);
  process.exit(1);
}

// 3. ADCS Drift Slew Rate Checks
console.log("\nTesting ADCS Slew & Drift Rate Validations:");
const a1 = validateADCSState("gaganyaan", 0.5);
if (a1.success) {
  console.log("  [PASS] Allowed safe ADCS slew rate (0.5 deg/s).");
} else {
  console.error("  [FAIL] Blocked safe ADCS rate:", a1);
  process.exit(1);
}

const a2 = validateADCSState("gaganyaan", 0.02);
if (!a2.success && a2.error.includes("exceeds safety threshold")) {
  console.log("  [PASS] Successfully blocked too low ADCS rate (0.02 deg/s).");
} else {
  console.error("  [FAIL] Failed to block under-slew rate:", a2);
  process.exit(1);
}

const a3 = validateADCSState("gaganyaan", 2.5);
if (!a3.success && a3.error.includes("exceeds safety threshold")) {
  console.log("  [PASS] Successfully blocked too high ADCS rate (2.5 deg/s).");
} else {
  console.error("  [FAIL] Failed to block over-slew rate:", a3);
  process.exit(1);
}

console.log("\n[ALL PASS] Subsystem safety verification unit tests succeeded.");
