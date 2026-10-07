# Hardware & IoT Integration Layer

This directory represents the physical hardware and IoT integration boundary for the Smart Lab Management System.

---

## Current Architecture

At present, hardware interaction is orchestrated via the client-side communication service located in:

```
frontend/src/services/esp32/esp32Service.js
```

### Distinction of Roles:
1. **Frontend Hardware Communication Service (`frontend/src/services/esp32/`)**:
   - Manages WebSocket/HTTP connections between the React application and networked microcontrollers.
   - Monitors device heartbeats, connection telemetry, and online/offline status.
   - Dispatches remote actuator commands (e.g., RFID badge readers, relay triggers, door unlock latches).
   - Syncs hardware sensor feeds with the application state.

2. **Hardware Firmware (`hardware/`)**:
   - Firmware for physical microcontrollers (ESP32-WROOM-32, ESP32-CAM, Arduino) is developed, flashed, and maintained on dedicated microcontroller toolchains (PlatformIO / Arduino IDE).
   - This directory is designated for storing firmware source code, pinout schematics, wiring diagrams, and flashing instructions when imported into the repository.

---

## Supported Protocols & Endpoints

ESP32 edge nodes communicate with the system using lightweight JSON payloads:

- **Heartbeat Ping**: `GET /api/device/ping` (every 10s)
- **Badge Swipe Event**: `POST /api/device/rfid` (sends UID to trigger auto-login / lab entry)
- **Actuator Trigger**: `POST /api/device/unlock` (energizes solenoid relay for verified entries)
