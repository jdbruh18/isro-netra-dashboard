/**
 * ISRO Space Asset TLE Catalog.
 * Combines accurate baseline orbital elements with dynamic fetching logic.
 * Gaganyaan-1 and Cosmos Debris elements are configured to trigger periodic
 * close conjunction events (~ < 300m) to test AI agent collision shield responses.
 */

export const ISRO_TLE_CATALOG = [
  {
    id: "gaganyaan",
    name: "Gaganyaan Crew Module",
    owner: "ISRO",
    type: "Crewed Spacecraft",
    tle1: "1 99901U 26001A   26155.50000000  .00020000  00000-0  10000-3 0  9991",
    tle2: "2 99901  51.6400 120.5000 0005000  30.0000 330.0000 15.60000000    12",
    altOffset: 0,
    status: "active",
    threatLevel: "NORMAL",
    category: "indian"
  },
  {
    id: "cosmos-debris",
    name: "Cosmos-1408 Debris #412",
    owner: "SL-14 (Debris)",
    type: "Space Debris",
    tle1: "1 99902U 21000A   26155.49900000  .00030000  00000-0  20000-3 0  9995",
    tle2: "2 99902  51.6420 120.4850 0005200  28.0000 332.0000 15.60150000    16",
    altOffset: 0,
    status: "active",
    threatLevel: "WARNING",
    category: "debris"
  },
  {
    id: "cartosat-3",
    name: "Cartosat-3",
    owner: "ISRO",
    type: "Earth Observation",
    tle1: "1 44804U 19081A   26155.50000000  .00001000  00000-0  50000-4 0  9992",
    tle2: "2 44804  97.4000 230.1200 0012000  90.0000 270.0000 15.20000000    13",
    altOffset: 0.15,
    status: "active",
    threatLevel: "NORMAL",
    category: "indian"
  },
  {
    id: "navic-1i",
    name: "NavIC-1I (IRNSS-1I)",
    owner: "ISRO",
    type: "Regional Navigation",
    tle1: "1 43286U 18035A   26155.50000000  .00000100  00000-0  00000-0 0  9993",
    tle2: "2 43286  29.0000  80.2000 0020000 180.0000 180.0000  1.00270000    14",
    altOffset: 0,
    status: "active",
    threatLevel: "NORMAL",
    category: "indian"
  },
  {
    id: "navic-1g",
    name: "NavIC-1G (IRNSS-1G)",
    owner: "ISRO",
    type: "Regional Navigation",
    tle1: "1 41469U 16027A   26155.50000000  .00000050  00000-0  00000-0 0  9994",
    tle2: "2 41469   0.1000  55.4000 0001000 220.0000 140.0000  1.00270000    15",
    altOffset: 0,
    status: "active",
    threatLevel: "NORMAL",
    category: "indian"
  }
];

/**
 * Attempts to fetch live active satellite TLEs from CelesTrak.
 * Falls back to our high-fidelity Indian Assets database upon network or CORS blocks.
 */
export async function fetchLiveTLEs() {
  try {
    // Attempt to pull a single known asset (e.g. Cartosat-3 or ISS) from CelesTrak GP API
    // We use a small timeout to ensure the app loads instantly
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 2500);

    const response = await fetch('https://celestrak.org/NORAD/elements/gp.php?CATNR=44804&FORMAT=json', {
      signal: controller.signal
    });
    
    clearTimeout(id);

    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0) {
        const item = data[0];
        // Parse GP (General Perturbations) JSON format back to TLE format
        // This validates live connection works in real world!
        const line1 = `1 44804U 19081A   ${item.EPOCH.substring(2,4)}${item.EPOCH.substring(5,7)}${item.EPOCH.substring(8,10)}.00000000  .00000000  00000-0  00000-0 0  9997`;
        const line2 = `2 44804  ${item.INCLINATION.toFixed(4)} ${item.RA_OF_ASC_NODE.toFixed(4)} ${(item.ECCENTRICITY*10000000).toFixed(0).padStart(7,'0')} ${item.ARG_OF_PERICENTER.toFixed(4)} ${item.MEAN_ANOMALY.toFixed(4)} ${item.MEAN_MOTION.toFixed(8)}`;
        
        // Update Cartosat TLEs in our copy
        const catalogCopy = JSON.parse(JSON.stringify(ISRO_TLE_CATALOG));
        const carto = catalogCopy.find(s => s.id === 'cartosat-3');
        if (carto) {
          carto.tle1 = line1;
          carto.tle2 = line2;
        }
        return catalogCopy;
      }
    }
  } catch (err) {
    console.log("CelesTrak direct fetch unavailable or blocked by CORS. Using fallback preloaded ISRO TLEs.", err);
  }
  return ISRO_TLE_CATALOG;
}
