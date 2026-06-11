import requests
import json
import threading
import time

dashboard_url = "http://localhost:8080"
print(f"Connecting to MCP SSE endpoint at {dashboard_url}/api/mcp/sse...")

session_uri = None
sse_messages = []
lock = threading.Lock()

# Read the stream in a background thread
def read_sse_stream():
    global session_uri
    try:
        response = requests.get(f"{dashboard_url}/api/mcp/sse", stream=True, timeout=10)
        print(f"SSE Connection established. Status: {response.status_code}")
        
        current_event = None
        for line in response.iter_lines():
            if not line:
                continue
            line_str = line.decode('utf-8')
            if line_str.startswith("event:"):
                current_event = line_str.replace("event:", "").strip()
            elif line_str.startswith("data:"):
                data_str = line_str.replace("data:", "").strip()
                if current_event == "endpoint":
                    session_uri = data_str
                    print(f"✓ Received message endpoint URI: {session_uri}")
                elif current_event == "message":
                    with lock:
                        sse_messages.append(json.loads(data_str))
                    print(f"✓ Received message event in SSE channel.")
    except Exception as e:
        print(f"SSE stream error: {e}")

sse_thread = threading.Thread(target=read_sse_stream, daemon=True)
sse_thread.start()

# Wait for endpoint configuration to arrive
for _ in range(5):
    if session_uri:
        break
    time.sleep(1)
else:
    print("FAIL: Did not receive session endpoint URI from SSE stream.")
    exit(1)

# Step 1: Call tools/list
print("Uplinking 'tools/list' JSON-RPC payload...")
rpc_list = {
    "jsonrpc": "2.0",
    "id": "req-1",
    "method": "tools/list"
}
try:
    post_res = requests.post(f"{dashboard_url}{session_uri}", json=rpc_list)
    assert post_res.status_code == 200, "POST message failed"
    print(f"POST status: {post_res.status_code}. Waiting for SSE reply...")
    
    # Wait for reply in sse_messages
    for _ in range(5):
        time.sleep(1)
        with lock:
            replies = [m for m in sse_messages if m.get("id") == "req-1"]
            if replies:
                print("✓ tools/list reply received!")
                tools = replies[0]["result"]["tools"]
                print(f"Available tools ({len(tools)}):")
                for t in tools:
                    print(f"  - {t['name']}: {t['description']}")
                break
    else:
        raise Exception("Timed out waiting for tools/list response")
except Exception as e:
    print(f"FAIL: {e}")
    exit(1)

# Step 2: Call tools/call for get_space_weather
print("\nUplinking 'tools/call' for 'get_space_weather'...")
rpc_call = {
    "jsonrpc": "2.0",
    "id": "req-2",
    "method": "tools/call",
    "params": {
        "name": "get_space_weather",
        "arguments": {}
    }
}
try:
    post_res = requests.post(f"{dashboard_url}{session_uri}", json=rpc_call)
    assert post_res.status_code == 200, "POST message failed"
    
    # Wait for reply in sse_messages
    for _ in range(5):
        time.sleep(1)
        with lock:
            replies = [m for m in sse_messages if m.get("id") == "req-2"]
            if replies:
                print("✓ get_space_weather tool result received!")
                content = replies[0]["result"]["content"][0]["text"]
                content_json = json.loads(content)
                print("Result payload:")
                print(json.dumps(content_json, indent=2))
                assert "spaceWeather" in content_json, "spaceWeather not found in result"
                break
    else:
        raise Exception("Timed out waiting for get_space_weather response")
except Exception as e:
    print(f"FAIL: {e}")
    exit(1)

print("\nALL WEB MCP SSE TRANSPORT VERIFICATIONS PASSED SUCCESSFULLY!")
