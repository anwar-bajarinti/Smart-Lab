"""
Direct Vision-to-ESP32 Relay & PZEM Bridge.
Provides zero-latency, direct hardware switching over USB Serial or WiFi HTTP
and non-blocking AC energy monitoring via PZEM-004T.
"""

import json
import os
import re
import threading
import time
from typing import Dict, Any, Optional, List

try:
    import serial
    import serial.tools.list_ports
    HAS_SERIAL = True
except ImportError:
    HAS_SERIAL = False

import requests


class ESP32RelayBridge:
    """
    Direct bridge between Vision 3x3 Zone states, ESP32 physical relays,
    and PZEM-004T AC energy telemetry.
    """

    def __init__(self, config_path: str = "config/relay_mapping.json", port: Optional[str] = None, strict_hardware: bool = False):
        self.config_path = config_path
        self.relay_configs: Dict[str, Any] = {}
        self.relay_states: Dict[str, bool] = {"1": False, "2": False}
        self.zone_to_relay: Dict[str, str] = {}
        self.strict_hardware = strict_hardware
        
        self.serial_port: Optional[str] = port
        self.baud_rate: int = 115200
        self.ser: Optional[Any] = None
        self.is_connected: bool = False
        self._serial_lock = threading.Lock()
        
        self.wifi_enabled: bool = False
        self.esp32_ip: str = "192.168.1.150"
        self.wifi_port: int = 80

        # PZEM Energy Monitoring Configuration
        self.pzem_measured_device: str = "Light 1"
        self.pzem_measured_zone: str = "Z1"
        self.pzem_polling_interval: float = 1.5
        self.pzem_data: Dict[str, Any] = {
            "measured_device": self.pzem_measured_device,
            "measured_zone": self.pzem_measured_zone,
            "voltage": None,
            "current": None,
            "power": None,
            "energy": None,
            "frequency": None,
            "power_factor": None,
            "valid": False,
            "status": "OFFLINE",
            "last_read": 0.0
        }
        
        self._running: bool = True
        self._pzem_thread: Optional[threading.Thread] = None

        self._load_config()
        if port:
            self.serial_port = port
        self._init_connection()

        # Start non-blocking PZEM polling thread if serial is active
        self._start_pzem_polling()

    def _load_config(self):
        """Loads physical relay mappings and PZEM configuration from JSON."""
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.relay_configs = data.get("relays", {})
                    
                    # Build zone to relay lookup table (supports single "zone" or list "zones")
                    for rid, rcfg in self.relay_configs.items():
                        zones = rcfg.get("zones") or ([rcfg.get("zone")] if rcfg.get("zone") else [])
                        for zid in zones:
                            if zid:
                                self.zone_to_relay[zid.upper()] = rid
                        self.relay_states[rid] = False

                    ser_cfg = data.get("serial", {})
                    if not self.serial_port or self.serial_port == "AUTO":
                        self.serial_port = ser_cfg.get("port", "AUTO")
                    self.baud_rate = ser_cfg.get("baud_rate", 115200)

                    wifi_cfg = data.get("wifi", {})
                    self.wifi_enabled = wifi_cfg.get("enabled", False)
                    self.esp32_ip = wifi_cfg.get("esp32_ip", "192.168.1.150")
                    self.wifi_port = wifi_cfg.get("port", 80)

                    pzem_cfg = data.get("pzem", {})
                    self.pzem_measured_device = pzem_cfg.get("measured_device", "Light 1")
                    self.pzem_measured_zone = pzem_cfg.get("measured_zone", "Z1")
                    self.pzem_polling_interval = float(pzem_cfg.get("polling_interval_sec", 1.5))
                    self.pzem_data["measured_device"] = self.pzem_measured_device
                    self.pzem_data["measured_zone"] = self.pzem_measured_zone
                    return
            except Exception as e:
                print(f"[RelayBridge] Error reading {self.config_path}: {e}")

        # Fallback defaults
        self.zone_to_relay = {"Z1": "1", "Z9": "2"}
        self.relay_configs = {
            "1": {"zones": ["Z1"], "gpio": 22, "label": "Real Light 1", "active_high": True},
            "2": {"zones": ["Z9"], "gpio": 23, "label": "Real Light 2", "active_high": True}
        }

    def _init_connection(self):
        """Attempts to establish connection with physical ESP32."""
        if not HAS_SERIAL:
            if self.strict_hardware:
                raise RuntimeError("pyserial is unavailable, so the real ESP32 hardware path cannot start in strict hardware mode.")
            print("[RelayBridge] pyserial not available. Running in Console Emulation mode.")
            return

        with self._serial_lock:
            if self.ser is not None:
                try:
                    if getattr(self.ser, "is_open", False):
                        self.ser.close()
                except Exception:
                    pass
                self.ser = None
                self.is_connected = False

            port_to_open = None
            if self.serial_port and self.serial_port != "AUTO":
                port_to_open = self.serial_port
            else:
                ports = list(serial.tools.list_ports.comports())
                for p in ports:
                    desc = p.description.lower()
                    if "cp210" in desc or "ch340" in desc or "usb-serial" in desc or "uart" in desc:
                        port_to_open = p.device
                        break
                if not port_to_open and len(ports) > 0:
                    port_to_open = ports[0].device

            if port_to_open:
                try:
                    self.ser = serial.Serial(port_to_open, self.baud_rate, timeout=0.2)
                    self.ser.dtr = False
                    self.ser.rts = False
                    time.sleep(1.8)  # Wait for ESP32 boot
                    if self.ser.in_waiting > 0:
                        self.ser.read_all()
                    self.is_connected = True
                    self.serial_port = port_to_open
                    print(f"[RelayBridge] Connected to physical ESP32 on {port_to_open} at {self.baud_rate} baud.")
                    return
                except Exception as ex:
                    print(f"[RelayBridge] Could not open {port_to_open}: {ex}")

        if self.strict_hardware:
            port_label = self.serial_port or "configured serial port"
            raise RuntimeError(
                f"strict hardware mode requires a real ESP32 connection on {port_label}; emulation is disabled for the live launcher."
            )

        print("[RelayBridge] No physical ESP32 COM port detected. Running in HARDWARE EMULATION mode.")
        print("[RelayBridge] (Commands will be printed live to console and state tracked).")
        self.is_connected = False

    def _start_pzem_polling(self):
        """Launches periodic background PZEM sensor telemetry thread."""
        if self._pzem_thread is None or not self._pzem_thread.is_alive():
            self._pzem_thread = threading.Thread(target=self._pzem_poll_loop, daemon=True)
            self._pzem_thread.start()

    def _pzem_poll_loop(self):
        """Continuous background thread reading PZEM measurements and telemetry."""
        while self._running:
            if self.is_connected and self.ser:
                try:
                    lines_to_parse = ""
                    with self._serial_lock:
                        if getattr(self.ser, "is_open", False) and self.ser.in_waiting > 0:
                            lines_to_parse = self.ser.read_all().decode("utf-8", errors="ignore")
                    
                    if lines_to_parse:
                        self._parse_incoming_telemetry(lines_to_parse)

                    # Trigger a query heartbeat if no telemetry was received in the last 2.5 seconds
                    now = time.time()
                    if now - self.pzem_data.get("last_read", 0) > 2.5:
                        with self._serial_lock:
                            if getattr(self.ser, "is_open", False):
                                self.ser.write(b"PZEM\n")
                                self.ser.flush()
                except Exception:
                    pass
            time.sleep(0.15)

    def _parse_incoming_telemetry(self, raw_text: str):
        """Extracts and validates PZEM telemetry from JSON lines or human-readable text."""
        if not raw_text:
            return

        for line in raw_text.splitlines():
            line = line.strip()
            if not line:
                continue

            # 1. JSON format: PZEM:{...}
            if line.startswith("PZEM:"):
                payload = line[5:].strip()
                try:
                    parsed = json.loads(payload)
                    v = parsed.get("voltage")
                    if v is not None and float(v) > 0.0:
                        v_val = float(v)
                        if 80.0 <= v_val <= 300.0:
                            self.pzem_data["voltage"] = v_val
                            self.pzem_data["current"] = max(0.0, float(parsed.get("current", 0.0) or 0.0))
                            self.pzem_data["power"] = max(0.0, float(parsed.get("power", 0.0) or 0.0))
                            self.pzem_data["energy"] = max(0.0, float(parsed.get("energy", 0.0) or 0.0))
                            self.pzem_data["frequency"] = float(parsed.get("frequency", 50.0) or 50.0)
                            self.pzem_data["power_factor"] = float(parsed.get("pf", 1.0) or 1.0)
                            self.pzem_data["valid"] = True
                            self.pzem_data["status"] = "ONLINE"
                            self.pzem_data["last_read"] = time.time()
                            continue
                    elif v is None:
                        self.pzem_data["valid"] = False
                        self.pzem_data["status"] = "NO_AC_LOAD"
                except Exception:
                    pass

            # 2. Human-readable lines (matches Arduino Serial Monitor)
            if "Voltage:" in line and "V" in line:
                m = re.search(r"Voltage:\s*([\d\.]+)", line)
                if m:
                    v_val = float(m.group(1))
                    if 80.0 <= v_val <= 300.0:
                        self.pzem_data["voltage"] = v_val
                        self.pzem_data["valid"] = True
                        self.pzem_data["status"] = "ONLINE"
                        self.pzem_data["last_read"] = time.time()
            if "Current:" in line and "A" in line:
                m = re.search(r"Current:\s*([\d\.]+)", line)
                if m:
                    self.pzem_data["current"] = float(m.group(1))
            if "Power:" in line and "W" in line:
                m = re.search(r"Power:\s*([\d\.]+)", line)
                if m:
                    self.pzem_data["power"] = float(m.group(1))
            if "Energy:" in line and "kWh" in line:
                m = re.search(r"Energy:\s*([\d\.]+)", line)
                if m:
                    self.pzem_data["energy"] = float(m.group(1))
            if "Frequency:" in line and "Hz" in line:
                m = re.search(r"Frequency:\s*([\d\.]+)", line)
                if m:
                    self.pzem_data["frequency"] = float(m.group(1))
            if "Power PF:" in line:
                m = re.search(r"Power PF:\s*([\d\.]+)", line)
                if m:
                    self.pzem_data["power_factor"] = float(m.group(1))
            if "PZEM NOT RESPONDING" in line:
                self.pzem_data["valid"] = False
                self.pzem_data["status"] = "NOT_RESPONDING"

    def poll_pzem(self):
        """Polls PZEM sensor telemetry safely."""
        if not self.is_connected or not self.ser:
            self.pzem_data["valid"] = False
            self.pzem_data["status"] = "OFFLINE"
            return

        with self._serial_lock:
            try:
                if not getattr(self.ser, "is_open", False):
                    return
                resp = ""
                if self.ser.in_waiting > 0:
                    resp = self.ser.read_all().decode("utf-8", errors="ignore").strip()
                if resp:
                    self._parse_incoming_telemetry(resp)

                # Send query if needed
                if time.time() - self.pzem_data.get("last_read", 0) > 2.0:
                    self.ser.write(b"PZEM\n")
                    self.ser.flush()
                    time.sleep(0.08)
                    if self.ser.in_waiting > 0:
                        resp = self.ser.read_all().decode("utf-8", errors="ignore").strip()
                        if resp:
                            self._parse_incoming_telemetry(resp)
            except Exception as e:
                self.pzem_data["valid"] = False
                self.pzem_data["status"] = f"ERROR: {e}"

    def get_pzem_data(self) -> Dict[str, Any]:
        """Returns the latest non-blocking PZEM reading."""
        return dict(self.pzem_data)

    def get_status_summary(self) -> Dict[str, Any]:
        """Returns ESP32 connection and relay status summary."""
        return {
            "online": self.is_connected,
            "port": self.serial_port or "AUTO",
            "relay1": "ON" if self.relay_states.get("1") else "OFF",
            "relay2": "ON" if self.relay_states.get("2") else "OFF"
        }

    def send_relay_command(self, relay_id: str, state: bool):
        """
        Sends switching command to physical ESP32 (or emulates if offline).
        """
        cmd = f"R{relay_id} {'ON' if state else 'OFF'}\n"
        gpio = self.relay_configs.get(relay_id, {}).get("gpio", 22 if relay_id == "1" else 23)
        level_str = "HIGH" if state else "LOW"

        label = self.relay_configs.get(relay_id, {}).get("label", f"Light {relay_id}")
        zones = self.relay_configs.get(relay_id, {}).get("zones") or [self.relay_configs.get(relay_id, {}).get("zone", "?")]
        zones_str = ",".join(str(z) for z in zones)

        # 1. Serial Transmission (Sends both R1 ON/OFF and single character '1'/'0')
        if self.is_connected:
            with self._serial_lock:
                if self.ser and getattr(self.ser, "is_open", False):
                    try:
                        self.ser.write(cmd.encode("utf-8"))
                        if relay_id == "1":
                            self.ser.write(b"1\n" if state else b"0\n")
                        elif relay_id == "2":
                            self.ser.write(b"2\n" if state else b"3\n")
                        self.ser.flush()
                        time.sleep(0.06)
                        ack = ""
                        if self.ser.in_waiting > 0:
                            ack = self.ser.read_all().decode("utf-8", errors="ignore").strip()
                            if ack:
                                self._parse_incoming_telemetry(ack)
                        ack_str = f" | ACK: '{ack}'" if ack else ""
                        print(f"[ESP32 PHYSICAL RELAY] -> Sent '{cmd.strip()}' -> Relay {relay_id} [GPIO {gpio}: {level_str}] ==> {label} (Zones: {zones_str}){ack_str}")
                        return
                    except Exception as e:
                        print(f"[RelayBridge] Serial communication error: {e}. Reverting to emulation.")
                        self.is_connected = False

        # 2. WiFi HTTP Transmission (if enabled)
        if self.wifi_enabled:
            try:
                action = "on" if state else "off"
                url = f"http://{self.esp32_ip}:{self.wifi_port}/r{relay_id}/{action}"
                requests.get(url, timeout=0.2)
                print(f"[ESP32 HARDWARE WIFI] -> GET {url} [GPIO {gpio}] ==> {label} (Zones: {zones_str})")
                return
            except Exception:
                pass

        # 3. Emulation Output
        print(f"[HARDWARE RELAY {relay_id}] -> {'ON (HIGH)' if state else 'OFF (LOW)'} [GPIO {gpio}] ==> {label} (Zones: {zones_str})")

    def sync_zone_states(self, zone_states: Dict[str, Any]):
        """
        Translates zone appliance states into physical relay switching events.
        Only dispatches when a relay's target state actually toggles.
        """
        for relay_id, rcfg in self.relay_configs.items():
            zones = rcfg.get("zones") or ([rcfg.get("zone")] if rcfg.get("zone") else [])
            
            relay_should_be_on = False
            for zid in zones:
                zid = zid.upper()
                state_obj = zone_states.get(zid)
                if state_obj is None:
                    continue
                if hasattr(state_obj, "light_state"):
                    if state_obj.light_state is True:
                        relay_should_be_on = True
                        break
                elif isinstance(state_obj, dict):
                    if state_obj.get("light_state") == "ON" or state_obj.get("light_bool") is True:
                        relay_should_be_on = True
                        break

            current_relay_state = self.relay_states.get(relay_id, False)

            if relay_should_be_on != current_relay_state:
                self.relay_states[relay_id] = relay_should_be_on
                self.send_relay_command(relay_id, relay_should_be_on)

    def close(self):
        """Safely shuts down relay outputs and closes serial port."""
        self._running = False
        if self._pzem_thread and self._pzem_thread.is_alive():
            self._pzem_thread.join(timeout=0.5)

        for rid in list(self.relay_states.keys()):
            if self.relay_states[rid]:
                self.send_relay_command(rid, False)

        with self._serial_lock:
            if self.ser and getattr(self.ser, "is_open", False):
                self.ser.close()
                print("[RelayBridge] Serial connection closed.")
