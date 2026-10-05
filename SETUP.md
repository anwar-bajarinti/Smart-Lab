# Smart Lab Automation - Setup & Quickstart Guide

This guide walks you through setting up and running the entire Smart Lab Automation system on your machine.

---

## 1. Prerequisites
- **Python 3.10+** (Python 3.13 is supported and verified)
- **OpenCV & PyTorch** (Installed via requirements)
- **Webcam** (Built-in laptop webcam or external USB camera)
- **ESP32 DevKit V1** (Optional for hardware phase; simulation mode works out-of-the-box)

---

## 2. Install Python Dependencies
Open PowerShell or your terminal in `E:\Smart-Lab`:
```powershell
pip install -r requirements.txt
```

---

## 3. Verify System Installation (Run Tests)
Execute the complete test suite covering all 21 unit and integration tests:
```powershell
python -m pytest tests -v
```
All 21 tests should pass:
- Spatial 3×3 grid mapping & boundary clamping
- Biomechanical raised hand detection
- Temporal debounce (0.8s hold time)
- Vacancy delay timers (2.5s)
- Multi-person tracking and cross-zone isolation
- Deterministic priority resolution (`MANUAL_ON > MANUAL_OFF > AUTO`)
- Inter-zone movement isolation
- Backend REST API endpoints

---

## 4. Run the Backend Server
Start the Flask REST API and Web Dashboard:
```powershell
python -m backend.app --host 0.0.0.0 --port 5000
```
- Web Dashboard: `http://localhost:5000/`
- REST API Status: `http://localhost:5000/api/status`

---

## 5. Run the Vision System
In a second terminal, launch the vision pipeline with your laptop webcam:
```powershell
python -m vision.main --camera 0 --sync-backend
```
- A window titled `SMART LAB AUTOMATION - 9-ZONE VISION SYSTEM` will open showing:
  - 3×3 grid with active zone highlights
  - Person bounding boxes with skeleton overlays
  - Floor contact tracking markers (at feet/ankles)
  - Diagnostic HUD badges over each person
  - Real-time 9-zone status side panel
- Controls in OpenCV window:
  - Press `q` or `ESC` to quit safely.
  - Press `m` to toggle camera mirroring.

---

## 6. Access the Web Dashboard
Open your browser to:
```
http://localhost:5000/
```
From the web dashboard you can:
- View all 9 zones in real time.
- Switch to the **Vision AI Live Feed** tab to monitor the camera.
- Switch to the **PZEM-004T Energy Analytics** tab to view electrical loads.
- Manually click to turn lights/fans ON or OFF or adjust fan speeds.

---

## 7. ESP32 Hardware Deployment (When ready)
1. Open `esp32/smart_lab_controller/smart_lab_controller.ino` in Arduino IDE.
2. Update `WIFI_SSID` and `WIFI_PASSWORD`.
3. Select your ESP32 board and COM port, then click **Upload**.
4. Note the ESP32 IP address from Serial Monitor.
5. In `config/system_config.json`, set:
   ```json
   "esp32": {
     "host": "<YOUR_ESP32_IP>",
     "mock_hardware": false
   }
   ```
6. Restart `backend.app`. The backend will now switch from **SIMULATION MODE** to **REAL HARDWARE MODE** and control your physical relays and read your PZEM-004T.
