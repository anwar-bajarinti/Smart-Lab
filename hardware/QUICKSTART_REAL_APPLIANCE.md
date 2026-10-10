# SMART LAB AUTOMATION — DIRECT CAMERA & REAL APPLIANCE CONTROL

This guide covers the **dedicated Core Camera $\rightarrow$ Zone $\rightarrow$ Gesture $\rightarrow$ ESP32 Real Relay** system.
All secondary features (PZEM, cloud, website, fan speed, etc.) have been bypassed to prioritize your real-time physical appliance switching.

---

## 1. Physical Hardware Wiring (ESP32 DevKit V1)

| Peripheral | ESP32 Pin | Logic / Behavior | Appliance Function |
| :--- | :--- | :--- | :--- |
| **Relay 1** | **GPIO 22** | **Active HIGH** (`HIGH = ON`, `LOW = OFF`) | **REAL LIGHT 1** (Controls AC Mains Line) |
| **Relay 2** | **GPIO 23** | **Active HIGH** (`HIGH = ON`, `LOW = OFF`) | **REAL LIGHT 2** (Controls AC Mains Line) |
| **Status LED** | **GPIO 2** | **Blinks 15ms on command** | **Diagnostic LED ONLY** (NOT an appliance/light) |
| **GND** | **GND** | Common ground with Relay Module | Ground reference |
| **VCC** | **5V (VIN)** | 5V supply for Relay Coils | Coil power |
| **USB Cable** | **Laptop USB Port** | Supplies power & 115200 baud serial | High-speed communication |

> **IMPORTANT**: 
> - **GPIO 22** controls **REAL LIGHT 1** through Relay 1.
> - **GPIO 23** controls **REAL LIGHT 2** through Relay 2.
> - **GPIO 2 is NOT an appliance**. It is only the optional onboard ESP32 status LED and is **never** used as a substitute for the lights.

---

## 2. Dedicated ESP32 Firmware

The dedicated firmware is located at:
```
E:\Smart-Lab\esp32\smart_lab_relay_controller\smart_lab_relay_controller.ino
```

It is compiled and flashed to the ESP32 on **COM4** at **115200 baud**.
When it starts up, it announces:
```
==================================================
 SMART LAB - ESP32 DUAL RELAY CONTROLLER READY
 Relay 1 (REAL LIGHT 1): GPIO 22 (Active HIGH)
 Relay 2 (REAL LIGHT 2): GPIO 23 (Active HIGH)
 Status LED            : GPIO 2  (Status only - NOT a light)
 Default State         : BOTH RELAYS OFF
==================================================
```

---

## 3. Test the Physical Relays & Real AC Lights

Before running the full computer vision system, test the physical relays and lamps using the dedicated hardware test tool:

### Automated Relay Cycle Test:
```powershell
python test_physical_relays.py --port COM4
```
This script runs a complete verification sequence:
1. Safely switches **Relay 1 (GPIO 22) ON for 2.5 seconds** $\rightarrow$ Listen for the relay click; Real Light 1 illuminates $\rightarrow$ turns OFF.
2. Safely switches **Relay 2 (GPIO 23) ON for 2.5 seconds** $\rightarrow$ Listen for the relay click; Real Light 2 illuminates $\rightarrow$ turns OFF.
3. Safely switches **BOTH Relays (GPIO 22 & 23) ON for 3.0 seconds** $\rightarrow$ Both Real Lights illuminate $\rightarrow$ turns both OFF.

### Interactive Toggle Console:
```powershell
python test_physical_relays.py --port COM4 --interactive
```
Allows manual keyboard toggling (`1` for Light 1, `2` for Light 2, `on`, `off`, `s` for status) to inspect physical bulb operation.

---

## 4. Configurable Zone-to-Relay Mapping

The mapping between physical lights and laboratory zones is in:
```
E:\Smart-Lab\config\relay_mapping.json
```
Default configuration:
- **Real Light 1 (Relay 1 | GPIO 22)** $\longleftrightarrow$ **Zone Z2** (Top-Center)
- **Real Light 2 (Relay 2 | GPIO 23)** $\longleftrightarrow$ **Zone Z8** (Bottom-Center)

---

## 5. Run the Vision System & Real Appliance Control

In PowerShell / Terminal:
```powershell
cd E:\Smart-Lab
python -m vision.main --camera 0 --port COM4
```

### What Happens:
1. Opens your camera.
2. Initializes YOLOv8-Pose with keypoint tracking.
3. Establishes a direct high-speed serial link to the ESP32 on **COM4**.
4. Displays the live video window with:
   - 3×3 grid lines ($Z_1$ through $Z_9$)
   - Detected body skeleton, bounding box, and floor contact point (feet)
   - Real-time 9-zone status HUD showing live relay states:
     - `Z2 [R1] | L:ON/OFF`
     - `Z8 [R2] | L:ON/OFF`

---

## 6. Live Gesture & Movement Testing Scenarios

| Scenario | What You Do in Camera View | Physical Relay & Real Light Action |
| :--- | :--- | :--- |
| **1. Enters Zone Z2** | Walk / position feet in top-center zone (Z2) | **Relay 1 (GPIO 22) clicks ON** $\rightarrow$ **Real Light 1 turns ON** (`AUTO`). |
| **2. Remains in Z2** | Continue standing in Z2 with arms down | **Real Light 1 stays ON**. |
| **3. One Hand in Z2** | Raise **ONE hand** above shoulder for $\ge 0.8$s | **Relay 1 clicks OFF** $\rightarrow$ **Real Light 1 turns OFF** (`MANUAL_OFF`). Stays OFF while standing. |
| **4. Two Hands in Z2** | Raise **TWO hands** above shoulders for $\ge 0.8$s | **Relay 1 clicks ON** $\rightarrow$ **Real Light 1 turns ON** (`MANUAL_ON`). Overrides manual off. |
| **5. Leaves Zone Z2** | Walk out of zone Z2 | System waits **2.5 seconds** (grace period). If empty, **Relay 1 clicks OFF** $\rightarrow$ **Real Light 1 turns OFF**. |
| **6. Enters Zone Z8** | Walk / position feet in bottom-center zone (Z8) | **Relay 2 (GPIO 23) clicks ON** $\rightarrow$ **Real Light 2 turns ON**. |
| **7. Multi-Person** | Person 1 in Z2 raises 1 hand; Person 2 in Z8 raises 2 hands | **Real Light 1 turns OFF**, **Real Light 2 turns ON**. Complete independence; zero cross-zone interference. |
| **8. Move Z2 $\rightarrow$ Z8** | Set MANUAL_OFF in Z2, then walk to Z8 | Override resets to `AUTO` in Z8 (Real Light 2 turns ON); Z2 becomes empty and turns OFF after 2.5s. |

---

## 7. Automated Pipeline Test Suite
To verify the entire vision-to-relay logic:
```powershell
python -m pytest tests/test_core_camera_relay_pipeline.py -v
```
All 7 core real-time scenarios pass in $< 1$ second.
