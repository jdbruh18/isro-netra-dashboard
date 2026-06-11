import http.server
import socketserver
import threading
import json
import time
import requests
import websocket

# Mock HTTP Webhook server
received_payloads = []

class WebhookHandler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        payload = json.loads(post_data.decode('utf-8'))
        received_payloads.append(payload)
        
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({"status": "OK"}).encode('utf-8'))
        
    def log_message(self, format, *args):
        # Mute logging to stdout
        return

def run_mock_server():
    with socketserver.TCPServer(("localhost", 9000), WebhookHandler) as httpd:
        httpd.serve_forever()

# Start mock server in a background thread
server_thread = threading.Thread(target=run_mock_server, daemon=True)
server_thread.start()

print("Mock Webhook Server listening on http://localhost:9000/webhook")

# Wait a brief moment for the server to spin up
time.sleep(1)

# Step 1: Test connection through /api/webhooks/test
dashboard_url = "http://localhost:8080"
print(f"Testing connectivity to operations dashboard at {dashboard_url}...")
try:
    test_res = requests.post(f"{dashboard_url}/api/webhooks/test", json={
        "url": "http://localhost:9000/webhook"
    })
    print(f"Test connection response code: {test_res.status_code}")
    print(f"Test connection response body: {test_res.text}")
    assert test_res.status_code == 200, "Webhook test failed"
    assert len(received_payloads) == 1, "Mock server did not receive test payload"
    assert received_payloads[0]["event"] == "TEST_CONNECTION", "Unexpected event type"
    print("✓ Connection test successful!")
except Exception as e:
    print(f"FAIL: {e}")
    exit(1)

# Step 2: Register webhook
print("Registering webhook at dashboard...")
try:
    reg_res = requests.post(f"{dashboard_url}/api/webhooks", json={
        "name": "Python Test Gateway",
        "url": "http://localhost:9000/webhook",
        "events": ["MANEUVER_EXECUTED", "SOLAR_STORM_ALERT", "ANOMALY_TRIGGERED"]
    })
    print(f"Registration response: {reg_res.text}")
    assert reg_res.status_code == 200, "Webhook registration failed"
    webhook_id = reg_res.json()["id"]
    print(f"✓ Webhook registered with ID: {webhook_id}")
except Exception as e:
    print(f"FAIL: {e}")
    exit(1)

# Step 3: Trigger a Maneuver via WebSocket connection to trigger webhook
print("Connecting to WebSocket to trigger a maneuver burn...")
try:
    ws = websocket.create_connection(f"ws://localhost:8080/ws/agent")
    
    # Trigger burn
    burn_cmd = {
        "action": "MANEUVER_ORBIT",
        "satelliteId": "gaganyaan",
        "deltaV": 2.5,
        "direction": "PROGRADE"
    }
    ws.send(json.dumps(burn_cmd))
    print("Maneuver burn uplink packet transmitted.")
    ws.close()
    
    # Wait for webhook to receive payload
    print("Waiting for outbound webhook transmission...")
    for _ in range(5):
        time.sleep(1)
        # Search received payloads for MANEUVER_EXECUTED
        maneuver_payloads = [p for p in received_payloads if p.get("event") == "MANEUVER_EXECUTED"]
        if maneuver_payloads:
            print("✓ Outbound Webhook Alert received successfully!")
            payload = maneuver_payloads[0]["payload"]
            print(f"Payload details:")
            print(f"  Satellite: {payload.get('satelliteName')}")
            print(f"  Delta-V: {payload.get('deltaV')} m/s")
            print(f"  Direction: {payload.get('direction')}")
            print(f"  Shift: +{payload.get('altShift')} km")
            break
    else:
        raise Exception("Timed out waiting for MANEUVER_EXECUTED webhook payload")
        
except Exception as e:
    print(f"FAIL: {e}")
    # Cleanup webhook registration before exit
    requests.delete(f"{dashboard_url}/api/webhooks/{webhook_id}")
    exit(1)

# Step 4: Cleanup webhook registration
print("Cleaning up webhook registration...")
try:
    del_res = requests.delete(f"{dashboard_url}/api/webhooks/{webhook_id}")
    assert del_res.status_code == 200, "Failed to delete webhook"
    print("✓ Webhook registration cleaned up.")
except Exception as e:
    print(f"FAIL: {e}")
    exit(1)

print("\nALL WEBHOOK INTEGRATION TESTS PASSED SUCCESSFULLY!")
