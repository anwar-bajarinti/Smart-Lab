"""
ESP32 Hardware Client.
Manages communication with physical ESP32 microcontrollers controlling relays,
dimmers, and PZEM-004T power monitors over WiFi/HTTP or Serial.
Strictly distinguishes REAL HARDWARE MODE from DEVELOPMENT/SIMULATION MODE.
"""

import time
import requests
from typing import Optional, Dict, Any
from backend.models.schemas import EnergyMetrics


class ESP32Client:
    """
    Client for interacting with the ESP32 Smart Lab Controller.
    """

    def __init__(
        self,
        host: str = "192.168.1.150",
        port: int = 80,
        timeout: float = 1.0,
        mock_hardware: bool = True
    ):
        self.host = host
        self.port = port
        self.timeout = timeout
        self.mock_hardware = mock_hardware
        self.base_url = f"http://{host}:{port}"
        
        # State tracking for hardware connection
        self.is_connected: bool = False
        self.last_ping_time: float = 0.0
        self.last_error: str = ""

        # Simulated state registry when running in development mode
        self._simulated_relays: Dict[int, bool] = {1: False, 2: False}
        self._simulated_dimmers: Dict[int, int] = {1: 0}

    def ping(self) -> bool:
        """Checks if the physical ESP32 is reachable on the local network."""
        if self.mock_hardware:
            self.is_connected = False
            return False

        try:
            resp = requests.get(f"{self.base_url}/api/status", timeout=self.timeout)
            if resp.status_code == 200:
                self.is_connected = True
                self.last_ping_time = time.time()
                return True
        except Exception as ex:
            self.last_error = str(ex)
            self.is_connected = False
        return False

    def send_relay_command(self, relay_id: int, state: bool) -> Dict[str, Any]:
        """
        Sends an ON/OFF command to a physical relay.
        
        Hardware prototype:
            Relay 1: GPIO22 (Active HIGH)
            Relay 2: GPIO23 (Active HIGH)
        """
        cmd_str = "ON" if state else "OFF"
        
        if self.mock_hardware:
            self._simulated_relays[relay_id] = state
            return {
                "mode": "DEVELOPMENT_SIMULATION",
                "hardware_active": False,
                "relay_id": relay_id,
                "state": cmd_str,
                "applied": True,
                "note": "Mock hardware executed. Physical ESP32 not contacted."
            }

        try:
            url = f"{self.base_url}/api/relay/{relay_id}/{cmd_str.lower()}"
            resp = requests.post(url, timeout=self.timeout)
            self.is_connected = (resp.status_code == 200)
            return {
                "mode": "REAL_HARDWARE",
                "hardware_active": True,
                "status_code": resp.status_code,
                "response": resp.json() if resp.status_code == 200 else resp.text
            }
        except Exception as ex:
            self.is_connected = False
            self.last_error = str(ex)
            return {
                "mode": "REAL_HARDWARE",
                "hardware_active": False,
                "error": f"Failed to contact ESP32 at {self.base_url}: {ex}",
                "applied": False
            }

    def send_dimmer_command(self, channel: int, speed_percent: int) -> Dict[str, Any]:
        """
        Sends a speed / dimming level (0-100%) to the Xenbrix Dimmer.
        
        Hardware prototype:
            Dimmer 1: ZVC GPIO27, DAT GPIO26
        """
        clamped_val = max(0, min(100, speed_percent))

        if self.mock_hardware:
            self._simulated_dimmers[channel] = clamped_val
            return {
                "mode": "DEVELOPMENT_SIMULATION",
                "hardware_active": False,
                "channel": channel,
                "speed": clamped_val,
                "applied": True,
                "note": "Mock dimmer updated."
            }

        try:
            url = f"{self.base_url}/api/dimmer/{channel}/speed"
            resp = requests.post(url, json={"speed": clamped_val}, timeout=self.timeout)
            return {
                "mode": "REAL_HARDWARE",
                "hardware_active": True,
                "status_code": resp.status_code,
                "response": resp.json() if resp.status_code == 200 else resp.text
            }
        except Exception as ex:
            self.is_connected = False
            return {
                "mode": "REAL_HARDWARE",
                "hardware_active": False,
                "error": str(ex),
                "applied": False
            }

    def read_pzem_energy(self) -> EnergyMetrics:
        """
        Reads power telemetry from the PZEM-004T energy monitor.
        
        Hardware prototype:
            PZEM-004T: RX GPIO25, TX GPIO33 (UART)
        """
        metrics = EnergyMetrics(timestamp=time.time())

        if self.mock_hardware:
            metrics.is_live_hardware = False
            metrics.status = "DEVELOPMENT_SIMULATION_MODE (Physical PZEM not attached)"
            metrics.voltage = 230.2
            metrics.current = 0.85
            metrics.power = 195.6
            metrics.energy = 4.32
            metrics.frequency = 50.0
            metrics.power_factor = 0.98
            return metrics

        try:
            url = f"{self.base_url}/api/energy"
            resp = requests.get(url, timeout=self.timeout)
            if resp.status_code == 200:
                data = resp.json()
                metrics.voltage = data.get("voltage")
                metrics.current = data.get("current")
                metrics.power = data.get("power")
                metrics.energy = data.get("energy")
                metrics.frequency = data.get("frequency")
                metrics.power_factor = data.get("power_factor")
                metrics.is_live_hardware = True
                metrics.status = "ONLINE"
            else:
                metrics.is_live_hardware = False
                metrics.status = f"ESP32_HTTP_ERROR_{resp.status_code}"
        except Exception as ex:
            metrics.is_live_hardware = False
            metrics.status = f"ESP32_UNREACHABLE: {ex}"

        return metrics
