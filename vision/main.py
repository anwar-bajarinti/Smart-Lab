"""
Smart Lab Automation - Vision Module Main Entrypoint.
Executes live webcam capture, AI pose detection, 9-zone tracking,
and real-time local visualization window.
"""

import argparse
import json
import os
import sys
import time
import cv2
import requests

from vision.controller import VisionController
from vision.esp32_relay_bridge import ESP32RelayBridge


def load_config(config_path: str = "config/system_config.json") -> dict:
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[Main] Error reading config {config_path}: {e}")
    return {}


def main():
    parser = argparse.ArgumentParser(description="Smart Lab Automation - Vision Appliance Controller")
    parser.add_argument("--camera", type=int, default=None, help="Camera device index (default: 0)")
    parser.add_argument("--config", type=str, default="config/system_config.json", help="System config path")
    parser.add_argument("--relay-config", type=str, default="config/relay_mapping.json", help="Relay mapping config path")
    parser.add_argument("--port", type=str, default=None, help="ESP32 Serial COM port (e.g. COM3 or AUTO)")
    parser.add_argument("--backend-url", type=str, default="http://127.0.0.1:5000", help="Optional backend API base URL")
    parser.add_argument("--sync-backend", action="store_true", help="Optionally sync zone states to backend API")
    args = parser.parse_args()

    cfg = load_config(args.config)
    cam_cfg = cfg.get("camera", {})
    cam_index = args.camera if args.camera is not None else cam_cfg.get("device_index", 0)
    width = cam_cfg.get("width", 1280)
    height = cam_cfg.get("height", 720)

    # Initialize Direct ESP32 Hardware Bridge
    relay_bridge = ESP32RelayBridge(config_path=args.relay_config, port=args.port)

    print("==================================================")
    print("   SMART LAB AUTOMATION - DIRECT APPLIANCE CONTROL")
    print("==================================================")
    print(f" Camera Index       : {cam_index}")
    print(f" Target Resolution  : {width}x{height}")
    print(f" ESP32 Hardware Link: {'CONNECTED (' + str(relay_bridge.serial_port) + ')' if relay_bridge.is_connected else 'EMULATION / CONSOLE MODE'}")
    print(" Physical Mappings  :")
    print("   -> REAL LIGHT 1 (Relay 1 | GPIO 22) <==> Zone Z2")
    print("   -> REAL LIGHT 2 (Relay 2 | GPIO 23) <==> Zone Z8")
    print("   -> Status LED: GPIO 2 is onboard diagnostic LED only (NOT an appliance)")
    print(" Gestures           :")
    print("   * 0 Hands : AUTO (Enters zone -> Light ON, Leaves -> 2.5s delay -> OFF)")
    print("   * 1 Hand  : MANUAL_OFF (Light OFF, remains OFF while standing)")
    print("   * 2 Hands : MANUAL_ON (Overrides to Light ON)")
    print(" Controls: Press 'q' or 'ESC' in window to exit. Press 'm' to mirror.")
    print("==================================================")

    controller = VisionController(config_path=args.config)
    controller.initialize_camera(device_index=cam_index, width=width, height=height)

    # State synchronization callback directly to relays
    def on_zone_change(event: dict):
        # Instant direct relay update
        relay_bridge.sync_zone_states(controller.occupancy_manager.zones)
        if args.sync_backend:
            try:
                zid = event["zone_id"]
                light_action = "on" if event["light"] else "off"
                requests.post(f"{args.backend_url}/api/zones/{zid}/light/{light_action}", timeout=0.1)
            except Exception:
                pass

    controller.occupancy_manager.register_change_callback(on_zone_change)

    window_name = "SMART LAB AUTOMATION - 9-ZONE VISION SYSTEM"
    cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(window_name, 1280 + 310, 720)

    try:
        while True:
            success, raw_frame = controller.camera.read()
            if not success or raw_frame is None:
                time.sleep(0.01)
                continue

            annotated, zone_states, people, events = controller.process_frame(raw_frame)
            relay_bridge.sync_zone_states(zone_states)

            cv2.imshow(window_name, annotated)

            key = cv2.waitKey(1) & 0xFF
            if key in [ord('q'), 27]:  # 'q' or ESC
                print("[Main] Exit key received. Shutting down...")
                break
            elif key == ord('m'):
                controller.camera.mirror = not controller.camera.mirror
                print(f"[Main] Mirroring set to: {controller.camera.mirror}")

    except KeyboardInterrupt:
        print("[Main] Interrupted by user.")
    finally:
        relay_bridge.close()
        if controller.camera:
            controller.camera.release()
        cv2.destroyAllWindows()
        print("[Main] Vision system terminated safely.")


if __name__ == "__main__":
    main()
