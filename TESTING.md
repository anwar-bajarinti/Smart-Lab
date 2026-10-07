# Smart Lab — Testing Guide

## The ONE Command Full System Test

Run this **single command** from PowerShell in the project directory:

```powershell
python run_full_test.py
```

*(Alternatively, you can run the PowerShell wrapper: `.\run_full_test.ps1`)*

---

## What This Command Tests Automatically

The single script executes a complete 12-stage system verification:

| Step | Test Target | Description |
| :--- | :--- | :--- |
| **[01/12]** | **Python Environment** | Validates Python $\ge 3.9$ and core libraries (`cv2`, `ultralytics`, `serial`, `flask`, `pytest`, `numpy`, `requests`). |
| **[02/12]** | **Automated Test Suite** | Runs all 38 pytest tests across occupancy, gestures, zones, priority, CCTV, and backend. |
| **[03/12]** | **3×3 Zone Matrix** | Confirms 9 calibrated zones ($Z_1$..$Z_9$) and coordinate clamping logic ($Z_2$ = Top-Center, $Z_8$ = Bottom-Center). |
| **[04/12]** | **Person Tracking** | Verifies sub-pixel ankle midpoint floor tracking and state persistence. |
| **[05/12]** | **Gesture Debounce** | Verifies 0 hands $\to$ `AUTO`, 1 hand $\to$ `MANUAL_OFF`, 2 hands $\to$ `MANUAL_ON` with 0.8s stability filter. |
| **[06/12]** | **10-Second Vacancy Delay** | Verifies non-blocking countdown: light stays ON at 5s, turns OFF at 10s, and cancels immediately on re-entry. |
| **[07/12]** | **Relay Mapping Config** | Checks `config/relay_mapping.json`: GPIO 22 $\to$ Light 1 ($Z_2$) & GPIO 23 $\to$ Light 2 ($Z_8$). |
| **[08/12]** | **Backend Master API** | Validates `GET /api/lab/status` JSON schema including vacancy timer fields. |
| **[09/12]** | **Clean CCTV Stream** | Tests `GET /api/cctv/stream` HTTP 200 MJPEG raw stream headers. |
| **[10/12]** | **Dashboard Serving** | Verifies `frontend/index.html` serves the interactive 3×3 grid and vacancy countdown badge. |
| **[11/12]** | **Physical ESP32 & Relays** | Connects to `COM4`, verifies communication, pulses Relay 1 and Relay 2, and checks firmware ACK. |
| **[12/12]** | **Physical PZEM Telemetry** | Polls live PZEM sensor over serial, reading Voltage, Current, Power, Frequency, and Power Factor. |

---

## Hardware Requirements & Prerequisites

1. **ESP32 DevKit V1**:
   - Plugged into your laptop via USB cable.
   - Connected as **`COM4`** (Silicon Labs CP210x USB to UART Bridge).
   - Baud rate: **115200**.
2. **Serial Port Exclusivity**:
   - **IMPORTANT**: Close the **Arduino IDE Serial Monitor** before running the test script. If open, Windows will block the port with `PermissionError (Access is denied)`.
3. **PZEM-004T v3.0 Sensor**:
   - Connected to ESP32 HardwareSerial 2: `GPIO 16 (RX)` and `GPIO 17 (TX)`.
   - Current Transformer (CT) clamped exclusively on **Light 1 (Zone Z2)** AC mains phase line.
4. **Relay Module (Active HIGH)**:
   - Relay 1 IN $\to$ **GPIO 22**
   - Relay 2 IN $\to$ **GPIO 23**
   - VCC $\to$ 5V (VIN), GND $\to$ Common GND

---

## Expected Output

```
====================================================================
 SMART LAB AUTOMATION — COMPLETE SYSTEM VERIFICATION
====================================================================

Executing complete test suite in single automated run...

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

## Hardware Safety Guarantee

At the end of testing, the script automatically sends:
```
R1 OFF
R2 OFF
```
Both physical relays are unconditionally left in the **de-energized state (OFF)** with GPIO pins pulled **LOW**. No lights will remain on after the test completes.

---

## What Requires Physical Observation (Manual Testing)

If you wish to test live visual movement in front of the camera:
```powershell
python -m vision.main --camera 0 --port COM4
```
- Step into top-center area (**Z2**) $\to$ Real Relay 1 clicks ON immediately.
- Raise **1 hand** for $\ge 0.8$s $\to$ Real Relay 1 clicks OFF (`MANUAL_OFF`).
- Raise **2 hands** for $\ge 0.8$s $\to$ Real Relay 1 clicks ON (`MANUAL_ON`).
- Step completely out of Z2 $\to$ Zone shows `EMPTY`, countdown starts `Turning OFF in: 9.9s`, light stays ON.
- Step back in at 5s $\to$ Countdown cancels, light remains ON without clicking.
- Step out and wait full 10s $\to$ Relay clicks OFF, Light 1 turns OFF.
