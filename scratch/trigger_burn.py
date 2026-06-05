import asyncio
import json
import websockets

async def trigger():
    uri = "ws://localhost:8080/ws/agent"
    print(f"Connecting to {uri}...")
    async with websockets.connect(uri) as ws:
        # Wait for the initial state
        initial = await ws.recv()
        print("Connected! Initial state synced.")
        
        burn_cmd = {
            "action": "MANEUVER_ORBIT",
            "satelliteId": "cartosat-3",
            "deltaV": 1.45,
            "direction": "PROGRADE"
        }
        print("Sending burn command for Cartosat-3...")
        await ws.send(json.dumps(burn_cmd))
        
        # Read the next message to see if ORBIT_MODIFIED is returned
        for _ in range(5):
            msg = await ws.recv()
            packet = json.loads(msg)
            if packet.get("type") == "ORBIT_MODIFIED":
                print(f"[SUCCESS] Server acknowledged burn: {packet['data']['details']}")
                break
        else:
            print("Command sent, but no ORBIT_MODIFIED packet received.")

if __name__ == "__main__":
    asyncio.run(trigger())
