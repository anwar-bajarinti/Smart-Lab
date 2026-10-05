# SMART LAB AUTOMATION SYSTEM

> Autonomous, vision-guided, multi-zone laboratory environment controller using real-time computer vision, biomechanical gesture recognition, REST microservices, and ESP32 IoT hardware.

---

## 🌟 Key Capabilities

- **Real Laptop Webcam Vision Sensor**: Direct video capture with OpenCV DirectShow hardware acceleration.
- **3×3 Physical Grid Mapping**: Laboratory floor segmented into 9 distinct physical operational zones ($Z_1$ through $Z_9$).
- **Floor-Contact Localization**: Determines zone coordinates strictly from **foot/ankle landmarks** (midpoint between ankles or bottom-center bounding box), never hand positions.
- **Biomechanical Gesture Detection**: Analyzes wrists, elbows, and shoulders with adaptive torso vertical clearance to prevent false triggers from typing or arm movements.
  - **0 Hands Raised** $\rightarrow$ `AUTO` (Turns appliances ON when person enters, turns OFF 2.5s after leaving).
  - **1 Hand Raised** (Wrist above shoulder for $>0.8$s) $\rightarrow$ `MANUAL_OFF` (Switches OFF and **stays OFF** even while the person continues standing in the zone).
  - **2 Hands Raised** (Both wrists above shoulders for $>0.8$s) $\rightarrow$ `MANUAL_ON` (Switches ON, overriding previous manual OFF).
- **Multi-Person Support & Cross-Zone Isolation**:
  - Independent state tracking for every detected person (Tracking ID, Zone, Position, Gesture, Mode).
  - No global variables. One person's gesture in $Z_2$ never affects someone else in $Z_8$.
  - Inter-zone movement isolation: If a person in $Z_5$ with `MANUAL_OFF` moves to $Z_2$, the override does NOT follow them; they enter $Z_2$ in `AUTO`, while $Z_5$ becomes empty and powers down after the vacancy delay.
- **Deterministic Priority Arbitration in Shared Zones**:
  $$\text{Priority:} \quad \text{MANUAL\_ON} > \text{MANUAL\_OFF} > \text{AUTO}$$
- **Full-Stack REST Backend & Interactive Dashboard**:
  - Complete Flask REST API.
  - Interactive HTML5 single-page application dashboard with live camera feed (MJPEG), 9 zone cards, manual overrides, and PZEM-004T energy monitoring.
- **ESP32 Firmware**:
  - Standalone C++/Arduino firmware in `esp32/smart_lab_controller/`.
  - Controls Relays (GPIO 22, 23 - Active HIGH), Xenbrix AC Dimmer (GPIO 27, 26), and PZEM-004T AC Power Monitor (GPIO 25, 33).
  - Clear separation between **Simulation Mode** and **Real Hardware Mode**.

---

## 📁 Project Structure

```
E:\Smart-Lab
├── vision/                         # Real-Time Computer Vision Core
│   ├── __init__.py
│   ├── camera.py                   # Thread-safe OpenCV capture with mirroring
│   ├── person_detector.py          # YOLOv8-Pose multi-person tracking & keypoints
│   ├── person_tracker.py           # Fallback centroid & IOU tracking engine
│   ├── pose_detector.py            # Foot/ankle floor position & torso scaling
│   ├── gesture_detector.py         # Biomechanical arm pose analysis
│   ├── person_state.py             # Independent person state machine & debounce
│   ├── zone_state.py               # Independent zone state machine & vacancy delay
│   ├── zone_manager.py             # 3x3 grid geometry & point-to-zone calculations
│   ├── occupancy_manager.py        # Central occupancy coordinator & priority solver
│   ├── controller.py               # Master vision pipeline & diagnostic HUD overlay
│   └── main.py                     # Vision entrypoint script with OpenCV window
│
├── backend/                        # REST API & Web Application Server
│   ├── app.py                      # Flask master server & static dashboard host
│   ├── models/
│   │   ├── __init__.py
│   │   └── schemas.py              # Zone, Appliance, and Energy data schemas
│   ├── services/
│   │   ├── __init__.py
│   │   ├── zone_service.py         # Zone state authority & hardware dispatcher
│   │   ├── esp32_client.py         # ESP32 REST client with mock fallback
│   │   └── energy_service.py       # PZEM-004T telemetry processing & history
│   └── routes/
│       ├── __init__.py
│       ├── zones.py                # Appliance control endpoints
│       ├── status.py               # Health & telemetry endpoints
│       ├── energy.py               # Power telemetry endpoints
│       └── vision.py               # Vision synchronization & MJPEG video feed
│
├── frontend/                       # Interactive Web Dashboard
│   ├── index.html                  # Responsive dark-theme dashboard
│   └── package.json
│
├── esp32/                          # Microcontroller Firmware
│   └── smart_lab_controller/
│       └── smart_lab_controller.ino # ESP32 C++ firmware (Relays, Dimmer, PZEM)
│
├── config/                         # Central System Configurations
│   ├── zones.json                  # 9-zone definitions, coordinates, and appliances
│   └── system_config.json          # Master camera, vision, and network configs
│
├── tests/                          # Automated Verification Suite
│   ├── test_zones.py               # 3x3 grid geometry tests
│   ├── test_gesture.py             # Biomechanics & debounce stability tests
│   ├── test_occupancy.py           # Entry, delay timers, and auto OFF tests
│   ├── test_multi_person.py        # Multi-person cross-zone isolation tests
│   ├── test_priority.py            # Same-zone priority & movement isolation tests
│   └── test_backend_api.py         # Flask REST API integration tests
│
├── docs/                           # Comprehensive Engineering Documentation
│   ├── architecture.md             # System architecture & priority rules
│   ├── vision.md                   # Vision algorithms & pose mechanics
│   ├── backend.md                  # Microservice design & state authority
│   ├── frontend.md                 # Web dashboard manual & features
│   ├── esp32.md                    # Hardware pinout & wiring schematics
│   ├── api.md                      # REST API endpoints reference
│   └── deployment.md               # Production deployment guide
│
├── requirements.txt                # Python dependencies
├── README.md                       # Master project overview
├── SETUP.md                        # Quickstart setup instructions
└── .gitignore
```

---

## ⚡ Quick Start

### 1. Run Automated Tests
```powershell
python -m pytest tests -v
```
*(All 21 unit and integration tests will run and pass).*

### 2. Start the Backend API & Web Dashboard
```powershell
python -m backend.app --host 0.0.0.0 --port 5000
```
- Open **`http://localhost:5000/`** in any web browser.

### 3. Launch the Vision System
```powershell
python -m vision.main --camera 0 --sync-backend
```
- The laptop webcam will open with live 3×3 grid lines, skeletons, tracking IDs, and the real-time 9-zone telemetry HUD panel.
- Raise 1 hand to switch a zone to `MANUAL_OFF`.
- Raise 2 hands to switch a zone to `MANUAL_ON`.

---

## 🔌 Hardware Configuration (ESP32 DevKit V1)

| Device | ESP32 Pin | Function | Logic |
| :--- | :--- | :--- | :--- |
| **Relay 1** | **GPIO 22** | Light 1 (Zone 1) | Active HIGH |
| **Relay 2** | **GPIO 23** | Light 2 (Zone 2) | Active HIGH |
| **Xenbrix Dimmer ZVC** | **GPIO 27** | Zero-Cross Interrupt | RISING edge |
| **Xenbrix Dimmer DAT** | **GPIO 26** | Triac Gate Control | Active HIGH pulse |
| **PZEM-004T RX** | **GPIO 25** | Connects to PZEM TX | Hardware Serial2 |
| **PZEM-004T TX** | **GPIO 33** | Connects to PZEM RX | Hardware Serial2 |

---

## 🛡️ Safety Notice
**Do NOT connect exposed AC mains wiring directly to breadboards.** Always use proper optocoupled relays rated for 10A/250VAC, appropriate inline fuses, and an electrically isolated enclosure. Verify all control logic using low-voltage LEDs or simulation mode prior to physical mains integration.
