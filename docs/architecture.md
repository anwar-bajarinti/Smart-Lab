# Smart Lab Automation System - System Architecture

```
+----------------------------------------------------------------------------------+
|                            LAPTOP WEBCAM / VISION SENSOR                         |
|   - 1280x720 30FPS Color Feed                                                    |
|   - Mirrored Perspective                                                         |
+----------------------------------------+-----------------------------------------+
                                         |
                                         v
+----------------------------------------------------------------------------------+
|                              VISION PIPELINE CORE                                |
|                                                                                  |
|  1. Person & Pose Detection (YOLOv8-Pose)                                        |
|     - Bounding boxes + 17 COCO Keypoints (Shoulders, Elbows, Wrists, Ankles)     |
|     - ByteTrack Multi-Person Persistent Tracking IDs                             |
|                                                                                  |
|  2. Floor Localization (PoseDetector)                                            |
|     - Midpoint between ankles (Primary)                                          |
|     - Bottom-Center of Bounding Box (Fallback)                                   |
|                                                                                  |
|  3. Spatial 3x3 Grid Assignment (ZoneManager)                                    |
|     - Points mapped to Z1..Z9                                                    |
|                                                                                  |
|  4. Biomechanical Raised Hand Gesture Detector (GestureDetector)                 |
|     - Wrist above shoulder with elbow verification & adaptive torso clearance    |
|     - 0 hands: AUTO | 1 hand: MANUAL_OFF | 2 hands: MANUAL_ON                    |
|                                                                                  |
|  5. Temporal Debounce (0.8s Stability Window)                                    |
|     - Filters false positives from natural movement / gestures                   |
|                                                                                  |
|  6. Independent Person State Machine (PersonState)                               |
|     - Per-person tracking_id, zone, gesture, mode, isolation                     |
|     - Zero cross-contamination between people or zones                           |
|                                                                                  |
|  7. Zone Lifecycle & Priority Arbitration (OccupancyManager / ZoneState)         |
|     - Priority: MANUAL_ON > MANUAL_OFF > AUTO                                    |
|     - Leave Delay: 2.5s grace period before turning OFF                          |
+----------------------------------------+-----------------------------------------+
                                         |
                                         | HTTP POST /api/vision/sync
                                         v
+----------------------------------------------------------------------------------+
|                            FLASK BACKEND REST SERVER                             |
|                            (http://localhost:5000)                               |
|                                                                                  |
|  - ZoneService: State authority for Z1..Z9                                       |
|  - EnergyService: PZEM-004T AC telemetry aggregation                             |
|  - ESP32Client: Bridge to physical microcontrollers (or Mock/Sim)                |
|  - Live MJPEG Stream Provider (/api/vision/feed)                                 |
+-------------------+--------------------------------------+-----------------------+
                    |                                      |
         HTTP REST  |                           HTTP REST  |
                    v                                      v
+-----------------------------------+   +------------------------------------------+
|       WEB DASHBOARD (HTML5)       |   |        ESP32 HARDWARE CONTROLLER         |
|                                   |   |                                          |
| - 9 Interactive Zone Cards        |   | - Relays:                                |
| - Live Vision Camera Stream       |   |   Relay 1 -> GPIO22 (Active HIGH)        |
| - PZEM-004T Real-time Gauges      |   |   Relay 2 -> GPIO23 (Active HIGH)        |
| - Manual Overrides (Lights & Fans)|   | - Xenbrix Dimmer:                        |
| - System Health & Telemetry       |   |   ZVC -> GPIO27, DAT -> GPIO26           |
|                                   |   | - PZEM-004T AC Power Monitor:            |
|                                   |   |   RX2 -> GPIO25, TX2 -> GPIO33           |
+-----------------------------------+   +------------------------------------------+
```

## Spatial 9-Zone Grid Division
The laboratory field of view is partitioned into a 3x3 matrix:

```
+--------------------+--------------------+--------------------+
|         Z1         |         Z2         |         Z3         |
| Workstation Area 1 | Workstation Area 2 |  Equipment Bench 1 |
+--------------------+--------------------+--------------------+
|         Z4         |         Z5         |         Z6         |
| Component Storage  | Central Lab Floor  | Testing/QA Station |
+--------------------+--------------------+--------------------+
|         Z7         |         Z8         |         Z9         |
|   Soldering Bay    |  Inspection Area   | Lab Entry / Exit   |
+--------------------+--------------------+--------------------+
```

## Multi-Person Deterministic Priority Arbitration
When multiple people occupy the same laboratory zone simultaneously:

$$\text{Priority:} \quad \text{MANUAL\_ON} > \text{MANUAL\_OFF} > \text{AUTO}$$

1. **MANUAL_ON**: If any person in the zone raises 2 hands and holds for >0.8s, the zone appliances turn ON and remain ON.
2. **MANUAL_OFF**: If nobody has requested MANUAL_ON, but at least one occupant has raised 1 hand for >0.8s, the appliances turn OFF and stay OFF even while persons remain standing in the zone.
3. **AUTO**: If all occupants are in AUTO (0 hands raised), the appliances remain ON while occupied and switch OFF after the 2.5s vacancy timeout when everyone leaves.
