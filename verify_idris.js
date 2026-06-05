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

console.log("\n[ALL PASS] Idris 2 dependent verification engine unit tests succeeded.");
