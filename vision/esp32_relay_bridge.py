"""
Direct Vision-to-ESP32 Relay Bridge.
Provides zero-latency, direct hardware switching over USB Serial or WiFi HTTP
without requiring an intermediate backend web server.
"""

import json
import os
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
    Direct bridge between Vision 3x3 Zone states and ESP32 physical relays.
    """

    def __init__(self, config_path: str = "config/relay_mapping.json", port: Optional[str] = None):
        self.config_path = config_path
        self.relay_configs: Dict[str, Any] = {}
        self.relay_states: Dict[str, bool] = {"1": False, "2": False}
        self.zone_to_relay: Dict[str, str] = {}
        
        self.serial_port: Optional[str] = port
        self.baud_rate: int = 115200
        self.ser: Optional[Any] = None
        self.is_connected: bool = False
        
        self.wifi_enabled: bool = False
        self.esp32_ip: str = "192.168.1.150"
        self.wifi_port: int = 80

        self._load_config()
        if port:
            self.serial_port = port
        self._init_connection()

    def _load_config(self):
        """Loads physical relay mappings from JSON."""
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
                    return
            except Exception as e:
                print(f"[RelayBridge] Error reading {self.config_path}: {e}")

        # Fallback defaults
        self.zone_to_relay = {"Z2": "1", "Z8": "2"}
        self.relay_configs = {
            "1": {"zones": ["Z2"], "gpio": 22, "label": "Real Light 1", "active_high": True},
            "2": {"zones": ["Z8"], "gpio": 23, "label": "Real Light 2", "active_high": True}
        }

    def _init_connection(self):
        """Attempts to establish connection with physical ESP32."""
        if not HAS_SERIAL:
            print("[RelayBridge] pyserial not available. Running in Console Emulation mode.")
            return

        # Safely close existing serial handle if already open to avoid Access Denied errors
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
            # Auto-detect CP210x or USB-Serial devices
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
                time.sleep(1.8)  # Wait for ESP32 boot/reset
                # Clear any startup banner bytes
                if self.ser.in_waiting > 0:
                    self.ser.read_all()
                self.is_connected = True
                self.serial_port = port_to_open
                print(f"[RelayBridge] Connected to physical ESP32 on {port_to_open} at {self.baud_rate} baud.")
                return
            except Exception as ex:
                print(f"[RelayBridge] Could not open {port_to_open}: {ex}")

        print("[RelayBridge] No physical ESP32 COM port detected. Running in HARDWARE EMULATION mode.")
        print("[RelayBridge] (Commands will be printed live to console and state tracked).")
        self.is_connected = False

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

        # 1. Serial Transmission
        if self.is_connected and self.ser and self.ser.is_open:
            try:
                self.ser.write(cmd.encode("utf-8"))
                self.ser.flush()
                # Read hardware acknowledgment
                time.sleep(0.08)
                ack = ""
                if self.ser.in_waiting > 0:
                    ack = self.ser.read_all().decode("utf-8", errors="ignore").strip()
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
        for rid in list(self.relay_states.keys()):
            if self.relay_states[rid]:
                self.send_relay_command(rid, False)
        if self.ser and self.ser.is_open:
            self.ser.close()
            print("[RelayBridge] Serial connection closed.")
