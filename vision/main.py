"""
Smart Lab Automation - Vision Module Main Entrypoint.
Executes live webcam capture, AI pose detection, 9-zone tracking,
real-time local visualization window, ESP32 relay switching,
non-blocking PZEM energy monitoring, and embedded REST / CCTV streaming API.
"""

import argparse
import json
import os
import socket
import sys
import threading
import time
import cv2
import requests

from vision.controller import VisionController
from vision.esp32_relay_bridge import ESP32RelayBridge
from backend.app import create_app


def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    """Checks if a network port is already being listened on."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex((host, port)) == 0


def load_config(config_path: str = "config/system_config.json") -> dict:
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[Main] Error reading config {config_path}: {e}")
    return {}


def main():
    parser = argparse.ArgumentParser(description="Smart Lab Automation - Vision & Hardware Controller")
    parser.add_argument("--camera", type=int, default=None, help="Camera device index (default: 0)")
    parser.add_argument("--config", type=str, default="config/system_config.json", help="System config path")
    parser.add_argument("--relay-config", type=str, default="config/relay_mapping.json", help="Relay mapping config path")
    parser.add_argument("--port", type=str, default=None, help="ESP32 Serial COM port (e.g. COM4 or AUTO)")
    parser.add_argument("--api-port", type=int, default=5000, help="Local REST API / CCTV stream port (default: 5000)")
    parser.add_argument("--backend-url", type=str, default="http://127.0.0.1:5000", help="Optional backend API base URL")
    parser.add_argument("--sync-backend", action="store_true", help="Sync states over HTTP if backend runs externally")
    parser.add_argument("--no-gui", action="store_true", help="Run in headless mode without local OpenCV window")
    args = parser.parse_args()

    cfg = load_config(args.config)
    cam_cfg = cfg.get("camera", {})
    cam_index = args.camera if args.camera is not None else cam_cfg.get("device_index", 0)
    width = cam_cfg.get("width", 1280)
    height = cam_cfg.get("height", 720)

    # 1. Initialize Direct ESP32 Hardware Bridge (Relays + PZEM)
    relay_bridge = ESP32RelayBridge(config_path=args.relay_config, port=args.port)

    # 2. Initialize Single Camera & Vision Controller
    controller = VisionController(config_path=args.config)
    controller.initialize_camera(device_index=cam_index, width=width, height=height)

    # 3. Setup Embedded API & CCTV Stream Server
    embedded_server_active = False
    flask_app = None
    lab_service = None

    if not is_port_in_use(args.api_port):
        try:
            flask_app = create_app(config_path=args.config)
            lab_service = flask_app.config.get("LAB_SERVICE")
            flask_app.config["VISION_CONTROLLER"] = controller
            flask_app.config["RELAY_BRIDGE"] = relay_bridge

            # Run Flask in a background daemon thread
            server_thread = threading.Thread(
                target=lambda: flask_app.run(
                    host="0.0.0.0",
                    port=args.api_port,
                    debug=False,
                    use_reloader=False,
                    threaded=True
                ),
                daemon=True
            )
            server_thread.start()
            embedded_server_active = True
            time.sleep(0.4)  # Allow server to bind
        except Exception as ex:
            print(f"[Main] Warning: Could not start embedded API server: {ex}")
    else:
        print(f"[Main] Port {args.api_port} already in use. External backend detected.")

    print("==================================================")
    print("   SMART LAB AUTOMATION - VISION & API CONTROLLER")
    print("==================================================")
    print(f" Camera Index       : {cam_index} (Single Capture Active)")
    print(f" Target Resolution  : {width}x{height}")
    print(f" ESP32 Hardware Link: {'CONNECTED (' + str(relay_bridge.serial_port) + ')' if relay_bridge.is_connected else 'EMULATION / CONSOLE MODE'}")
    print(f" PZEM Telemetry     : Measured Device '{relay_bridge.pzem_measured_device}' in Zone '{relay_bridge.pzem_measured_zone}'")
    print(" Physical Mappings  :")
    print("   -> REAL LIGHT 1 (Relay 1 | GPIO 22) <==> Zone Z2")
    print("   -> REAL LIGHT 2 (Relay 2 | GPIO 23) <==> Zone Z8")
    print("   -> PZEM Sensor  (UART: GPIO 25, 33) <==> Real AC Power Telemetry")
    print(" Available APIs for Website Integration:")
    print(f"   -> Clean CCTV Stream : http://localhost:{args.api_port}/api/cctv/stream")
    print(f"   -> Master Status API : http://localhost:{args.api_port}/api/lab/status")
    print(f"   -> Energy Telemetry  : http://localhost:{args.api_port}/api/energy")
    print(f"   -> Local Dashboard   : http://localhost:{args.api_port}/")
    print(" Gestures           :")
    print("   * 0 Hands : AUTO (Enter zone -> Light ON, Leave -> 10.0s delay -> OFF)")
    print("   * 1 Hand  : MANUAL_OFF (Light OFF, remains OFF while standing)")
    print("   * 2 Hands : MANUAL_ON (Overrides to Light ON)")
    print(" Controls: Press 'q' or 'ESC' to exit. Press 'm' to mirror camera.")
    print("==================================================")

    # State synchronization callback directly to relays
    def on_zone_change(event: dict):
        relay_bridge.sync_zone_states(controller.occupancy_manager.zones)
        if args.sync_backend and not embedded_server_active:
            try:
                zid = event["zone_id"]
                light_action = "on" if event["light"] else "off"
                requests.post(f"{args.backend_url}/api/zones/{zid}/light/{light_action}", timeout=0.1)
            except Exception:
                pass

    controller.occupancy_manager.register_change_callback(on_zone_change)

    window_name = "SMART LAB AUTOMATION - 9-ZONE VISION SYSTEM"
    if not args.no_gui:
        cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
        cv2.resizeWindow(window_name, 1280 + 310, 720)

    last_ext_sync = 0.0

    try:
        while True:
            # Single camera capture
            success, raw_frame = controller.camera.read()
            if not success or raw_frame is None:
                time.sleep(0.01)
                continue

            # 1. Branch A: Distribute clean unannotated frame for CCTV stream
            clean_jpeg = controller.get_clean_jpeg()
            if embedded_server_active and lab_service and clean_jpeg:
                lab_service.set_clean_frame(clean_jpeg, fps=controller.fps)

            # 2. Branch B: AI Detection & Processing (Pose, Zones, Gestures)
            annotated, zone_states, people, events = controller.process_frame(raw_frame)

            # 3. Synchronize physical relays with zone states
            relay_bridge.sync_zone_states(zone_states)

            # 4. Synchronize lab state to embedded or external API
            if embedded_server_active and lab_service:
                lab_service.update_vision_state(
                    zone_states=zone_states,
                    people=people,
                    fps=controller.fps,
                    camera_online=True
                )
                lab_service.update_hardware_state(
                    esp32_summary=relay_bridge.get_status_summary(),
                    pzem_data=relay_bridge.get_pzem_data()
                )
            elif not embedded_server_active and args.sync_backend:
                # Periodic sync to external backend (every 200ms)
                now = time.time()
                if now - last_ext_sync > 0.2:
                    last_ext_sync = now
                    try:
                        sync_payload = {
                            "zone_states": zone_states,
                            "people": people,
                            "fps": controller.fps,
                            "camera_online": True,
                            "esp32": relay_bridge.get_status_summary(),
                            "pzem": relay_bridge.get_pzem_data()
                        }
                        requests.post(f"{args.backend_url}/api/lab/sync", json=sync_payload, timeout=0.15)
                        if clean_jpeg:
                            requests.post(
                                f"{args.backend_url}/api/cctv/frame?fps={controller.fps:.1f}",
                                data=clean_jpeg,
                                headers={"Content-Type": "image/jpeg"},
                                timeout=0.15
                            )
                    except Exception:
                        pass

            # 5. Render local OpenCV diagnostic window if not headless
            if not args.no_gui:
                cv2.imshow(window_name, annotated)
                key = cv2.waitKey(1) & 0xFF
                if key in [ord('q'), 27]:  # 'q' or ESC
                    print("[Main] Exit key received. Shutting down...")
                    break
                elif key == ord('m'):
                    controller.camera.mirror = not controller.camera.mirror
                    print(f"[Main] Mirroring set to: {controller.camera.mirror}")
            else:
                time.sleep(0.01)

    except KeyboardInterrupt:
        print("[Main] Interrupted by user.")
    finally:
        relay_bridge.close()
        if controller.camera:
            controller.camera.release()
        if not args.no_gui:
            cv2.destroyAllWindows()
        print("[Main] Smart Lab system terminated safely.")


if __name__ == "__main__":
    main()
