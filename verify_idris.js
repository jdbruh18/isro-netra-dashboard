import { validateBurn } from './src/core/avoidance-proof.js';

console.log("=== Idris 2 Dependent Verification Engine Unit Tests ===");

// Test 1: Valid LEO Evasive Burn
const res1 = validateBurn("gaganyaan", 1.45, "PROGRADE", 405.23, 405.41, 2.0);
console.log("Test 1 (Valid LEO Evasive Burn):");
if (res1 && res1.success) {
    console.log(`  [PASS] Successfully validated burn. Shift = ${res1.data.expectedAltitudeShift.toFixed(2)} km, New Alt = ${res1.data.newAltitude.toFixed(2)} km`);
} else {
    console.error("  [FAIL] Rejected valid burn:", res1);
    process.exit(1);
}

// Test 2: Out of bounds Delta-V (Too small)
const res2 = validateBurn("gaganyaan", 0.05, "PROGRADE", 405.23, 405.41, 2.0);
console.log("Test 2 (Out of bounds Delta-V - Too small):");
if (res2 && !res2.success && res2.error.includes("out of physical limits")) {
    console.log("  [PASS] Successfully blocked out-of-bounds burn. Error:", res2.error);
} else {
    console.error("  [FAIL] Failed to block out-of-bounds burn:", res2);
    process.exit(1);
}

// Test 3: Out of bounds Delta-V (Too large)
const res3 = validateBurn("gaganyaan", 25.0, "PROGRADE", 405.23, 405.41, 2.0);
console.log("Test 3 (Out of bounds Delta-V - Too large):");
if (res3 && !res3.success && res3.error.includes("out of physical limits")) {
    console.log("  [PASS] Successfully blocked out-of-bounds burn. Error:", res3.error);
} else {
    console.error("  [FAIL] Failed to block out-of-bounds burn:", res3);
    process.exit(1);
}

// Test 4: Insufficient Clearance
const res4 = validateBurn("gaganyaan", 0.5, "PROGRADE", 405.23, 405.41, 2.0);
console.log("Test 4 (Insufficient Clearance):");
if (res4 && !res4.success && res4.error.includes("does not clear threat zone")) {
    console.log("  [PASS] Successfully blocked insufficient clearance burn. Error:", res4.error);
} else {
    console.error("  [FAIL] Failed to block insufficient clearance burn:", res4);
    process.exit(1);
}

// Test 5: High Thermal Stress Block
const res5 = validateBurn("gaganyaan", 1.45, "PROGRADE", 405.23, 405.41, 2.0, 9.5, 0.0);
console.log("Test 5 (High Thermal Stress Block):");
if (res5 && !res5.success && res5.error.includes("Thermal stress is")) {
    console.log("  [PASS] Successfully blocked high thermal stress burn. Error:", res5.error);
} else {
    console.error("  [FAIL] Failed to block high thermal stress burn:", res5);
    process.exit(1);
}

// Test 6: High Radiation SEU Risk Block
const res6 = validateBurn("gaganyaan", 1.45, "PROGRADE", 405.23, 405.41, 2.0, 0.0, 0.025);
console.log("Test 6 (High Radiation SEU Risk Block):");
if (res6 && !res6.success && res6.error.includes("SEU probability is")) {
    console.log("  [PASS] Successfully blocked high radiation storm burn. Error:", res6.error);
} else {
    console.error("  [FAIL] Failed to block high radiation storm burn:", res6);
    process.exit(1);
}

// Test 7: Retrograde Atmospheric Reentry Risk Block
// 12.0 m/s retrograde burn at 160.0 km altitude shifts orbit by 12 * 1.8 = 21.6 km, dropping it to 138.4 km (< 150 km)
const res7 = validateBurn("gaganyaan", 12.0, "RETROGRADE", 160.0, 100.0, 1.0, 0.0, 0.0);
console.log("Test 7 (Retrograde Atmospheric Reentry Risk Block):");
if (res7 && !res7.success && res7.error.includes("drops below atmospheric reentry limit")) {
    console.log("  [PASS] Successfully blocked atmospheric reentry risk burn. Error:", res7.error);
} else {
    console.error("  [FAIL] Failed to block atmospheric reentry risk burn:", res7);
    process.exit(1);
}

console.log("\n[ALL PASS] Idris 2 dependent verification engine unit tests succeeded.");
