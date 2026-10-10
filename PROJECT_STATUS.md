# Smart Lab Project Status

## Current Date
2026-10-07

## Current Git Branch
`appliance-control` (tracking `origin/appliance-control`)

---

## Project Architecture
The system operates as a unified, real-time edge automation and monitoring module:
```
Laptop Webcam (30 FPS)
      ↓
YOLOv8-Pose (17 COCO Keypoints)
      ↓
ByteTrack Spatial Tracker (Persistent Tracking IDs)
      ↓
Floor-Contact Localization (Sub-pixel Ankle Midpoint)
      ↓
3×3 Physical Grid Mapping (Z1 through Z9)
      ↓
Biomechanical Gesture Detection (Torso-Normalized Wrist/Shoulder Height)
      ↓
Deterministic Multi-Person Arbitration (MANUAL_ON > MANUAL_OFF > AUTO)
      ↓
Non-Blocking Zone Vacancy Delay (10.0-Second Grace Period)
      ↓
ESP32 Hardware Bridge (COM4 @ 115200 baud)
      ├─ Relay 1 (GPIO 22, Active HIGH) → Real Light 1 (Zone Z2)
      ├─ Relay 2 (GPIO 23, Active HIGH) → Real Light 2 (Zone Z8)
      └─ PZEM-004T v3.0 (GPIO 16 RX / GPIO 17 TX) → AC Electrical Telemetry (Light 1 in Z2)
      ↓
Flask Master Backend & Clean CCTV Video Distributor (Port 5000)
      ├─ GET /api/cctv/stream → Clean MJPEG video stream (raw, unannotated)
      ├─ GET /api/lab/status  → Unified JSON status for external website integration
      └─ GET /                → Local test & diagnostic dashboard (2-page UI)
```

---

## Current Working Features
1. **Automated Person Detection & Pose Tracking**: Detects multiple lab occupants at ~30 FPS on CPU using YOLOv8n-pose and ByteTrack.
2. **Floor-Contact 3×3 Localization**: Identifies occupant zone based on ankle contact points rather than bounding box centers, eliminating perspective errors.
3. **Gesture-Based Appliance Control**:
   - 0 hands raised $\to$ `AUTO` mode (appliances active while occupant present).
   - 1 hand raised for $\ge 0.8$s $\to$ `MANUAL_OFF` mode (appliances turn OFF and stay OFF while occupant remains standing in the zone).
   - 2 hands raised for $\ge 0.8$s $\to$ `MANUAL_ON` mode (appliances turn ON, overriding manual off).
4. **Deterministic Multi-Person Arbitration**: `MANUAL_ON` > `MANUAL_OFF` > `AUTO`. Multiple people in different zones operate with complete isolation.
5. **Real-Time 10-Second Vacancy Delay**: When a zone becomes empty, the light remains ON for a 10.0-second grace period. If someone enters before 10s, the timer is cancelled and the light stays ON. If empty for the full 10s, the light turns OFF, manual override clears, and the zone safely returns to `AUTO`.
6. **Physical ESP32 Dual Relay Switching**: Controls physical AC lights through active-HIGH relays on GPIO 22 and GPIO 23.
7. **PZEM-004T AC Energy Telemetry**: Non-blocking serial telemetry measuring Voltage, Current, Active Power, Energy, Frequency, and Power Factor on Light 1 (Zone Z2).
8. **Clean CCTV Stream Endpoint**: Distributes raw, unannotated video feed at `/api/cctv/stream` without visual bounding boxes or grid lines.
9. **Unified Master Status API**: Real-time snapshot at `/api/lab/status` delivering camera state, people tracking, 3×3 zone states with vacancy timers, appliance states, ESP32 connection, and PZEM metrics.
10. **Two-Page Test Dashboard**: Clean local UI featuring Page 1 (Live CCTV Stream) and Page 2 (Smart Lab Monitoring & 3×3 Grid).
11. **One-Command Automated Verification**: Unified runner (`python run_full_test.py` or `.\run_full_test.ps1`) executing all 12 system verification stages.
12. **One-Command Master Live System Runner**: Single entrypoint (`python run_smart_lab.py`) coordinating webcam, YOLOv8 pose, ByteTrack, 3×3 zones, 10s vacancy delay, ESP32 relays (COM4), PZEM telemetry, Flask REST API, clean CCTV MJPEG distributor, and local dashboard with unconditional safety shutdown.

---

## Camera System
- **Input Source**: Laptop webcam (Device index 0).
- **Backend API**: OpenCV `cv2.CAP_DSHOW` (DirectShow on Windows for zero-latency capture).
- **Resolution**: $1280 \times 720$ pixels @ 30 FPS.
- **Capture Model**: Single-capture architecture (`vision/camera.py`). A single thread reads the hardware camera once and distributes identical frames to the vision AI engine and the clean CCTV HTTP encoder.

---

## Person Detection
- **Model**: `yolov8n-pose.pt` (Ultralytics YOLOv8 Nano Pose).
- **Inference Hardware**: CPU (Intel OpenVINO / ONNX runtime compatible).
- **Keypoints**: Standard 17 COCO human skeleton keypoints with per-keypoint confidence scores.
- **Inference Latency**: ~28–33 ms per frame on standard laptop CPU.

---

## Person Tracking
- **Algorithm**: ByteTrack tracker integrated via Ultralytics.
- **Configuration**: Track threshold 0.5, track buffer 30 frames, match threshold 0.8.
- **Persistence**: Assigns stable integer tracking IDs (`PersonState`) surviving temporary brief occlusions.

---

## 3x3 Zone System
- **Configuration File**: `config/zones.json`.
- **Layout**:
  $$\begin{matrix} Z_1 & Z_2 & Z_3 \\ Z_4 & Z_5 & Z_6 \\ Z_7 & Z_8 & Z_9 \end{matrix}$$
- **Mapping**:
  - $Z_1$: Top-Left
  - $Z_2$: Top-Center (**Primary control zone for Light 1 / Relay 1**)
  - $Z_3$: Top-Right
  - $Z_4$: Middle-Left
  - $Z_5$: Center
  - $Z_6$: Middle-Right
  - $Z_7$: Bottom-Left
  - $Z_8$: Bottom-Center (**Primary control zone for Light 2 / Relay 2**)
  - $Z_9$: Bottom-Right
- **Localization Method**: Sub-pixel midpoint between Left Ankle (keypoint 15) and Right Ankle (keypoint 16). Fallback to bottom-center of bounding box if ankles occluded.

---

## Gesture System
- **Module**: `vision/gesture_detector.py`.
- **Detection Algorithm**:
  - Biomechanically normalized against torso height ($y_{\text{hip}} - y_{\text{shoulder}}$) to adapt across varying distances from camera.
  - Hand raised: Wrist keypoint positioned higher than shoulder keypoint by at least 5% of torso height with elbow flex angle verified.
- **Debounce**: 0.8-second temporal stability filter (`gesture_stability_sec = 0.8`) prevents false triggers from transitory arm movements.
- **States**:
  - `0 Hands Raised` $\to$ `AUTO`
  - `1 Hand Raised` $\to$ `MANUAL_OFF` (Persists even when hands are lowered until zone becomes empty for 10s)
  - `2 Hands Raised` $\to$ `MANUAL_ON` (Overrides prior manual off)

---

## Occupancy Logic
- **Module**: `vision/occupancy_manager.py` and `vision/zone_state.py`.
- **Multi-Person Assignment**: Active occupants grouped by zone ID.
- **State Arbitration**:
  - If any occupant in zone signals `MANUAL_ON` $\to$ Zone state is `MANUAL_ON` (Light ON).
  - Else if any occupant signals `MANUAL_OFF` $\to$ Zone state is `MANUAL_OFF` (Light OFF).
  - Else if occupants are present $\to$ Zone state is `AUTO` (Light ON).
- **Cross-Zone Independence**: A gesture performed in $Z_2$ strictly controls Light 1 and never affects $Z_8$ or Light 2. Moving between zones resets the person's mode to `AUTO` upon arrival in the new zone.

---

## 10-Second Vacancy Delay
- **Constant**: `VACANCY_GRACE_PERIOD = 10.0` seconds.
- **Non-Blocking Operation**:
  - When the last person departs a zone, `occupied` becomes `false` and `occupancy_state` transitions to `"EMPTY"`.
  - The physical light remains **ON** and `vacancy_timer_active` becomes `true`.
  - Timestamp elapsed check: `remaining = 10.0 - (current_time - vacancy_start_time)`.
  - **Re-entry (< 10.0s)**: Timer cancelled immediately (`vacancy_timer_active = false`), light stays ON continuously without relay chatter.
  - **Expiry ( $\ge 10.0$s)**: Relay command sent (`R1 OFF` or `R2 OFF`), physical relay opens, manual override clears, zone resets to `AUTO`.
- **Multi-Person Rule**: Zone-occupancy based. If Person 1 leaves while Person 2 remains in the zone, no timer starts.

---

## Physical Hardware
- **Microcontroller**: ESP32 DevKit V1 (30-pin, CP2102 USB-to-UART bridge).
- **Serial Connection**: `COM4` @ 115200 baud, 8N1.
- **Relay Module**: 2-Channel 5V Electromechanical Relay Board with optocoupler isolation.
- **AC Load**: AC mains incandescent/LED laboratory lamps connected to relay Normally Open (NO) contacts.
- **Status LED**: ESP32 onboard GPIO 2 LED pulses briefly (15ms) on serial command reception for visual communication diagnostics only; it is never used as an appliance light.

---

## GPIO Mapping
| Peripheral | ESP32 GPIO | Logic Level | Hardware Target | Primary Zone | Secondary Zones |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Relay 1** | **GPIO 22** | **Active HIGH** (`1=ON, 0=OFF`) | **Real Light 1** | **Z2** | Z1, Z4, Z7 |
| **Relay 2** | **GPIO 23** | **Active HIGH** (`1=ON, 0=OFF`) | **Real Light 2** | **Z8** | Z3, Z6, Z9 |
| **PZEM RX** | **GPIO 16** | Serial TTL (3.3V) | PZEM-004T TX | Z2 (Light 1) | N/A |
| **PZEM TX** | **GPIO 17** | Serial TTL (3.3V) | PZEM-004T RX | Z2 (Light 1) | N/A |
| **Status LED** | **GPIO 2** | Active HIGH pulse | Onboard RX Flash | N/A | Diagnostic Only |

---

## PZEM
- **Model**: Peacefair PZEM-004T v3.0 AC Multi-function Energy Meter.
- **UART Pins**: ESP32 HardwareSerial 2 (GPIO 16 RX, GPIO 17 TX) @ 9600 baud.
- **Measured Load**: Single physical Current Transformer (CT) clamped exclusively on the AC mains line of **Light 1 (Zone Z2)**.
- **Integration Status**: Fully operational non-blocking polling thread in ESP32 firmware and Python bridge.
- **Telemetry Metrics**:
  - Voltage: ~231–233 V AC
  - Current: ~0.04 A AC (idle) / up to 10 A (active load)
  - Active Power: ~8.1–8.2 W (idle) / dynamic Watts under load
  - Cumulative Energy: kWh
  - Frequency: ~49.8–50.0 Hz
  - Power Factor: 0.96–0.98

---

## ESP32 Firmware
- **Source File**: `esp32/smart_lab_relay_controller/smart_lab_relay_controller.ino`.
- **Protocol**: ASCII newline-delimited command format:
  - `R1 ON\n` $\to$ GPIO 22 HIGH
  - `R1 OFF\n` $\to$ GPIO 22 LOW
  - `R2 ON\n` $\to$ GPIO 23 HIGH
  - `R2 OFF\n` $\to$ GPIO 23 LOW
  - `STATUS\n` $\to$ Returns current relay bitmask
  - `PZEM\n` $\to$ Returns formatted PZEM telemetry block and JSON
- **Safety Defaults**: Both relays default to `LOW` (OFF) on boot, reset, or watchdog timeout.

---

## Vision Application
- **Main Runner**: `python -m vision.main --camera 0 --port COM4`.
- **Modules**:
  - `vision/camera.py`: DirectShow capture thread.
  - `vision/person_detector.py`: YOLOv8-pose inference.
  - `vision/pose_detector.py`: Floor contact localization.
  - `vision/gesture_detector.py`: Biomechanical arm angle analysis.
  - `vision/occupancy_manager.py`: Spatial grouping & arbitration.
  - `vision/zone_state.py`: 10-second non-blocking timer & state machine.
  - `vision/esp32_relay_bridge.py`: Serial port driver & PZEM parser.
  - `vision/controller.py`: Pipeline coordinator & HUD visualization.

---

## Backend API
- **Framework**: Flask / Flask-CORS.
- **Host / Port**: `0.0.0.0:5000`.
- **Service Layer**: `backend/services/lab_service.py` provides thread-safe central state storage.

---

## CCTV Stream
- **Endpoint**: `GET /api/cctv/stream`.
- **Format**: Standard HTTP multipart MJPEG (`multipart/x-mixed-replace; boundary=frame`).
- **Characteristics**: Clean, unannotated video stream. No bounding boxes, skeletons, or zone grid lines. Designed for direct embedding in the user's friend's external website:
  ```html
  <img src="http://<SMART_LAB_IP>:5000/api/cctv/stream" alt="Live CCTV" />
  ```

---

## Dashboard
- **File**: `frontend/index.html`.
- **Access**: `http://localhost:5000/`.
- **UI Architecture**:
  - **Page 1**: Live CCTV view with OSD recording badge, timestamp, and stream URL copy button.
  - **Page 2**: Smart Lab Monitoring view featuring high-level KPI tiles, interactive 3×3 zone grid with live countdown badge (`Turning OFF in: 8.7 s`), ESP32 relay badges, PZEM AC load gauges, and real-time JSON inspector.

---

## API Endpoints
| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/` | Serves the 2-page local dashboard UI |
| `GET` | `/api/cctv/stream` | Clean MJPEG raw camera stream |
| `POST` | `/api/cctv/frame` | Accepts clean JPEG frame pushes from vision pipeline |
| `GET` | `/api/lab/status` | Central state snapshot (Camera, People, Zones, Appliances, ESP32, PZEM) |
| `POST` | `/api/lab/sync` | Ingests real-time vision & telemetry states |
| `GET` | `/api/zones` | Serialized 9-zone array |
| `POST` | `/api/zones/<id>/light` | Manual API override for zone light |
| `POST` | `/api/zones/<id>/fan` | Manual API override for zone fan |
| `GET` | `/api/energy` | Live PZEM electrical telemetry |

---

## Tests
- **Automated Pytest Suite**: 38 tests across 6 modules:
  - `tests/test_occupancy.py`: 10-second vacancy delay, re-entry cancellation, multi-person departure.
  - `tests/test_core_camera_relay_pipeline.py`: Full end-to-end camera $\to$ zone $\to$ gesture $\to$ relay scenarios.
  - `tests/test_gesture.py`: Hand counting and temporal debounce.
  - `tests/test_priority.py`: Priority hierarchy and inter-zone movement isolation.
  - `tests/test_multi_person.py`: Multi-occupant spatial independence.
  - `tests/test_new_cctv_and_lab_api.py`: CCTV stream headers and master status schema.
  - `tests/test_zones.py`: Coordinate clamping and grid boundaries.
  - `tests/test_backend_api.py`: REST routes and device control.
- **Hardware Test**: `hardware_test_vacancy_delay.py` (live physical timing against ESP32 on COM4).
- **Unified Full Test**: `run_full_test.py` / `run_full_test.ps1`.

---

## Latest Test Result
```
SMART LAB AUTOMATION — COMPLETE SYSTEM VERIFICATION
====================================================================
[01/12] Python Environment & Packages            [PASS] (Python 3.13.1 | All core dependencies installed)
[02/12] Automated Test Suite (pytest)            [PASS] (38 passed in 10.07s)
[03/12] 3x3 Physical Zone Matrix                 [PASS] (All 9 zones (Z1..Z9) calibrated; Z2=Top-Center, Z8=Bottom-Center)
[04/12] Person Tracking & Ankle Midpoint         [PASS] (Sub-pixel ankle midpoint floor tracking verified)
[05/12] Biomechanical Gesture Debounce           [PASS] (0 Hands -> AUTO | 1 Hand -> MANUAL_OFF | 2 Hands -> MANUAL_ON)
[06/12] 10-Second Vacancy Delay Logic            [PASS] (10.0s delay confirmed: ON at 5s -> OFF at 10s -> Cancel on re-entry)
[07/12] Relay Mapping Configuration              [PASS] (Relay 1 (GPIO 22) -> Z2 / Light 1 | Relay 2 (GPIO 23) -> Z8 / Light 2)
[08/12] Master Status API (/api/lab/status)      [PASS] (Master status schema valid with live camera, zones, esp32, pzem)
[09/12] Clean CCTV Stream (/api/cctv/stream)     [PASS] (HTTP 200 MJPEG raw stream active (clean, unannotated))
[10/12] Local Test Dashboard UI (HTML)           [PASS] (Dashboard served with 3x3 interactive grid & vacancy countdown)
[11/12] Physical ESP32 & Relays (COM4)           [PASS] (GPIO 22 & GPIO 23 verified)
[12/12] Physical PZEM-004T Telemetry             [PASS] (Sensor responded: 232.8V | 8.1W)
--------------------------------------------------------------------
[SAFETY VERIFIED] Both Relays returned to default safe state (Relay 1: OFF, Relay 2: OFF)
[MANUAL TEST] Physical human movement in front of webcam: `python -m vision.main`
====================================================================
>>> FINAL RESULT: ALL AUTOMATED TESTS PASSED <<<
```

---

## Files Changed in Latest Implementation
- `vision/zone_state.py`: Implemented `VACANCY_GRACE_PERIOD = 10.0`, `vacancy_timer_active`, and non-blocking countdown.
- `vision/occupancy_manager.py`: Updated default leave timeout to `VACANCY_GRACE_PERIOD`.
- `vision/controller.py`: Integrated `VACANCY_GRACE_PERIOD` and vacancy countdown display in OpenCV status HUD.
- `config/relay_mapping.json`: Updated `leave_timeout_sec` to `10.0`.
- `config/system_config.json`: Updated `leave_timeout_sec` to `10.0`.
- `backend/models/schemas.py`: Added vacancy fields to `ZoneInfo`.
- `backend/services/lab_service.py`: Mapped vacancy timer fields into master status payload.
- `frontend/index.html`: Added pulsing vacancy timer countdown pill to zone cards.
- `tests/test_occupancy.py`: Updated tests for 10.0s delay, cancel on re-entry, and multi-person departure.
- `tests/test_core_camera_relay_pipeline.py`: Updated integration pipeline tests for 10.0s timeout.
- `tests/test_priority.py`: Updated inter-zone transition assertions during vacancy grace period.
- `tests/test_new_cctv_and_lab_api.py`: Added master status vacancy delay schema tests.
- `API_DOCUMENTATION.md`: Documented vacancy delay behavior and API response format.
- `run_smart_lab.py`: Master live system orchestrator and one-command runner.
- `run_full_test.py`: Created unified 12-stage system verification runner.
- `run_full_test.ps1`: Created single-command PowerShell wrapper.
- `PROJECT_STATUS.md`: Created permanent project memory and handoff file.
- `TESTING.md`: Created dedicated one-command testing guide.

---

## Current Known Issues
- **CP210x USB Sleep/Re-enumeration State**: If Windows puts the USB hub to sleep or the laptop reboots while the ESP32 is connected, Windows Device Manager can report `Silicon Labs CP210x USB to UART Bridge (COM4)` in `CM_PROB_FAILED_START (Code 10)`. Simply unplugging and replugging the ESP32 USB cable into the laptop re-enumerates the hardware transceiver and restores active serial communication immediately.
- **Port Contention Notice**: If the Arduino IDE Serial Monitor is open on COM4, Python serial scripts will receive `PermissionError (Access is denied)`. Closing the Serial Monitor immediately resolves this.

---

## Next Recommended Step
1. Provide the master API URL (`http://<IP>:5000/api/lab/status`) and CCTV stream URL (`http://<IP>:5000/api/cctv/stream`) to your friend for external website integration.
2. Conduct physical room testing with multiple occupants entering and exiting zones to verify real-world ambient lighting adaptability.

---

## Git Status
- **Current Branch**: `appliance-control`
- **Latest Commit**: Clean working tree, all changes committed and pushed to `origin/appliance-control`.

---

## Important Decisions
1. **Separation of Concerns**: Occupant detection is separated from external website development. The backend exposes standard REST/MJPEG APIs so external websites can consume data without touching the core vision engine.
2. **Zone Occupancy vs Individual Disappearance**: The 10-second timer is bound to zone state rather than person state. A multi-person zone will never trigger a vacancy countdown until all occupants have vacated.
3. **Active-HIGH Relay Logic**: Relays use active-HIGH logic (`GPIO HIGH = ON`, `GPIO LOW = OFF`), ensuring lights are never turned on inadvertently during ESP32 bootloader boot cycles.
4. **Hardware Safety Auto-Reset**: All automated test tools unconditionally pulse relays OFF upon conclusion to prevent lamps from remaining energized after testing.
