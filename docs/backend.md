# Smart Lab Automation - Backend Architecture

## 1. Overview
The Backend is built with Python and Flask. It serves as the central communications bridge between:
- **Vision Subsystem** $\leftrightarrow$ **Backend** $\leftrightarrow$ **ESP32 Microcontroller**
- **Web Dashboard** $\leftrightarrow$ **Backend** $\leftrightarrow$ **ESP32 Microcontroller**

## 2. Directory Structure
```
backend/
├── app.py                      # Flask Application Factory & static file server
├── models/
│   ├── __init__.py
│   └── schemas.py             # Data classes for Appliances, Zones, Energy
├── services/
│   ├── __init__.py
│   ├── zone_service.py        # Central zone state authority & dispatch
│   ├── esp32_client.py        # Hardware HTTP REST client with simulation mode
│   └── energy_service.py      # PZEM-004T telemetry processing
└── routes/
    ├── __init__.py
    ├── zones.py               # /api/zones routes
    ├── status.py              # /api/status health check
    ├── energy.py              # /api/energy telemetry
    └── vision.py              # /api/vision/sync & /api/vision/feed
```

## 3. Hardware Simulation vs. Real Hardware Mode
In `backend/services/esp32_client.py`:
- `mock_hardware: true` (default in development):
  - No physical ESP32 required.
  - Commands log cleanly and simulate state changes.
  - Returns `DEVELOPMENT_SIMULATION_MODE` status.
- `mock_hardware: false` (production mode):
  - Sends live HTTP requests to `http://<ESP32_IP>/api/...`.
  - Queries physical PZEM-004T for real voltage, current, and wattage.

## 4. Running the Backend Server
```bash
python -m backend.app --host 0.0.0.0 --port 5000
```
API endpoints will be reachable at `http://localhost:5000/api/...`.
The Web Dashboard will be available at `http://localhost:5000/`.
