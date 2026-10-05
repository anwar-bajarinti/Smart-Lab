# Smart Lab Automation - Deployment Guide

## 1. Local Deployment Architecture
```
[Laptop Webcam] ---> [vision.main] ---> [backend.app (Port 5000)] ---> [ESP32 (Port 80)]
                             |                     |
                             v                     v
                      [OpenCV Window]       [Web Browser Dashboard]
```

## 2. Server / Edge Mini PC Deployment
For permanent laboratory deployment:
1. Connect an industrial or wide-angle USB ceiling/corner camera to an edge PC (e.g. Intel NUC, Raspberry Pi 5, or Jetson Orin).
2. Configure `config/system_config.json`:
   - Set `"device_index"` to the USB camera index (typically 0 or 1).
   - Set `"mock_hardware": false` and specify the ESP32 IP address.
3. Run Backend as a systemd service (Linux) or Windows Service:
   ```powershell
   python -m backend.app --host 0.0.0.0 --port 5000
   ```
4. Run Vision Pipeline as a background daemon or supervised service:
   ```powershell
   python -m vision.main --sync-backend
   ```
5. Access the Web Dashboard from any laptop, smartphone, or tablet connected to the lab Wi-Fi at:
   ```
   http://<EDGE_PC_IP>:5000/
   ```

## 3. Flash ESP32 Firmware
1. Open Arduino IDE.
2. Install the **ESP32 by Espressif Systems** board package.
3. Install the **ArduinoJson** library (v6 or v7).
4. Connect ESP32 DevKit via Micro-USB cable.
5. Select Port (e.g., `COM3`) and Board (`ESP32 Dev Module`).
6. Update `WIFI_SSID` and `WIFI_PASSWORD` in `esp32/smart_lab_controller/smart_lab_controller.ino`.
7. Click **Upload**.
