import urllib.request
import json
import sys

def test_feed(url, name):
    print(f"Testing SWPC Feed for {name} ({url})...")
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
            print(f"  [SUCCESS] Received {len(data)} items.")
            return data
    except Exception as e:
        print(f"  [FAIL] Failed to fetch feed: {e}")
        return None

def verify():
    # 1. Kp Index
    kp_data = test_feed("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json", "Kp-index")
    kp_val = 3.0
    if kp_data and len(kp_data) > 0:
        latest = kp_data[-1]
        kp_val = float(latest.get("Kp", 3.0))
        print(f"  Latest Kp index: {kp_val}")

    # 2. Solar Wind Plasma (speed)
    plasma_data = test_feed("https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json", "Solar Wind Plasma")
    wind_val = 400.0
    if plasma_data and len(plasma_data) > 0:
        # Scan backward for valid speed
        for i in range(len(plasma_data) - 1, 0, -1):
            row = plasma_data[i]
            if row and len(row) > 2 and row[2]:
                try:
                    wind_val = float(row[2])
                    print(f"  Latest Solar Wind Speed: {wind_val} km/s (Time: {row[0]})")
                    break
                except ValueError:
                    continue

    # 3. Solar Wind Magnetic Field
    mag_data = test_feed("https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json", "DSCOVR Magnetometer")
    mag_x, mag_y, mag_z = 0.0, 0.0, 0.0
    if mag_data and len(mag_data) > 0:
        for i in range(len(mag_data) - 1, 0, -1):
            row = mag_data[i]
            if row and len(row) > 3 and row[1] and row[2] and row[3]:
                try:
                    mag_x = float(row[1])
                    mag_y = float(row[2])
                    mag_z = float(row[3])
                    print(f"  Latest Magnetometer GSM: Bx={mag_x} nT | By={mag_y} nT | Bz={mag_z} nT")
                    break
                except ValueError:
                    continue

    # 4. GOES Proton Flux
    proton_data = test_feed("https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json", "GOES Proton Flux")
    proton_val = 10.0
    if proton_data and len(proton_data) > 0:
        ten_mev = [p for p in proton_data if p.get("energy") == ">=10 MeV"]
        if ten_mev:
            proton_val = float(ten_mev[-1].get("flux", 10.0))
            print(f"  Latest Integral Proton Flux >=10 MeV: {proton_val} pfu")

if __name__ == "__main__":
    verify()
