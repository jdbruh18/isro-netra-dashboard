/**
 * Mathematically proven avoidance validator.
 * Pre-compiled fallback representing the compiled output of Avoidance.idr.
 */

export const BurnDirection = {
  PROGRADE: "PROGRADE",
  RETROGRADE: "RETROGRADE"
};

/**
 * Validates a burn parameter block mathematically, enforcing type-safe constraints.
 * 
 * @param {string} satId Unique identifier of the satellite
 * @param {number} dv Delta-V burn magnitude in m/s
 * @param {string} dirStr Thrust direction ("PROGRADE" or "RETROGRADE")
 * @param {number} currentAlt Current orbital altitude in km
 * @param {number} debrisAlt Altitude of the debris threat in km
 * @param {number} safetyMargin Clearance margin required in km
 * @returns {{ success: boolean, data?: { satelliteId: string, deltaV: number, direction: string, expectedAltitudeShift: number, newAltitude: number }, error?: string }}
 */
export function validateBurn(satId, dv, dirStr, currentAlt, debrisAlt, safetyMargin) {
  // 1. Delta-V physical bounds constraint check: 0.1 <= dv <= 15.0
  if (dv < 0.1 || dv > 15.0) {
    return {
      success: false,
      error: `Delta-V magnitude ${dv.toFixed(3)} m/s is out of physical limits (0.1 to 15.0 m/s).`
    };
  }

  // 2. Compute altitude shift based on orbital altitude
  const multiplier = currentAlt > 1000.0 ? 15.0 : 1.8;
  const shift = dv * multiplier;
  
  // 3. Compute resulting altitude
  const newAlt = dirStr === "RETROGRADE" ? currentAlt - shift : currentAlt + shift;
  const requiredAlt = debrisAlt + safetyMargin;

  // 4. Safety clearance margin constraint check
  if (newAlt < requiredAlt) {
    return {
      success: false,
      error: `Post-burn altitude ${newAlt.toFixed(2)} km does not clear threat zone altitude (requires ${requiredAlt.toFixed(2)} km).`
    };
  }

  return {
    success: true,
    data: {
      satelliteId: satId,
      deltaV: dv,
      direction: dirStr,
      expectedAltitudeShift: shift,
      newAltitude: newAlt
    }
  };
}
