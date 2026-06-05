import urllib.request
import json
import math

def get_telemetry():
    url = "http://localhost:8080/api/telemetry"
    try:
        with urllib.request.urlopen(url) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Failed to fetch telemetry: {e}")
        return None

def verify():
    telemetry = get_telemetry()
    if not telemetry:
        return

    satellites = telemetry.get("satellites", [])
    print(f"Loaded {len(satellites)} satellites/debris from telemetry:")
    
    active_sats = [s for s in satellites if s.get("category") != "debris"]
    debris_sats = [s for s in satellites if s.get("category") == "debris"]
    
    for s in satellites:
        print(f" - {s.get('name')} (ID: {s.get('id')}) | Category: {s.get('category')} | Alt: {s.get('alt')} km | Lat: {s.get('lat')} | Lng: {s.get('lng')}")

    print("\nPairwise Proximity Analysis (Physical Distance using lat/lng/alt):")
    rad = math.pi / 180.0
    earth_radius = 6378.137

    for active in active_sats:
        for debris in debris_sats:
            lat1 = active.get("lat", 0) * rad
            lng1 = active.get("lng", 0) * rad
            r1 = earth_radius + active.get("alt", 0)
            x1 = r1 * math.cos(lat1) * math.cos(lng1)
            y1 = r1 * math.cos(lat1) * math.sin(lng1)
            z1 = r1 * math.sin(lat1)

            lat2 = debris.get("lat", 0) * rad
            lng2 = debris.get("lng", 0) * rad
            r2 = earth_radius + debris.get("alt", 0)
            x2 = r2 * math.cos(lat2) * math.cos(lng2)
            y2 = r2 * math.cos(lat2) * math.sin(lng2)
            z2 = r2 * math.sin(lat2)

            dx = x1 - x2
            dy = y1 - y2
            dz = z1 - z2
            dist = math.sqrt(dx*dx + dy*dy + dz*dz)
            prob = 100 * math.exp(-dist / 120.0)
            
            print(f"  {active.get('name')} vs {debris.get('name')}: Dist = {dist:.2f} km | Probability = {prob:.2f}%")
            if dist < 350:
                level = "DANGER" if dist < 150 else "WARNING"
                print(f"    --> [CONJUNCTION DETECTED] level: {level}")

if __name__ == "__main__":
    verify()
