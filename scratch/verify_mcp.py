import subprocess
import json
import time
import os

MCP_SERVER_PATH = r"D:\space-intelligence-dashboard\mcp-server.js"

def send_rpc_request(process, request):
    payload = json.dumps(request) + "\n"
    process.stdin.write(payload)
    process.stdin.flush()
    time.sleep(0.3)
    response_line = process.stdout.readline().strip()
    if not response_line:
        return None
    try:
        return json.loads(response_line)
    except Exception as e:
        print(f"Failed to parse response line: '{response_line}' - {e}")
        return None

def test_mcp_server():
    print("==================================================")
    print("ISRO NETRA MCP Server Stdio Protocol Verification")
    print("==================================================")

    if not os.path.exists(MCP_SERVER_PATH):
        print(f"[FAIL] MCP Server file not found at: {MCP_SERVER_PATH}")
        return False

    # Launch node mcp-server.js as a subprocess
    process = subprocess.Popen(
        ["node", MCP_SERVER_PATH],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        shell=True
    )

    # Allow startup log to output on stderr
    time.sleep(0.5)

    success = True
    try:
        # Test 1: JSON-RPC Initialize
        print("\n--- Test 1: JSON-RPC initialize request ---")
        init_req = {
            "jsonrpc": "2.0",
            "id": "1",
            "method": "initialize",
            "params": {
                "capabilities": {},
                "clientInfo": {"name": "verify-mcp-agent", "version": "1.0.0"},
                "protocolVersion": "2024-11-05"
            }
        }
        res = send_rpc_request(process, init_req)
        if res and "result" in res and res["result"].get("serverInfo", {}).get("name") == "isro-netra-mcp":
            print("[PASS] Initialize request succeeded. Server info verified.")
        else:
            print(f"[FAIL] Initialize request returned invalid response: {res}")
            success = False

        # Test 2: JSON-RPC tools/list
        print("\n--- Test 2: JSON-RPC tools/list request ---")
        list_req = {
            "jsonrpc": "2.0",
            "id": "2",
            "method": "tools/list"
        }
        res = send_rpc_request(process, list_req)
        if res and "result" in res and "tools" in res["result"]:
            tools = res["result"]["tools"]
            tool_names = [t["name"] for t in tools]
            print(f"Exposed tools: {tool_names}")
            required_tools = [
                "get_space_assets",
                "get_space_weather",
                "get_anomaly_diagnostics",
                "get_root_cause_analysis",
                "consult_solar_physics_analyst",
                "validate_subsystem_state",
                "calculate_avoidance_vector",
                "execute_orbital_burn"
            ]
            missing = [t for t in required_tools if t not in tool_names]
            if not missing:
                print("[PASS] All 8 required tools are successfully exposed.")
            else:
                print(f"[FAIL] Missing tools in MCP listing: {missing}")
                success = False
        else:
            print(f"[FAIL] tools/list request returned invalid response: {res}")
            success = False

        # Test 3: JSON-RPC tools/call (get_space_weather)
        print("\n--- Test 3: JSON-RPC tools/call request (get_space_weather) ---")
        weather_req = {
            "jsonrpc": "2.0",
            "id": "3",
            "method": "tools/call",
            "params": {
                "name": "get_space_weather",
                "arguments": {}
            }
        }
        res = send_rpc_request(process, weather_req)
        if res and "result" in res and "content" in res["result"]:
            content = res["result"]["content"][0]["text"]
            weather_data = json.loads(content)
            print(f"Exposed weather data keys: {list(weather_data.keys())}")
            if "kpIndex" in weather_data and "solarWindSpeed" in weather_data and "solarProtonFlux" in weather_data:
                print("[PASS] Space weather tool executes and returns correct data schema.")
            else:
                print(f"[FAIL] Space weather data missing fields: {weather_data}")
                success = False
        else:
            print(f"[FAIL] get_space_weather call returned invalid response: {res}")
            success = False

        # Test 4: JSON-RPC tools/call (get_space_assets)
        print("\n--- Test 4: JSON-RPC tools/call request (get_space_assets) ---")
        assets_req = {
            "jsonrpc": "2.0",
            "id": "4",
            "method": "tools/call",
            "params": {
                "name": "get_space_assets",
                "arguments": {}
            }
        }
        res = send_rpc_request(process, assets_req)
        if res and "result" in res and "content" in res["result"]:
            content = res["result"]["content"][0]["text"]
            assets_data = json.loads(content)
            print(f"Number of tracked assets loaded: {len(assets_data)}")
            if len(assets_data) > 0 and "id" in assets_data[0] and "name" in assets_data[0]:
                print("[PASS] Space assets tool executes and lists digital twins successfully.")
            else:
                print(f"[FAIL] Space assets data schema is invalid: {assets_data}")
                success = False
        else:
            print(f"[FAIL] get_space_assets call returned invalid response: {res}")
            success = False

    except Exception as e:
        print(f"[FAIL] Verification script encountered runtime error: {e}")
        success = False
    finally:
        # Graceful cleanup
        try:
            process.stdin.close()
        except Exception as e:
            pass
        try:
            process.terminate()
        except Exception as e:
            pass
        try:
            process.wait()
        except Exception as e:
            pass
        try:
            stderr_logs = process.stderr.read().strip()
            if stderr_logs:
                print("\n--- Server stderr logs ---")
                print(stderr_logs)
                print("--------------------------")
        except Exception as e:
            print(f"Error reading stderr: {e}")

    print("\n==================================================")
    if success:
        print("FINAL RESULTS: ALL TESTS PASSED SUCCESSFULLY.")
    else:
        print("FINAL RESULTS: SOME TESTS FAILED.")
    print("==================================================")
    return success

if __name__ == "__main__":
    test_mcp_server()
