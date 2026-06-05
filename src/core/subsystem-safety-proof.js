/**
 * Subsystem safety verification module.
 * Pre-compiled fallback representing the compiled output of SubsystemSafety.idr.
 */

/**
 * Validates battery power state, enforcing power grid safety margins.
 * 
 * @param {string} satId
 * @param {number} soc State of charge in %
 * @returns {{ success: boolean, error?: string }}
 */
export function validatePowerState(satId, soc) {
  if (soc < 15.0) {
    return {
      success: false,
      error: `Battery state-of-charge ${soc.toFixed(1)}% is critically low (minimum 15.0% required for operations).`
    };
  }
  return { success: true };
}

/**
 * Validates thruster propellant reserves and line pressure parameters.
 * 
 * @param {string} satId
 * @param {number} deltaV Burn magnitude in m/s
 * @param {number} propellantMass Remaining fuel in kg
 * @param {number} fuelPressure Line pressure in psi
 * @returns {{ success: boolean, error?: string }}
 */
export function validateThrusterFuel(satId, deltaV, propellantMass, fuelPressure) {
  if (fuelPressure < 100.0 || fuelPressure > 600.0) {
    return {
      success: false,
      error: `Fuel line pressure ${fuelPressure.toFixed(1)} psi is outside safe operational limits (100.0 to 600.0 psi).`
    };
  }

  const reqFuel = deltaV * 12.0; // 12 kg propellant consumed per 1 m/s delta-v
  if (reqFuel > propellantMass) {
    return {
      success: false,
      error: `Insufficient propellant: maneuver requires ${reqFuel.toFixed(1)} kg but only ${propellantMass.toFixed(1)} kg is available.`
    };
  }

  return { success: true };
}

/**
 * Validates ADCS (Attitude Determination & Control System) attitude slew rates.
 * 
 * @param {string} satId
 * @param {number} driftRate Attitude slew/drift rate in deg/s
 * @returns {{ success: boolean, error?: string }}
 */
export function validateADCSState(satId, driftRate) {
  if (driftRate < 0.05 || driftRate > 2.0) {
    return {
      success: false,
      error: `ADCS slew/drift rate ${driftRate.toFixed(3)} deg/s exceeds safety threshold (maximum 2.0 deg/s, minimum 0.05 deg/s).`
    };
  }
  return { success: true };
}
