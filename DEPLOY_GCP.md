# Deploying ISRO NETRA Dashboard to Google Cloud Platform (GCP)

This document provides step-by-step instructions to build, secure, and deploy the **ISRO NETRA AI Space Intelligence Dashboard** to **Google Cloud Run** using **Google Cloud Build** and **Secret Manager**.

---

## Prerequisites

1. Install the [Google Cloud SDK (gcloud CLI)](https://cloud.google.com/sdk/docs/install).
2. Create a GCP Project and enable billing.
3. Enable the necessary APIs:
   ```bash
   gcloud services enable run.googleapis.com \
                          cloudbuild.googleapis.com \
                          artifactregistry.googleapis.com \
                          secretmanager.googleapis.com
   ```

---

## Step 1: Secure the Gemini API Key in Secret Manager

We store the `GEMINI_API_KEY` securely in GCP Secret Manager so it can be mounted directly into Cloud Run at runtime without exposing it in source code.

1. **Create the secret**:
   ```bash
   gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
   ```

2. **Add your Gemini API Key value**:
   ```bash
   echo -n "YOUR_GEMINI_API_KEY_HERE" | gcloud secrets versions add GEMINI_API_KEY --data-file=-
   ```

3. **Grant Secret Access to the Cloud Run Service Account**:
   By default, Cloud Run uses the Compute Engine default service account. Grant it permission to read the secret:
   ```bash
   # Retrieve your project number
   PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format="value(projectNumber)")

   # Grant the Secret Manager Secret Accessor role to the default compute service account
   gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
       --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
       --role="roles/secretmanager.secretAccessor"
   ```

---

## Step 1.5: Configure Google Cloud Firestore (Database Native Mode)

The dashboard persists satellite coordinates, ground station logs, and Gemini agent actions in **Google Cloud Firestore**. We need to initialize the database in native mode before deploying.

1. **Enable the Firestore API**:
   ```bash
   gcloud services enable firestore.googleapis.com
   ```

2. **Create the Firestore Database** in Native mode:
   ```bash
   gcloud firestore databases create --location=asia-south1
   ```
   *(Note: Native Mode is standard and selected automatically when utilizing the `--location` flag. Ensure the location matches your Cloud Run region, e.g., `asia-south1` or `us-central1`)*.

3. **Grant Firestore Permissions to Cloud Run**:
   Verify that the Cloud Run service account has the **Cloud Datastore User** role to read/write database items:
   ```bash
   gcloud projects add-iam-policy-binding $(gcloud config get-value project) \
       --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
       --role="roles/datastore.user"
   ```

---

## Step 2: Create Artifact Registry Repository

Create a Docker repository in the Artifact Registry to store your container images:
```bash
gcloud artifacts repositories create space-ops-repo \
    --repository-format=docker \
    --location=asia-south1 \
    --description="Docker repository for Space Operations Applications"
```

---

## Step 3: Deploy using Google Cloud Build

Use Google Cloud Build to compile your container and deploy it automatically:

```bash
gcloud builds submit --config=cloudbuild.yaml \
    --substitutions=PROJECT_ID=$(gcloud config get-value project),_REPO_NAME=space-ops-repo,_REGION=asia-south1
```

---

## Step 4: Mount the Secret to Cloud Run

After the initial deployment succeeds, update the Cloud Run service to map the `GEMINI_API_KEY` secret into the container environment:

```bash
gcloud run services update isro-netra-dashboard \
    --region=asia-south1 \
    --update-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest
```

Your service will redeploy securely, with the `GEMINI_API_KEY` accessible as an environment variable (`process.env.GEMINI_API_KEY` or `process.env.process.env.GEMINI_API_KEY`) on the Express backend!

---

## Integrating External AI Agents via WebSockets

Once running on Cloud Run, the backend exposes a WebSocket gateway at:
`wss://isro-netra-dashboard-<hash>-as.a.run.app/ws/agent`

### Telemetry Stream JSON Format (Outgoing)
The server broadcasts the current SGP4-calculated space states to all connected agent sockets every 1 second:
```json
{
  "type": "TELEMETRY_UPDATE",
  "epoch": "2026-06-04T12:00:00.000Z",
  "satellites": [
    {
      "id": "gaganyaan",
      "name": "Gaganyaan-1 (Crew Module)",
      "lat": 15.3421,
      "lng": 75.8922,
      "alt": 405.23,
      "velocity": 7.67,
      "threatLevel": "WARNING",
      "threatDetails": "Cosmos-1408 Debris fragment intercept in 4 mins"
    }
  ]
}
```

### Agent Command Format (Incoming)
An external agent (like Google Vertex AI Agent Builder, or an autonomous Python worker) can send a command packet to alter a satellite's orbit to evade space debris:
```json
{
  "action": "MANEUVER_ORBIT",
  "satelliteId": "gaganyaan",
  "deltaV": 1.45,
  "direction": "PROGRADE"
}
```
Upon receiving this command, the dashboard calculates the new Keplerian trajectory, updates the SGP4 propagation epoch, plays an audible uplink success tone, and logs the agentic intervention in the command logs.
