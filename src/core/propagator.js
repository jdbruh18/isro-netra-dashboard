/**
 * Orbital Propagator utilizing satellite.js for SGP4 equations.
 * Operates with a robust Keplerian fallback when satellite.js is loading or offline.
 */

export function propagateSatellite(tleLine1, tleLine2, date, altOffset = 0, keplerFallbackIdx = 0) {
  // Check if satellite.js CDN is loaded
  const lib = window.satellite;

  if (lib && tleLine1 && tleLine2) {
    try {
      // 1. Convert TLE text to Satellite Record
      const satrec = lib.twoline2satrec(tleLine1, tleLine2);
      
      // 2. Compute satellite positions ECI
      const positionAndVelocity = lib.propagate(satrec, date);
      const positionEci = positionAndVelocity.position;
      const velocityEci = positionAndVelocity.velocity;

      if (positionEci && velocityEci) {
        // 3. Compute Greenwich Mean Sidereal Time
        const gmst = lib.gstimest(date);
        
        // 4. Convert ECI coordinates to Geodetic
        const positionGeodetic = lib.eciToGeodetic(positionEci, gmst);
        
        const lat = lib.degreesLat(positionGeodetic.latitude);
        const lng = lib.degreesLong(positionGeodetic.longitude);
        const alt = positionGeodetic.height + altOffset; // Altitude in km
        
        // Calculate velocity magnitude (km/s)
        const vel = Math.sqrt(
          velocityEci.x * velocityEci.x + 
          velocityEci.y * velocityEci.y + 
          velocityEci.z * velocityEci.z
        );

        // Convert ECI positions to 3D Cartesian coordinates for ThreeJS (normalized to Earth radius = 5 units)
        // Earth radius is ~6378.1 km. Satellite radius is Earth radius + alt.
        const earthRadius = 6378.137;
        const orbitRadius = earthRadius + alt;
        const scale = 5 / earthRadius;

        // SGP4 ECI coordinates: x, y, z are in km. Map them to 3D Space (ThreeJS coordinate frame)
        // Note: standard rotation maps Z as polar, X/Y as equatorial.
        const x3d = positionEci.x * scale;
        const y3d = positionEci.y * scale;
        const z3d = positionEci.z * scale;

        return {
          lat,
          lng,
          alt,
          velocity: vel, // km/s
          position3d: { x: x3d, y: y3d, z: z3d },
          valid: true
        };
      }
    } catch (e) {
      console.warn("SGP4 Propagation failed, reverting to Keplerian model.", e);
    }
  }

  // Keplerian Fallback: Standard orbital mechanics equations (Keplerian orbits)
  // Maps standard orbits based on index to distribute spacing
  const now = date.getTime() / 1000;
  
  // Semi-major axis scale (ISS ~400km, NavIC ~36000km)
  const isHighOrbit = keplerFallbackIdx >= 3; // IRNSS NavIC satellites are indices 3 and 4
  const alt = isHighOrbit ? 35786 : 400 + (keplerFallbackIdx * 55); 
  const velocity = isHighOrbit ? 3.08 : 7.67 - (keplerFallbackIdx * 0.05);

  // Inclination and spacing
  const inclination = (45 + (keplerFallbackIdx * 12)) * (Math.PI / 180);
  const period = isHighOrbit ? 86400 : 5400 + (keplerFallbackIdx * 300); // Orbit period in seconds
  const meanAnomaly = (now % period) / period * Math.PI * 2;

  // Keplerian coordinate propagation (3D orbit ellipse)
  const earthRadius = 6378.1;
  const radiusRatio = 5 * (1 + alt / earthRadius); // scaled 3D radius

  // Calculate coordinates in the orbital plane
  const xOrbital = radiusRatio * Math.cos(meanAnomaly);
  const yOrbital = radiusRatio * Math.sin(meanAnomaly);

  // Rotate orbital plane by inclination
  const x3d = xOrbital;
  const y3d = yOrbital * Math.cos(inclination);
  const z3d = yOrbital * Math.sin(inclination);

  // Convert Cartesian back to geodetic Lat/Lng
  const lat = Math.asin(z3d / radiusRatio) * (180 / Math.PI);
  let lng = Math.atan2(y3d, x3d) * (180 / Math.PI);
  lng = (lng + (now / 240) * 360) % 360; // account for Earth rotation
  
  // Mathematical wrapping to [-180, 180] range
  lng = (lng + 180) % 360;
  if (lng < 0) lng += 360;
  lng -= 180;

  return {
    lat,
    lng,
    alt,
    velocity,
    position3d: { x: x3d, y: y3d, z: z3d },
    valid: false
  };
}
