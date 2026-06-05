import urllib.request
import json
import time
import sys

def make_request(url, data=None):
    try:
        req = urllib.request.Request(url)
        if data:
            req.add_header('Content-Type', 'application/json')
            post_data = json.dumps(data).encode('utf-8')
            with urllib.request.urlopen(req, data=post_data) as response:
                return json.loads(response.read().decode('utf-8'))
        else:
            with urllib.request.urlopen(req) as response:
                return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"HTTP request failed to {url}: {e}")
        return None

async def test_websocket_storm():
    # Since we can just use HTTP or WebSocket, wait, the express app has a `/api/gemini` endpoint.
    # Wait, can we send UPDATE_WEATHER via websocket? Yes. Let's see if we have websockets installed.
    try:
        import websockets
        import asyncio
    except ImportError:
        print("[WARNING] 'websockets' module not installed. We will use fallback verification.")
        return False

    WS_URI = "ws://localhost:8080/ws/agent"
    print(f"Connecting to WebSocket: {WS_URI}")
    try:
        async with websockets.connect(WS_URI) as ws:
            # 1. Trigger simulated solar storm
            storm_packet = {
                "action": "UPDATE_WEATHER",
                "solarProtonFlux": 55.0,
                "kpIndex": 6.5,
                "magneticStormLevel": "SEVERE STORM"
            }
            print("[TEST] Sending simulated solar storm packet to server...")
            await ws.send(json.dumps(storm_packet))
            await asyncio.sleep(1)
            return True
    except Exception as e:
        print(f"WebSocket connection failed: {e}")
        return False

def verify_health():
    # 1. Fetch initial telemetry
    print("[TEST] Fetching initial telemetry...")
    initial_telemetry = make_request("http://localhost:8080/api/telemetry")
    if not initial_telemetry:
        print("[FAIL] Failed to retrieve telemetry.")
        sys.exit(1)
        
    gaganyaan = next((s for s in initial_telemetry['satellites'] if s['id'] == 'gaganyaan'), None)
    if not gaganyaan:
        print("[FAIL] Gaganyaan not found in telemetry.")
        sys.exit(1)
        
    if 'health' not in gaganyaan:
        print("[FAIL] Health metrics not present in Gaganyaan telemetry.")
        sys.exit(1)
        
    print(f"[SUCCESS] Gaganyaan health metrics found:")
    print(f"  Solar Voltage: {gaganyaan['health']['solarV']} V")
    print(f"  Battery Temp: {gaganyaan['health']['battTemp']} C")
    print(f"  Downlink SNR: {gaganyaan['health']['downlinkSNR']} dB")
    print(f"  Fuel Pressure: {gaganyaan['health']['fuelPressure']} psi")

    initial_temp = gaganyaan['health']['battTemp']
    initial_alt = gaganyaan['alt']

    # 2. Trigger storm
    import asyncio
    ws_success = False
    try:
        ws_success = asyncio.run(test_websocket_storm())
    except Exception as e:
        print(f"Error running websocket trigger: {e}")

    if not ws_success:
        print("[WARNING] Could not trigger storm via WebSocket. Let's see if storm is already active or verify standard states.")

    # 3. Wait for 5 seconds to let the physics loop tick
    print("[TEST] Waiting 5 seconds for telemetry to tick and accumulate values...")
    time.sleep(5)

    # 4. Fetch updated telemetry
    updated_telemetry = make_request("http://localhost:8080/api/telemetry")
    if not updated_telemetry:
        print("[FAIL] Failed to retrieve updated telemetry.")
        sys.exit(1)
        
    gaganyaan_updated = next((s for s in updated_telemetry['satellites'] if s['id'] == 'gaganyaan'), None)
    
    print("\n--- Telemetry Updates Post-Storm ---")
    print(f"  Battery Temp: {initial_temp:.1f} C  ==>  {gaganyaan_updated['health']['battTemp']:.1f} C")
    print(f"  Downlink SNR: {gaganyaan['health']['downlinkSNR']:.1f} dB  ==>  {gaganyaan_updated['health']['downlinkSNR']:.1f} dB")
    print(f"  Altitude: {initial_alt:.3f} km  ==>  {gaganyaan_updated['alt']:.3f} km")

    # Validate battery temperature surged
    if gaganyaan_updated['health']['battTemp'] > initial_temp:
        print("[PASS] Battery temperature surged under storm conditions!")
    else:
        print("[FAIL] Battery temperature did not increase under storm conditions.")

    # Validate SNR degraded
    if gaganyaan_updated['health']['downlinkSNR'] < 20.0:
        print("[PASS] Downlink SNR degraded under high Kp Index!")
    else:
        print("[FAIL] Downlink SNR did not degrade as expected.")

    # Validate drag decay (altitude decreased)
    if gaganyaan_updated['alt'] < initial_alt:
        print("[PASS] Atmospheric drag decay active! Altitude decreased.")
    else:
         print("[FAIL] Altitude did not decay.")

if __name__ == "__main__":
    verify_health()
