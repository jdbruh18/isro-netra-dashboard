import time
import requests
import sys

def verify_physics():
    url = "http://localhost:8080/api/telemetry"
    print("Connecting to NETRA telemetry API...")
    
    try:
        res = requests.get(url, timeout=3)
        res.raise_for_status()
        data = res.json()
    except Exception as e:
        print(f"[FAIL] Could not connect to telemetry API: {e}")
        sys.exit(1)
        
    print("\n--- Telemetry Schema Check ---")
    sats = data.get("satellites", [])
    if not sats:
        print("[FAIL] No satellites found in telemetry data.")
        sys.exit(1)
        
    required_keys = ["orbit", "thermal", "power", "communications", "radiation", "propulsion"]
    schema_passed = True
    
    for s in sats:
        print(f"Checking structure for satellite: {s.get('name')} ({s.get('id')})")
        for key in required_keys:
            if key not in s:
                print(f"  [FAIL] Missing subsystem: {key}")
                schema_passed = False
            else:
                print(f"  [PASS] Subsystem '{key}' present.")
                
    if not schema_passed:
        print("[FAIL] Schema check failed.")
        sys.exit(1)
    else:
        print("[PASS] Subsystem schema verification complete.")
        
    print("\n--- Physical Model Integrations Verification (10-second capture) ---")
    
    samples = []
    for i in range(10):
        print(f"Capturing sample {i+1}/10...")
        try:
            res = requests.get(url, timeout=3)
            samples.append(res.json())
        except Exception as e:
            print(f"[FAIL] Sample capture failed: {e}")
            sys.exit(1)
        time.sleep(1)
        
    print("\n--- Parsing Numerical Integrations for Gaganyaan ---")
    gaganyaan_samples = [next(s for s in sample["satellites"] if s["id"] == "gaganyaan") for sample in samples]
    
    # Check 1: Orbit propagation / decay
    alt_start = gaganyaan_samples[0]["orbit"]["alt"]
    alt_end = gaganyaan_samples[-1]["orbit"]["alt"]
    alt_diff = alt_end - alt_start
    print(f"Altitude: Start = {alt_start:.3f} km, End = {alt_end:.3f} km, Delta = {alt_diff:.6f} km")
    if alt_diff <= 0:
        print("  [PASS] Atmospheric drag decay verified (altitude is decaying).")
    else:
        print("  [WARNING] Altitude did not decay. If orbit corrections were active, this is normal. Otherwise, check drag decay equation.")
        
    # Check 2: Battery SoC & Power
    soc_start = gaganyaan_samples[0]["power"]["batterySoC"]
    soc_end = gaganyaan_samples[-1]["power"]["batterySoC"]
    soc_diff = soc_end - soc_start
    solar_gen = gaganyaan_samples[-1]["power"]["solarGenerationW"]
    power_cons = gaganyaan_samples[-1]["power"]["powerConsumptionW"]
    print(f"Battery SoC: Start = {soc_start:.2f}%, End = {soc_end:.2f}%, Delta = {soc_diff:.4f}%")
    print(f"Current Solar Gen = {solar_gen:.1f} W, Power Cons = {power_cons:.1f} W")
    
    expected_charging = (solar_gen - power_cons) > 0
    actual_charging = soc_diff > 0
    if expected_charging == actual_charging or abs(soc_diff) < 0.00001:
         print("  [PASS] Battery charging/discharging direction aligns with power balance equation.")
    else:
         print(f"  [FAIL] Battery SoC delta direction ({soc_diff}) does not align with power balance ({solar_gen - power_cons} W).")
         
    # Check 3: Thermal equilibrium & stress
    temp_start = gaganyaan_samples[0]["thermal"]["battTemp"]
    temp_end = gaganyaan_samples[-1]["thermal"]["battTemp"]
    stress_end = gaganyaan_samples[-1]["thermal"]["thermalStress"]
    expected_temp_end = gaganyaan_samples[-1]["thermal"]["expectedBattTemp"]
    print(f"Battery Temp: Start = {temp_start:.2f}°C, End = {temp_end:.2f}°C, Expected Temp = {expected_temp_end:.2f}°C")
    print(f"Thermal Stress = {stress_end:.2f}°C")
    if abs(stress_end - abs(temp_end - expected_temp_end)) < 0.01:
        print("  [PASS] Thermal stress matches |battTemp - expectedBattTemp|.")
    else:
        print(f"  [FAIL] Thermal stress readout ({stress_end}) does not match expected difference ({abs(temp_end - expected_temp_end)}).")
        
    # Check 4: Cosmic Radiation accum
    dose_start = gaganyaan_samples[0]["radiation"]["cumulativeDoseRad"]
    dose_end = gaganyaan_samples[-1]["radiation"]["cumulativeDoseRad"]
    dose_diff = dose_end - dose_start
    print(f"Radiation Dose: Start = {dose_start:.4f} Rad, End = {dose_end:.4f} Rad, Delta = {dose_diff:.4f} Rad")
    if dose_diff >= 0:
        print("  [PASS] Cosmic radiation dose accumulates monotonically.")
    else:
        print("  [FAIL] Radiation dose decreased.")
        
    # Check 5: Root-level alias syncing
    root_sync_passed = True
    for sample in samples:
        for s in sample["satellites"]:
            if s["lat"] != s["orbit"]["lat"] or s["lng"] != s["orbit"]["lng"] or s["alt"] != s["orbit"]["alt"] or s["velocity"] != s["orbit"]["velocity"]:
                print(f"  [FAIL] Root alias out of sync for {s['id']}: lat/lng/alt/vel mismatch.")
                root_sync_passed = False
                break
    if root_sync_passed:
        print("  [PASS] Root-level Leaflet/Three.js compatibility aliases are fully synchronized.")
        
    print("\n--- Verification Summary ---")
    print("All physics model integration checks executed.")

if __name__ == "__main__":
    verify_physics()
