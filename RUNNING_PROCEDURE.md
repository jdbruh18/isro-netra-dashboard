# ISRO NETRA Space Intelligence Dashboard - Operational Run Guide

This guide provides the step-by-step procedures to build, run, test, and execute the Space Intelligence Dashboard and its autonomous AI agent loops independently.

---

## 1. Prerequisites

Ensure your host machine has the following tools installed:
1. **Docker & Docker Compose**: For building and hosting the local containerized telemetry server.
2. **Python 3.10+**: For running verification tests and the autonomous agent script.
3. **Web Browser**: Chrome, Edge, or Firefox for accessing the graphical HUD dashboard.

---

## 2. Launching the Backend Telemetry Server

To spin up the Node.js Express telemetry and WebSocket proxy server:

1. Open a terminal (PowerShell or Bash) and navigate to the project directory:
   ```bash
   cd D:\space-intelligence-dashboard
   ```
2. Build and start the containers using Docker Compose:
   ```bash
   docker compose up --build
   ```
3. Verify the container output. You should see:
   ```text
   isro_netra_dashboard  | Local Database: Active. Path: /app/db-local.json
   isro_netra_dashboard  | Database sync complete: Loaded 5 space assets.
   isro_netra_dashboard  | ISRO NETRA Operations Server running on http://localhost:8080
   isro_netra_dashboard  | WebSocket Agent Gateway mounted at ws://localhost:8080/ws/agent
   ```
4. Keep this container running in the background. To stop it later, run `docker compose down`.

---

## 3. Accessing the Graphical HUD Dashboard

1. Open your web browser and navigate to:
   ```text
   http://localhost:8080
   ```
2. The dashboard will automatically synchronize with the server's WebSocket downlink.
3. Tap **2D TRACK** in the center panel header to switch Map views.
4. Interact with the HUD widgets, toggle audio siren alarms, or view detailed diagnostics cards.

---

## 4. Querying and Steering Assets via Gemini AI

### Option A: Using the Graphical Console (With API Key)
1. Paste your **Gemini API Key** in the input field at the bottom of the chat panel.
2. Press **SAVE KEY** (it is stored securely inside your browser's local storage).
3. Type a query in the chat console:
   ```text
   Check active conjunction threats and steer Gaganyaan to safety if clearance is confirmed.
   ```
4. The Operations Commander will automatically execute recursive tool calls:
   - Queries `get_active_conjunctions` (scans orbits for debris).
   - Queries `get_anomaly_diagnostics` (inspects battery temperature and SNR).
   - Calls `calculate_avoidance_vector` (computes necessary delta-v).
   - Calls `consult_solar_physics_analyst` (validates Aditya solar wind safety).
   - Fires `execute_orbital_burn` (applies burn, raises altitude, and clears alarm).

### Option B: Local Simulation Fallback (Without API Key)
1. If no API Key is provided, the dashboard defaults to **Local Simulation Fallback Mode**.
2. Type the same command (*"avoid collision"* or *"steer spacecraft"*) in the chat console.
3. The client-side simulator will run the identical tool execution sequence deterministically, update the orbital state, and raise altitude by the calculated offset.

---

## 5. Running the Telemetry Verification Script

To mathematically inspect the satellite-to-debris orbital proximities and verify that conjunction detection calculations match 1:1 on the server:

1. Open a new terminal.
2. Run the verification script:
   ```bash
   python scratch/verify_conjunctions.py
   ```
3. The script will output the dynamic geodetic locations and pairwise distances:
   ```text
   Loaded 5 satellites/debris from telemetry:
    - Gaganyaan Crew Module (ID: gaganyaan) | Alt: 405.1 km | Lat: 15.3421 | Lng: 77.5922
    - Cosmos-1408 Debris #412 (ID: cosmos-debris) | Alt: 405.41 km | Lat: 15.351 | Lng: 77.6330
    - ISS (ZARYA) (ID: sat-25544) | Alt: 449.9 km | Lat: 19.4762 | Lng: 149.1771

   Pairwise Proximity Analysis (Physical Distance using lat/lng/alt):
     Gaganyaan Crew Module vs Cosmos-1408 Debris #412: Dist = 4.78 km | Probability = 96.09%
       --> [CONJUNCTION DETECTED] level: DANGER
   ```

---

## 6. Launching the Autonomous AI Agent Client

To run a closed-loop autonomous flight controller that listens to WebSocket telemetry feeds and triggers maneuvers without manual operators:

1. Install the required Python WebSocket library:
   ```bash
   pip install websockets
   ```
2. Start the autonomous agent in unbuffered mode:
   ```bash
   python -u agent_client.py
   ```
3. Watch the logs. The agent will:
   - Connect to `ws://localhost:8080/ws/agent`.
   - Log the real-time SGP4 coordinates.
   - Automatically trigger an orbital adjustment burn once `DANGER` thresholds are breached, raising the spacecraft's orbit and clearing the hazard:
   ```text
   [SUCCESS] Downlink synchronized. Listening to satellite telemetry...
   [TELEMETRY] Epoch Sync | Gaganyaan Alt: 405.1km | Debris Alt: 405.4km
   
   [!!! ALARM !!!] DANGER ALERT DETECTED!
   Details: Conjunction danger with Cosmos-1408 Debris #412. Distance: 4.78 km.
   [AGENT REASONING] Calculating orbital deflection vector...
   [AGENT ACTION] Uplinking thruster ignition command: 1.85 m/s PROGRADE burn.
   [AGENT STATUS] Command packet transmitted. Monitoring response...
   ```

---

## 7. Manual REST API Testing (Command Line)

You can manually query or modify the space asset catalog from any command line tool:

* **Search CelesTrak NORAD Database**:
  ```bash
  curl "http://localhost:8080/api/catalog/search?query=25544"
  ```
* **Add a Satellite to Tracking Live**:
  ```bash
  curl -X POST -H "Content-Type: application/json" -d "{\"noradId\": 25544}" http://localhost:8080/api/catalog/add
  ```
* **Fetch Current Telemetry States**:
  ```bash
  curl "http://localhost:8080/api/telemetry"
  ```

---

## 8. Running the Model Context Protocol (MCP) Server

You can run the Space Intelligence Dashboard as an MCP Server directly via stdio. This enables any MCP client (such as Claude Desktop or Cursor) to call spacecraft tools:

1. **Verify local database file exists**:
   Ensure `db-local.json` exists in the root (it is generated automatically on the first startup of either the main server or the MCP server).
2. **Execute the MCP server via npm**:
   ```bash
   npm run mcp
   ```
3. **Debug stdio connection**:
   Since the server uses standard I/O for MCP JSON-RPC packets, all operational logs, debugging statements, and errors are printed exclusively to `stderr` (`console.error`). Stderr outputs will show:
   ```text
   [MCP-INFO] ISRO NETRA Space Domain Awareness MCP Server active.
   ```
   If you configure the server inside Claude Desktop, you can review Claude's logs to inspect any incoming tool calls and responses.

