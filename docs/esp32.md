# Smart Lab Automation - ESP32 Firmware & Hardware Interface

## 1. Hardware Architecture & Pin Assignments

| Peripheral | ESP32 Pin | Description | Logic / Protocol |
| :--- | :--- | :--- | :--- |
| **Relay 1** | **GPIO 22** | Light Output 1 | Active HIGH (`HIGH = ON`, `LOW = OFF`) |
| **Relay 2** | **GPIO 23** | Light Output 2 | Active HIGH (`HIGH = ON`, `LOW = OFF`) |
| **Xenbrix Dimmer ZVC** | **GPIO 27** | Zero-Crossing Detection | Interrupt on `RISING` edge |
| **Xenbrix Dimmer DAT** | **GPIO 26** | Triac Gate Pulse | Active HIGH pulse |
| **PZEM-004T RX** | **GPIO 25** | Connects to PZEM TX | Hardware Serial2 (9600 baud, 8N1) |
| **PZEM-004T TX** | **GPIO 33** | Connects to PZEM RX | Hardware Serial2 (9600 baud, 8N1) |

## 2. Firmware Location
`esp32/smart_lab_controller/smart_lab_controller.ino`

## 3. Communication Protocols

### 3.1 REST API (WiFi HTTP Port 80)
- `GET /api/status`: Returns device health, relay states, and dimmer speed.
- `POST /api/relay/1/on`: Turns Relay 1 ON.
- `POST /api/relay/1/off`: Turns Relay 1 OFF.
- `POST /api/relay/2/on`: Turns Relay 2 ON.
- `POST /api/relay/2/off`: Turns Relay 2 OFF.
- `POST /api/dimmer/1/speed`: Payload `{"speed": 75}` (0–100%).
- `GET /api/energy`: Returns PZEM-004T Modbus telemetry (Voltage, Current, Power, Energy, Frequency, PF).

### 3.2 USB Serial CLI (115200 Baud)
For bench testing via Arduino IDE Serial Monitor or USB terminal:
- `LIGHT 1 ON` / `LIGHT 1 OFF`
- `LIGHT 2 ON` / `LIGHT 2 OFF`
- `FAN 1 ON` / `FAN 1 OFF`
- `FAN 1 SPEED 75`
- `STATUS`
- `ENERGY`

## 4. Electrical Safety Guidelines (CRITICAL)
- **NO BREADBOARDS FOR MAINS**: Never run 110V/230V AC lines on breadboards.
- **ISOLATION**: All relays must have optocoupler isolation between ESP32 3.3V logic and AC switching contacts.
- **PROPER RATINGS**: Use relays rated for at least 10A @ 250V AC.
- **FUSING**: Install appropriately sized quick-blow inline fuses for all switched AC loads.
- **GROUNDING & ENCLOSURE**: House all mains wiring in a certified, fire-resistant, non-conductive enclosure with ground wire securely connected to all metal equipment frames.
- **INITIAL BENCH TESTING**: Test all code using low-voltage DC LEDs connected to GPIO 22 and 23 before connecting any AC mains power.
