# Smart Lab Automation - REST API Reference

Base URL: `http://localhost:5000`

---

### 1. System Status
#### `GET /api/status`
Returns general system operational health, total active lights, fans, and hardware link status.

**Response (200 OK):**
```json
{
  "success": true,
  "system": {
    "name": "SMART LAB AUTOMATION SYSTEM",
    "version": "1.0.0",
    "status": "OPERATIONAL"
  },
  "summary": {
    "total_zones": 9,
    "occupied_zones": 2,
    "lights_active": 2,
    "fans_active": 2,
    "manual_overrides": 1,
    "esp32_connected": false,
    "mock_hardware_mode": true,
    "timestamp": 1774501234.56
  }
}
```

---

### 2. Zones Telemetry
#### `GET /api/zones`
Returns the status of all 9 zones.

**Response (200 OK):**
```json
{
  "success": true,
  "zones": [
    {
      "zone_id": "Z1",
      "name": "Workstation Area 1",
      "row": 0,
      "col": 0,
      "occupied": false,
      "occupancy_state": "EMPTY",
      "light_state": "OFF",
      "fan_state": "OFF",
      "fan_speed": 0,
      "mode": "AUTO",
      "manual_override": false,
      "occupant_count": 0,
      "occupant_ids": []
    }
  ]
}
```

#### `GET /api/zones/{zone_id}`
Returns details for a single zone (e.g. `Z5`).

---

### 3. Light Control
#### `POST /api/zones/{zone_id}/light/on`
Forces the zone light to turn ON and sets mode to `MANUAL_ON`.

#### `POST /api/zones/{zone_id}/light/off`
Forces the zone light to turn OFF and sets mode to `MANUAL_OFF`.

**Response (200 OK):**
```json
{
  "success": true,
  "zone_id": "Z5",
  "light_state": "ON",
  "mode": "MANUAL_ON",
  "source": "api",
  "hardware_result": { ... }
}
```

---

### 4. Fan Control
#### `POST /api/zones/{zone_id}/fan/on`
Body: `{"speed": 75}` (optional, defaults to 70%).

#### `POST /api/zones/{zone_id}/fan/off`
Turns the fan OFF.

#### `POST /api/zones/{zone_id}/fan/speed`
Body: `{"speed": 50}` (0 to 100%).

---

### 5. Energy Telemetry
#### `GET /api/energy`
Returns live power data from PZEM-004T.

**Response (200 OK):**
```json
{
  "success": true,
  "metrics": {
    "voltage": 230.2,
    "current": 0.85,
    "power": 195.6,
    "energy": 4.32,
    "frequency": 50.0,
    "power_factor": 0.98,
    "is_live_hardware": false,
    "status": "DEVELOPMENT_SIMULATION_MODE"
  }
}
```

---

### 6. Vision Pipeline
#### `POST /api/vision/sync`
Called by the vision system to synchronize detected occupants, zones, and camera FPS.

#### `GET /api/vision/feed`
Live MJPEG video stream with bounding boxes and zone overlay for browser `<img src="...">`.
