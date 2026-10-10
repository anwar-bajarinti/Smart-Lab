# SMART LAB AUTOMATION — INTEGRATION API SPECIFICATION
> **Document for Website Integration**  
> **Module Developer:** Anwar & Smart Lab Team  
> **Audience:** Frontend / Main Website Developer  
> **Base URL:** `http://<SMART_LAB_IP>:5000` (e.g., `http://localhost:5000`)

---

## 1. Overview for the Website Developer

This API provides real-time access to the **Smart Lab Automation System**.  
The backend runs autonomously using a **single laptop camera capture** to execute computer vision AI tracking (multi-person, 3×3 zone assignment, biomechanical hand gesture recognition) and switches physical relays connected to an **ESP32 microcontroller**. It also monitors AC electrical load using a **PZEM-004T AC Energy Sensor**.

Your main website needs only to consume these endpoints:
1. **Live CCTV Stream:** Normal, clean video stream of the laboratory (no AI boxes, no skeletons, no grids).
2. **Master Lab Status:** Real-time data on occupants, 3×3 zones, appliance states, ESP32 status, and electrical energy.

---

## 2. API Endpoints Quick Reference

| Endpoint | Method | Format | Purpose |
| :--- | :--- | :--- | :--- |
| **`/api/cctv/stream`** | `GET` | MJPEG (`multipart/x-mixed-replace`) | Clean live CCTV video stream |
| **`/api/lab/status`** | `GET` | JSON | Master automation, zone, relay & PZEM telemetry |
| **`/api/energy`** | `GET` | JSON | Dedicated electrical load telemetry |
| **`/api/zones`** | `GET` | JSON | Detailed 9-zone state specifications |
| **`/api/zones/<ZID>/light/on`** | `POST` | JSON | Web manual override: turn zone light ON |
| **`/api/zones/<ZID>/light/off`** | `POST` | JSON | Web manual override: turn zone light OFF |

---

## 3. Endpoint 1: Live CCTV Camera Stream

### `GET /api/cctv/stream`
Provides a clean, continuous CCTV-style video stream.

- **Clean Video Guarantee:** Contains **NO** 3×3 grid lines, **NO** bounding boxes, **NO** skeletons, **NO** IDs, and **NO** gesture labels.
- **Single Hardware Capture:** Uses the same camera sensor that drives the AI automation pipeline with zero duplicate camera locks.

### HTML Integration Example:
```html
<!-- Display live CCTV video in any browser without third-party plugins -->
<div class="cctv-container">
  <h3>Laboratory Security Camera 01</h3>
  <img 
    src="http://192.168.1.100:5000/api/cctv/stream" 
    alt="Smart Lab Live CCTV Feed" 
    style="width: 100%; max-width: 1280px; border-radius: 8px;"
  />
</div>
```

---

## 4. Endpoint 2: Master Laboratory Status

### `GET /api/lab/status`
The **single master endpoint** that provides the complete state of the laboratory. Poll this endpoint every **500ms to 1000ms** to update your website UI.

### Example JSON Response:
```json
{
  "camera": {
    "online": true,
    "fps": 29.8,
    "cctv_stream_url": "/api/cctv/stream"
  },

  "people_count": 2,

  "people": [
    {
      "id": 1,
      "zone": "Z2",
      "hands": 0,
      "mode": "AUTO",
      "gesture": "NONE",
      "position": [624.5, 412.0]
    },
    {
      "id": 2,
      "zone": "Z8",
      "hands": 1,
      "mode": "MANUAL_OFF",
      "gesture": "ONE_HAND_RAISED",
      "position": [618.0, 785.5]
    }
  ],

  "zones": {
    "Z1": { "zone": "Z1", "occupied": false, "occupant_count": 0, "device": null, "state": "OFF", "mode": "AUTO", "vacancy_timer_active": false, "vacancy_remaining_seconds": 0.0 },
    "Z2": { "zone": "Z2", "occupied": true,  "occupant_count": 1, "device": "Light 1", "state": "ON", "mode": "AUTO", "vacancy_timer_active": false, "vacancy_remaining_seconds": 0.0 },
    "Z3": { "zone": "Z3", "occupied": false, "occupant_count": 0, "device": null, "state": "OFF", "mode": "AUTO", "vacancy_timer_active": false, "vacancy_remaining_seconds": 0.0 },
    "Z4": { "zone": "Z4", "occupied": false, "occupant_count": 0, "device": null, "state": "OFF", "mode": "AUTO", "vacancy_timer_active": false, "vacancy_remaining_seconds": 0.0 },
    "Z5": { "zone": "Z5", "occupied": false, "occupant_count": 0, "device": null, "state": "OFF", "mode": "AUTO", "vacancy_timer_active": false, "vacancy_remaining_seconds": 0.0 },
    "Z6": { "zone": "Z6", "occupied": false, "occupant_count": 0, "device": null, "state": "OFF", "mode": "AUTO", "vacancy_timer_active": false, "vacancy_remaining_seconds": 0.0 },
    "Z7": { "zone": "Z7", "occupied": false, "occupant_count": 0, "device": null, "state": "OFF", "mode": "AUTO", "vacancy_timer_active": false, "vacancy_remaining_seconds": 0.0 },
    "Z8": { "zone": "Z8", "occupied": true,  "occupant_count": 1, "device": "Light 2", "state": "OFF", "mode": "MANUAL_OFF", "vacancy_timer_active": false, "vacancy_remaining_seconds": 0.0 },
    "Z9": { "zone": "Z9", "occupied": false, "occupant_count": 0, "device": null, "state": "OFF", "mode": "AUTO", "vacancy_timer_active": false, "vacancy_remaining_seconds": 0.0 }
  },

  "appliances": {
    "light1": "ON",
    "light2": "OFF"
  },

  "esp32": {
    "online": true,
    "port": "COM4",
    "relay1": "ON",
    "relay2": "OFF"
  },

  "pzem": {
    "measured_device": "Light 1",
    "measured_zone": "Z2",
    "voltage": 231.8,
    "current": 0.42,
    "power": 96.5,
    "energy": 1.24,
    "frequency": 50.0,
    "power_factor": 0.96,
    "valid": true,
    "status": "ONLINE"
  },

  "timestamp": 1728302145.123
}
```

### Response Field Breakdown:

#### 1. `camera`
- `online` *(boolean)*: `true` if webcam is capturing frames.
- `fps` *(float)*: Current capture/processing frame rate.
- `cctv_stream_url` *(string)*: Relative URL for clean stream (`/api/cctv/stream`).

#### 2. `people` & `people_count`
- `people_count` *(int)*: Total occupants detected in the laboratory.
- `people` *(array)*:
  - `id` *(int)*: Unique tracking ID.
  - `zone` *(string|null)*: Current physical zone (`"Z1"` .. `"Z9"`).
  - `hands` *(int)*: Stable raised hands (`0`, `1`, or `2`).
  - `mode` *(string)*:
    - `"AUTO"`: Person standing normally (0 hands).
    - `"MANUAL_OFF"`: Person raised 1 hand for $\ge 0.8$s. Light switched OFF and remains OFF while standing.
    - `"MANUAL_ON"`: Person raised 2 hands for $\ge 0.8$s. Light switched ON.

#### 3. `zones` (3×3 Physical Grid & 10-Second Vacancy Delay)
Contains keys `"Z1"` through `"Z9"`:
$$\begin{matrix} Z_1 & Z_2 & Z_3 \\ Z_4 & Z_5 & Z_6 \\ Z_7 & Z_8 & Z_9 \end{matrix}$$
- `zone` *(string)*: Zone identifier (e.g. `"Z2"`).
- `occupied` *(boolean)*: Whether anyone's feet are currently located in this zone.
- `occupant_count` *(int)*: Number of occupants in this zone.
- `device` *(string|null)*:
  - `"Light 1"` for **$Z_2$**
  - `"Light 2"` for **$Z_8$**
  - `null` for other zones.
- `state` *(string)*: `"ON"` or `"OFF"`.
- `mode` *(string)*: Zone operating mode (`"AUTO"`, `"MANUAL_OFF"`, `"MANUAL_ON"`).
- `vacancy_timer_active` *(boolean)*: `true` when a person leaves the zone and the non-blocking 10.0-second delay is counting down while light remains ON.
- `vacancy_remaining_seconds` *(float)*: Real-time remaining seconds before turn-off (e.g. `8.7`, `5.0`, `0.0`).

> **10-Second Real-Time Vacancy Delay Rules (`VACANCY_GRACE_PERIOD = 10.0s`)**:
> 1. **Entry**: Person enters $\to$ `occupied: true` $\to$ Light turns ON immediately (`GPIO22`/`GPIO23` HIGH).
> 2. **Departure**: Person leaves $\to$ `occupied: false`, but light **REMAINS ON** (`state: "ON"`), non-blocking 10-second timer starts (`vacancy_timer_active: true`).
> 3. **Re-entry (< 10s)**: If anyone re-enters within 10 seconds $\to$ timer cancelled immediately, light stays ON continuously without toggling.
> 4. **10s Complete Empty**: If zone remains empty for the full 10.0 seconds $\to$ light turns OFF (`state: "OFF"`), physical relay drops LOW, and zone resets to `AUTO`.
> 5. **Multi-person**: Timer is based on zone occupancy (0 people in zone), not individual disappearance. If Person 1 leaves but Person 2 remains, no timer starts.

#### 4. `appliances`
- `light1`: `"ON"` / `"OFF"` (Controls physical Relay 1 on ESP32 GPIO 22).
- `light2`: `"ON"` / `"OFF"` (Controls physical Relay 2 on ESP32 GPIO 23).

#### 5. `esp32`
- `online` *(boolean)*: Whether the serial USB connection or WiFi link to ESP32 DevKit is active.
- `port` *(string)*: Connected COM port (e.g. `"COM4"`).
- `relay1`: Physical relay 1 contact state (`"ON"` / `"OFF"`).
- `relay2`: Physical relay 2 contact state (`"ON"` / `"OFF"`).

#### 6. `pzem` (Physical Load AC Power Telemetry)
> ⚠️ **Important Hardware Detail:**  
> The laboratory currently has **ONE physical PZEM-004T sensor**.  
> The Current Transformer (CT) coil is clamped to **Light 1 in Zone Z2**.  
> Do not render 9 separate energy meters; render one dedicated meter clearly labeled with the `measured_device` and `measured_zone` fields.
- `measured_device`: Name of monitored device (e.g. `"Light 1"`).
- `measured_zone`: Zone containing the monitored load (e.g. `"Z2"`).
- `voltage`: RMS AC Line Voltage in Volts (e.g. `231.8` V).
- `current`: AC Current in Amperes (e.g. `0.42` A).
- `power`: Active Power in Watts (e.g. `96.5` W).
- `energy`: Accumulated Energy in Kilowatt-hours (e.g. `1.24` kWh).
- `frequency`: AC Mains frequency in Hertz (e.g. `50.0` Hz).
- `power_factor`: AC Power Factor (`0.00` to `1.00`).
- `valid`: `true` if receiving valid electrical readings; `false` if AC load disconnected or sensor offline.

---

## 5. JavaScript Integration Example (Frontend)

```javascript
// Poll the Master API every 500ms to update website widgets
async function updateSmartLabDashboard() {
  try {
    const res = await fetch('http://localhost:5000/api/lab/status');
    const data = await res.json();

    // 1. Update People Count
    document.getElementById('peopleCount').textContent = data.people_count;

    // 2. Update 3x3 Zones
    for (let i = 1; i <= 9; i++) {
      const zid = 'Z' + i;
      const zone = data.zones[zid];
      if (!zone) continue;

      const zoneCard = document.getElementById('card_' + zid);
      if (zoneCard) {
        zoneCard.classList.toggle('occupied', zone.occupied);
        zoneCard.classList.toggle('light-on', zone.state === 'ON');
        zoneCard.querySelector('.device-name').textContent = zone.device || '-';
        zoneCard.querySelector('.mode-badge').textContent = zone.mode;
      }
    }

    // 3. Update PZEM Energy Card
    if (data.pzem && data.pzem.valid) {
      document.getElementById('pzemDevice').textContent = data.pzem.measured_device;
      document.getElementById('pzemZone').textContent = data.pzem.measured_zone;
      document.getElementById('pzemVoltage').textContent = data.pzem.voltage.toFixed(1) + ' V';
      document.getElementById('pzemCurrent').textContent = data.pzem.current.toFixed(2) + ' A';
      document.getElementById('pzemPower').textContent = data.pzem.power.toFixed(1) + ' W';
      document.getElementById('pzemEnergy').textContent = data.pzem.energy.toFixed(2) + ' kWh';
    } else {
      document.getElementById('pzemStatus').textContent = 'Sensor Standby / No AC Load';
    }

  } catch (err) {
    console.warn('Smart Lab API is currently offline:', err);
  }
}

// Start polling
setInterval(updateSmartLabDashboard, 500);
```

---

## 6. Manual Web Control Endpoints (Optional)

If your website includes manual override buttons:
- **Turn Zone Light ON:**  
  `POST http://localhost:5000/api/zones/Z2/light/on`
- **Turn Zone Light OFF:**  
  `POST http://localhost:5000/api/zones/Z2/light/off`

---

## 7. Hardware Wiring Reference (ESP32 DevKit V1)

| Peripheral | ESP32 GPIO | Logic | Appliance Controlled |
| :--- | :--- | :--- | :--- |
| **Relay 1** | **GPIO 22** | **Active HIGH** (`HIGH = ON`, `LOW = OFF`) | **Light 1** (Zone Z2) |
| **Relay 2** | **GPIO 23** | **Active HIGH** (`HIGH = ON`, `LOW = OFF`) | **Light 2** (Zone Z8) |
| **PZEM-004T TX** | **GPIO 25** | HardwareSerial1 RX | AC Energy Monitor |
| **PZEM-004T RX** | **GPIO 33** | HardwareSerial1 TX | AC Energy Monitor |
| **Status LED** | **GPIO 2** | Diagnostic 15ms pulse | Onboard LED only (NOT an appliance) |
