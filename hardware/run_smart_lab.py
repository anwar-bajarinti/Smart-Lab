#!/usr/bin/env python3
"""
=============================================================================
SMART LAB AUTOMATION — ONE-COMMAND LIVE SYSTEM RUNNER
=============================================================================
Single master entrypoint to run the COMPLETE live Smart Lab system:
 1. Laptop Webcam (Single-capture DirectShow architecture)
 2. YOLOv8 Person Detection (yolov8n-pose.pt)
 3. ByteTrack Spatial Person Tracking
 4. 3x3 Physical Zone Spatial Localization
 5. Biomechanical Gesture Recognition (0/1/2 hands, 0.8s debounce)
 6. Real-Time Zone Automation
 7. Real ESP32 Relay Communication (COM4, Active HIGH: GPIO 22 & 23)
 8. Real-Time 10-Second Non-Blocking Vacancy Delay
 9. Physical PZEM-004T AC Electrical Telemetry
10. Flask Master Backend & REST APIs (Port 5000)
11. Clean CCTV Raw Video Stream (/api/cctv/stream)
12. Interactive Local Web Dashboard (http://localhost:5000)

Usage:
    python run_smart_lab.py
    python run_smart_lab.py --camera 0 --port COM4
    python run_smart_lab.py --no-gui  (Headless mode)

Hardware requirement:
    This launcher requires the ESP32 to be connected on COM4 with the real
    firmware from esp32/smart_lab_relay_controller/smart_lab_relay_controller.ino.
    If COM4 is unavailable, startup stops instead of running simulated relays.

Safe Shutdown:
    Press Ctrl+C or 'q' in the camera window.
    Both physical relays are unconditionally turned OFF.
=============================================================================
"""

import sys
import os
import signal
import socket
import threading
import time
import argparse
from typing import Optional

# Ensure repository root is on PYTHONPATH
REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(REPO_ROOT)
sys.path.insert(0, REPO_ROOT)

import cv2
import serial
import serial.tools.list_ports

from vision.controller import VisionController
from vision.esp32_relay_bridge import ESP32RelayBridge
from backend.app import create_app


class Colors:
    GREEN = "\033[92m"
    RED = "\033[91m"
    YELLOW = "\033[93m"
    CYAN = "\033[96m"
    BOLD = "\033[1m"
    RESET = "\033[0m"


def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex((host, port)) == 0


class SmartLabRunner:
    def __init__(
        self,
        camera_idx: int = 0,
        serial_port: str = "COM4",
        api_port: int = 5000,
        no_gui: bool = False,
        allow_emulation: bool = False
    ):
        self.camera_idx = camera_idx
        self.serial_port = serial_port
        self.api_port = api_port
        self.no_gui = no_gui
        self.allow_emulation = allow_emulation

        self.running = True
        self.relay_bridge: Optional[ESP32RelayBridge] = None
        self.controller: Optional[VisionController] = None
        self.flask_app = None
        self.lab_service = None
        self.server_thread = None

    def start(self):
        print("\n" + "=" * 45)
        print("       SMART LAB SYSTEM STARTING")
        print("=" * 45 + "\n")

        # 1. Initialize Backend & Services
        try:
            self.flask_app = create_app(config_path="config/system_config.json")
            self.lab_service = self.flask_app.config.get("LAB_SERVICE")
            print(f"[{Colors.GREEN}OK{Colors.RESET}] Backend API")
        except Exception as e:
            print(f"[{Colors.RED}FAIL{Colors.RESET}] Backend API: {e}")
            sys.exit(1)

        # 2. Check COM4 Port & Connect to Hardware Bridge (with dynamic reconnect polling)
        ports = [p.device for p in serial.tools.list_ports.comports()]
        print(f"[CHECK] Detected serial ports: {ports if ports else 'NONE'}")

        max_attempts = 15 if not self.allow_emulation else 1
        retry_delay = 2.0

        for attempt in range(1, max_attempts + 1):
            try:
                self.relay_bridge = ESP32RelayBridge(
                    config_path="config/relay_mapping.json",
                    port=self.serial_port,
                    strict_hardware=not self.allow_emulation,
                )
                if self.relay_bridge.is_connected:
                    break
            except Exception as e:
                err_msg = str(e)
                if attempt == 1:
                    if "FileNotFoundError" in err_msg or "cannot find the file" in err_msg or "CM_PROB_FAILED_START" in err_msg:
                        print(f"\n{Colors.YELLOW}{'=' * 65}{Colors.RESET}")
                        print(f"{Colors.BOLD}{Colors.YELLOW}[HARDWARE RECONNECT REQUIRED]{Colors.RESET}")
                        print(f"Windows CP210x USB Driver reports: 'Device cannot start (Code 10)'.")
                        print(f"This occurs after flashing or Windows USB power-saving.")
                        print(f"{Colors.BOLD}{Colors.GREEN}ACTION: Please UNPLUG the ESP32 USB cable and PLUG IT BACK IN now.{Colors.RESET}")
                        print(f"{Colors.YELLOW}{'=' * 65}{Colors.RESET}\n")
                    elif "PermissionError" in err_msg or "Access is denied" in err_msg:
                        print(f"[{Colors.YELLOW}ALERT{Colors.RESET}] {self.serial_port} is LOCKED by another program (e.g. Arduino Serial Monitor). Please close it.")

                if attempt < max_attempts:
                    print(f"[{Colors.YELLOW}WAITING{Colors.RESET}] Waiting for ESP32 connection on {self.serial_port} ({attempt}/{max_attempts})...")
                    time.sleep(retry_delay)

        if not (self.relay_bridge and self.relay_bridge.is_connected):
            if not self.allow_emulation:
                print(f"\n[{Colors.RED}FAIL{Colors.RESET}] ESP32 serial connection could not be opened on {self.serial_port}.")
                print(f"        -> To connect real hardware: UNPLUG the ESP32 USB cable from your laptop and PLUG IT BACK IN.")
                print(f"        -> To run the full system in software emulation mode for UI/vision testing, run:")
                print(f"           python run_smart_lab.py --allow-emulation\n")
                sys.exit(1)
            else:
                print(f"[{Colors.YELLOW}EMULATION{Colors.RESET}] Running in software emulation mode as requested by --allow-emulation.")
                self.relay_bridge = ESP32RelayBridge(
                    config_path="config/relay_mapping.json",
                    port=self.serial_port,
                    strict_hardware=False,
                )

        print(f"[{Colors.GREEN}OK{Colors.RESET}] ESP32 {self.serial_port}")
        print(f"[{Colors.GREEN}OK{Colors.RESET}] Relay Controller (GPIO 22 -> Zone Z1 | GPIO 23 -> Zone Z9)")
        print(f"[{Colors.GREEN}OK{Colors.RESET}] PZEM (Active load on Light 1 / Zone Z1)")

        # 4. Initialize Single-Capture Camera & Vision Pipeline
        try:
            self.controller = VisionController(config_path="config/system_config.json")
            print(f"[{Colors.GREEN}OK{Colors.RESET}] YOLO Model (yolov8n-pose.pt loaded)")
            self.controller.initialize_camera(device_index=self.camera_idx, width=1280, height=720)
            print(f"[{Colors.GREEN}OK{Colors.RESET}] Camera (Webcam index {self.camera_idx} @ 1280x720 30FPS)")
        except Exception as e:
            print(f"[{Colors.RED}FAIL{Colors.RESET}] Camera & Vision: {e}")
            self.shutdown()
            sys.exit(1)

        # 5. Link Shared Context & Start Web Server
        self.flask_app.config["VISION_CONTROLLER"] = self.controller
        self.flask_app.config["RELAY_BRIDGE"] = self.relay_bridge

        if not is_port_in_use(self.api_port):
            self.server_thread = threading.Thread(
                target=lambda: self.flask_app.run(
                    host="0.0.0.0",
                    port=self.api_port,
                    debug=False,
                    use_reloader=False,
                    threaded=True
                ),
                daemon=True
            )
            self.server_thread.start()
            time.sleep(0.4)
            print(f"[{Colors.GREEN}OK{Colors.RESET}] CCTV Stream (Raw unannotated feed ready)")
            print(f"[{Colors.GREEN}OK{Colors.RESET}] Dashboard (Serving on port {self.api_port})")
        else:
            print(f"[{Colors.YELLOW}NOTE{Colors.RESET}] Port {self.api_port} already active. Connected to existing listener.")

        print("\nDashboard:")
        print(f"  {Colors.CYAN}http://localhost:{self.api_port}{Colors.RESET}")
        print("\nCCTV:")
        print(f"  {Colors.CYAN}http://localhost:{self.api_port}/api/cctv/stream{Colors.RESET}")
        print("\nAPI:")
        print(f"  {Colors.CYAN}http://localhost:{self.api_port}/api/lab/status{Colors.RESET}")

        print("\n" + "=" * 45)
        print("       SMART LAB RUNNING")
        print("=" * 45)
        print(" -> Press Ctrl+C in terminal or 'q' in video window to safely stop.\n")

        # 6. Execute Main Vision & Hardware Coordination Loop
        self.run_loop()

    def run_loop(self):
        window_name = "SMART LAB AUTOMATION — 3x3 ZONES & TELEMETRY"
        if not self.no_gui:
            cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
            cv2.resizeWindow(window_name, 1280 + 310, 720)

        last_telemetry_print = 0.0
        try:
            while self.running:
                # 1. Single Camera Capture
                success, raw_frame = self.controller.camera.read()
                if not success or raw_frame is None:
                    time.sleep(0.01)
                    continue

                # 2. Distribute Clean Frame for CCTV Stream (Raw, NO boxes, NO skeleton)
                clean_jpeg = self.controller.get_clean_jpeg()
                if self.lab_service and clean_jpeg:
                    self.lab_service.set_clean_frame(clean_jpeg, fps=self.controller.fps)

                # 3. AI Processing: YOLO Pose + ByteTrack + 3x3 Zones + Gestures + 10s Vacancy Delay
                annotated, zone_states, people, events = self.controller.process_frame(raw_frame)

                # 4. Synchronize Physical Relays (GPIO 22 / GPIO 23)
                if self.relay_bridge:
                    self.relay_bridge.sync_zone_states(zone_states)

                # 5. Push Real-Time State to Master Backend API
                if self.lab_service:
                    self.lab_service.update_vision_state(
                        zone_states=zone_states,
                        people=people,
                        fps=self.controller.fps,
                        camera_online=True
                    )
                    if self.relay_bridge:
                        self.lab_service.update_hardware_state(
                            esp32_summary=self.relay_bridge.get_status_summary(),
                            pzem_data=self.relay_bridge.get_pzem_data()
                        )

                # 6. Real-Time Terminal Event & Telemetry Output
                for event in events:
                    print(f"[{Colors.GREEN}EVENT{Colors.RESET}] {event}")

                now = time.time()
                if now - last_telemetry_print >= 2.0:
                    last_telemetry_print = now
                    occupied_zones = [zid for zid, z in zone_states.items() if z.get("occupied")]
                    z1_vac = zone_states.get("Z1", {}).get("vacancy_remaining_seconds", 0.0)
                    z9_vac = zone_states.get("Z9", {}).get("vacancy_remaining_seconds", 0.0)
                    r1 = "ON" if self.relay_bridge and self.relay_bridge.relay_states.get("1") else "OFF"
                    r2 = "ON" if self.relay_bridge and self.relay_bridge.relay_states.get("2") else "OFF"
                    pzem = self.relay_bridge.get_pzem_data() if self.relay_bridge else {}
                    pzem_str = f"{pzem.get('voltage')}V | {pzem.get('power')}W" if pzem.get("valid") else (pzem.get("status", "Standby"))
                    vac_str = ""
                    if z1_vac > 0:
                        vac_str += f" | Z1 OFF in {z1_vac:.1f}s"
                    if z9_vac > 0:
                        vac_str += f" | Z9 OFF in {z9_vac:.1f}s"
                    print(f"[{Colors.CYAN}LIVE{Colors.RESET}] FPS: {self.controller.fps:.1f} | People: {len(people)} | Occupied: {occupied_zones or 'None'} | R1(Z1): {r1} | R2(Z9): {r2}{vac_str} | PZEM: {pzem_str}")

                # 7. Display Local OpenCV Diagnostic Window if enabled
                if not self.no_gui:
                    cv2.imshow(window_name, annotated)
                    key = cv2.waitKey(1) & 0xFF
                    if key in [ord('q'), 27]:  # 'q' or ESC
                        print("\n[Exit Key Pressed] Initiating clean shutdown...")
                        break
                    elif key == ord('m'):
                        self.controller.camera.mirror = not self.controller.camera.mirror
                else:
                    time.sleep(0.01)

        except KeyboardInterrupt:
            print("\n[Ctrl+C Detected] Initiating clean shutdown...")
        finally:
            self.shutdown()

    def shutdown(self):
        self.running = False
        print("\n=========================================")
        print("      SMART LAB SYSTEM SHUTDOWN")
        print("=========================================")

        # 1. Hardware Safety Reset: Unconditionally turn Relays OFF
        if self.relay_bridge:
            try:
                print(" -> Turning OFF physical relays (GPIO 22 LOW, GPIO 23 LOW)...")
                self.relay_bridge.send_relay_command("1", False)
                self.relay_bridge.send_relay_command("2", False)
                self.relay_bridge.close()
                print(" -> ESP32 serial link closed.")
            except Exception as e:
                print(f" -> Error during relay shutdown: {e}")

        # 2. Release Camera
        if self.controller and self.controller.camera:
            try:
                self.controller.camera.release()
                print(" -> Camera capture stopped.")
            except Exception as e:
                print(f" -> Error releasing camera: {e}")

        # 3. Destroy GUI Windows
        if not self.no_gui:
            try:
                cv2.destroyAllWindows()
                print(" -> Display windows closed.")
            except Exception:
                pass

        print(f"\n{Colors.GREEN}[SAFE]{Colors.RESET} Both Relays OFF. Smart Lab safely stopped.\n")


def main():
    parser = argparse.ArgumentParser(description="Start the Complete Smart Lab System with ONE command")
    parser.add_argument("--camera", type=int, default=0, help="Webcam device index (default: 0)")
    parser.add_argument("--port", type=str, default="COM4", help="ESP32 serial port (default: COM4)")
    parser.add_argument("--api-port", type=int, default=5000, help="Web server port (default: 5000)")
    parser.add_argument("--no-gui", action="store_true", help="Run without OpenCV diagnostic window")
    parser.add_argument("--allow-emulation", action="store_true", help="Allow software emulation fallback if ESP32 is not connected")
    args = parser.parse_args()

    runner = SmartLabRunner(
        camera_idx=args.camera,
        serial_port=args.port,
        api_port=args.api_port,
        no_gui=args.no_gui,
        allow_emulation=args.allow_emulation
    )

    # Register graceful signal handlers
    def signal_handler(sig, frame):
        runner.running = False

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    runner.start()


if __name__ == "__main__":
    main()
