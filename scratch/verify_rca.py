import time
import requests
import json
import sys
from websocket import create_connection

def verify_rca():
    url = "ws://localhost:8080/ws/agent"
    print(f"Connecting to telemetry WebSocket at {url}...")
    try:
        ws = create_connection(url)
        # Receive initial state
        initial_msg = ws.recv()
        print("[PASS] WebSocket connection established.")
    except Exception as e:
        print(f"[FAIL] Could not connect to WebSocket: {e}")
        sys.exit(1)

    print("Triggering simulated solar storm via WebSocket...")
    try:
        storm_command = {
            "action": "UPDATE_WEATHER",
            "solarProtonFlux": 55.0,
            "kpIndex": 6.5,
            "magneticStormLevel": "SEVERE STORM"
        }
        ws.send(json.dumps(storm_command))
        print("  [PASS] Storm command transmitted successfully.")
    except Exception as e:
        print(f"[FAIL] Failed to send storm command: {e}")
        sys.exit(1)

    print("Waiting 10 seconds for physics tick loop to run and generate anomalies...")
    # Wait for 10 seconds to allow the server clock to tick and propagate state changes
    time.sleep(10)

    rca_api_url = "http://localhost:8080/api/telemetry/rca?satelliteId=gaganyaan"
    print(f"Querying Root Cause Analysis API at {rca_api_url}...")
    try:
        res = requests.get(rca_api_url, timeout=5)
        res.raise_for_status()
        rca_data = res.json()
    except Exception as e:
        print(f"[FAIL] Failed to fetch RCA API data: {e}")
        sys.exit(1)

    print("\n--- Root Cause Analysis API Payload ---")
    print(json.dumps(rca_data, indent=2))
    print("---------------------------------------\n")

    # Verify that anomalies were detected and resolved
    active_anomalies = rca_data.get("activeAnomalies", [])
    chains = rca_data.get("chains", [])

    if len(active_anomalies) == 0:
        print("[FAIL] Solar storm failed to trigger any satellite anomalies.")
        sys.exit(1)

    print(f"[PASS] Successfully detected {len(active_anomalies)} active anomalies: {active_anomalies}")

    # Validate causality graph back-propagation integrity
    for chain_entry in chains:
        anomaly = chain_entry.get("anomaly")
        chain = chain_entry.get("chain", [])
        
        if len(chain) == 0:
            print(f"[FAIL] Causality chain is empty for anomaly {anomaly}")
            sys.exit(1)
            
        root_cause = chain[0].get("nodeId")
        print(f"  - Anomaly: {anomaly} | Root Cause: {root_cause}")
        
        # Verify that the root cause resolves back to environmental weather sensors (SolarProtonFlux or KpIndex)
        if root_cause not in ["SolarProtonFlux", "KpIndex"]:
            print(f"  [FAIL] Causality back-propagation did not resolve to a space weather root sensor! Got: {root_cause}")
            sys.exit(1)
        else:
            print(f"  [PASS] Causal linkage traced successfully from {anomaly} -> {root_cause}")

    print("\n[ALL PASS] RCA engine and API telemetry integration verified successfully.")
    ws.close()

if __name__ == "__main__":
    verify_rca()
