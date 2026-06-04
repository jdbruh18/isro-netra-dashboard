#!/usr/bin/env python3
"""
ISRO NETRA Autonomous Agent Client
Connects to the Space Dashboard WebSocket gateway, monitors orbital telemetry,
and automatically triggers evasive maneuvers if a collision threat is detected.

Requirements:
    pip install websockets asyncio
"""

import asyncio
import json
import sys
import os

# Configuration: defaults to local container, can be pointed to Google Cloud Run
WS_URI = os.getenv("NETRA_WS_URI", "ws://localhost:8080/ws/agent")

async def monitor_space_corridors():
    print(f"==================================================")
    print(f"  ISRO NETRA: Autonomous AI Agent Client Active  ")
    print(f"  Target Downlink: {WS_URI}")
    print(f"==================================================")

    while True:
        try:
            print("[INFO] Attempting connection to telemetry gateway...")
            async with websockets.connect(WS_URI) as websocket:
                print("[SUCCESS] Downlink synchronized. Listening to satellite telemetry...")
                
                async for message in websocket:
                    packet = json.loads(message)
                    
                    # 1. Process clock ticks and telemetry coordinates
                    if packet.get("type") == "TELEMETRY_CLOCK_TICK":
                        satellites = packet["data"]["satellites"]
                        
                        gaganyaan = next((s for s in satellites if s["id"] == "gaganyaan"), None)
                        debris = next((s for s in satellites if s["id"] == "cosmos-debris"), None)
                        
                        if gaganyaan and debris:
                            print(f"[TELEMETRY] Epoch Sync | Gaganyaan Alt: {gaganyaan['alt']:.1f}km | Debris Alt: {debris['alt']:.1f}km")
                            
                            # Check threat status
                            threat_level = gaganyaan.get("threatLevel", "NORMAL")
                            details = gaganyaan.get("threatDetails", "")
                            
                            if threat_level in ["WARNING", "DANGER"]:
                                print(f"\n[!!! ALARM !!!] {threat_level} ALERT DETECTED!")
                                print(f"Details: {details}")
                                print("[AGENT REASONING] Calculating orbital deflection vector...")
                                
                                # Simulate 2 seconds of cognitive analysis (e.g., calling Vertex AI / Gemini)
                                await asyncio.sleep(2)
                                
                                # Calculate required delta-v based on threat level
                                delta_v = 1.85 if threat_level == "DANGER" else 1.45
                                
                                # 2. Compile and send maneuver override command
                                command_packet = {
                                    "action": "MANEUVER_ORBIT",
                                    "satelliteId": "gaganyaan",
                                    "deltaV": delta_v,
                                    "direction": "PROGRADE"
                                }
                                
                                print(f"[AGENT ACTION] Uplinking thruster ignition command: {delta_v} m/s PROGRADE burn.")
                                await websocket.send(json.dumps(command_packet))
                                print("[AGENT STATUS] Command packet transmitted. Monitoring response...\n")
                                
                                # Sleep briefly to prevent duplicate execution during SGP4 calculation transition
                                await asyncio.sleep(5)
                                
                    elif packet.get("type") == "ORBIT_MODIFIED":
                        details = packet["data"]["details"]
                        source = packet["data"]["source"]
                        print(f"[UPLINK RECEIVED] {details} | Trigger Source: {source}")

        except websockets.exceptions.ConnectionClosed:
            print("[WARNING] Connection lost. Retrying in 5 seconds...")
            await asyncio.sleep(5)
        except Exception as e:
            print(f"[ERROR] Connection failed: {e}. Retrying in 5 seconds...")
            await asyncio.sleep(5)

if __name__ == "__main__":
    # Import websockets inside main function to provide clean error if missing
    try:
        import websockets
    except ImportError:
        print("[ERROR] Missing required dependency 'websockets'. Run: pip install websockets")
        sys.exit(1)

    try:
        asyncio.run(monitor_space_corridors())
    except KeyboardInterrupt:
        print("\n[INFO] Agent shutdown by operator.")
