"""
Master Smart Lab State Management Service.
Centralizes the complete real-time status of the laboratory for the Master API:
- Clean CCTV video stream distribution (raw, unannotated)
- Live People counts, tracking IDs, and gestures
- 3x3 Physical Zone operational states
- Appliance states (Light 1 / Light 2)
- ESP32 hardware connection & physical relays
- PZEM-004T AC electrical load telemetry (single physical CT)
"""

import threading
import time
from typing import Dict, Any, List, Optional


class LabService:
    """
    Central state authority for the laboratory automation module.
    """

    def __init__(self, zone_service=None, esp32_client=None):
        self.zone_service = zone_service
        self.esp32_client = esp32_client
        self._lock = threading.Lock()

        # Camera & CCTV stream
        self.camera_online: bool = False
        self.camera_fps: float = 0.0
        self.latest_clean_jpeg: Optional[bytes] = None
        self.last_frame_timestamp: float = 0.0

        # Occupancy & Tracking
        self.people_count: int = 0
        self.people: List[Dict[str, Any]] = []

        # 3x3 Zones defaults
        self.zone_device_mapping: Dict[str, str] = {
            "Z2": "Light 1",
            "Z8": "Light 2"
        }

        # Initialize default 9 zones
        self.zones: Dict[str, Dict[str, Any]] = {}
        for i in range(1, 10):
            zid = f"Z{i}"
            self.zones[zid] = {
                "occupied": False,
                "occupant_count": 0,
                "device": self.zone_device_mapping.get(zid, None),
                "state": "OFF",
                "mode": "AUTO"
            }

        # Appliances
        self.appliances: Dict[str, str] = {
            "light1": "OFF",
            "light2": "OFF"
        }

        # ESP32
        self.esp32: Dict[str, Any] = {
            "online": False,
            "port": "AUTO",
            "relay1": "OFF",
            "relay2": "OFF"
        }

        # PZEM Single CT Configuration
        self.pzem: Dict[str, Any] = {
            "measured_device": "Light 1",
            "measured_zone": "Z2",
            "voltage": None,
            "current": None,
            "power": None,
            "energy": None,
            "frequency": None,
            "power_factor": None,
            "valid": False,
            "status": "OFFLINE"
        }

    def set_clean_frame(self, jpeg_bytes: bytes, fps: float = 0.0):
        """Stores the latest clean raw video frame for CCTV streaming."""
        with self._lock:
            self.latest_clean_jpeg = jpeg_bytes
            self.camera_online = True
            if fps > 0:
                self.camera_fps = round(fps, 1)
            self.last_frame_timestamp = time.time()

    def get_clean_frame(self) -> Optional[bytes]:
        """Retrieves the latest clean raw video frame."""
        with self._lock:
            # Check if camera frame has timed out (> 3 seconds)
            if time.time() - self.last_frame_timestamp > 3.0 and self.latest_clean_jpeg is not None:
                self.camera_online = False
            return self.latest_clean_jpeg

    def update_vision_state(
        self,
        zone_states: Dict[str, Any],
        people: List[Dict[str, Any]],
        fps: float = 0.0,
        camera_online: bool = True
    ):
        """Updates automation state from the vision controller pipeline."""
        with self._lock:
            self.camera_online = camera_online
            if fps > 0:
                self.camera_fps = round(fps, 1)

            # Process people list
            self.people = []
            for p in people:
                self.people.append({
                    "id": p.get("tracking_id", p.get("id", 0)),
                    "zone": p.get("zone"),
                    "hands": p.get("stable_hand_count", p.get("hands", 0)),
                    "mode": p.get("mode", "AUTO"),
                    "gesture": p.get("gesture", "NONE"),
                    "position": p.get("position", [0.0, 0.0])
                })
            self.people_count = len(self.people)

            # Process 9 zones
            for i in range(1, 10):
                zid = f"Z{i}"
                zdata = zone_states.get(zid, {})
                occupied = bool(zdata.get("occupied", False))
                occupants = zdata.get("occupants", zdata.get("occupant_ids", []))
                light_state = "ON" if (zdata.get("light_state") is True or zdata.get("light_state") == "ON" or zdata.get("light_bool") is True) else "OFF"
                mode = zdata.get("mode", "AUTO")

                self.zones[zid] = {
                    "occupied": occupied,
                    "occupant_count": len(occupants) if isinstance(occupants, list) else (1 if occupied else 0),
                    "device": self.zone_device_mapping.get(zid, None),
                    "state": light_state,
                    "mode": mode
                }

            # Update appliances based on zones
            z2_state = self.zones.get("Z2", {}).get("state", "OFF")
            z8_state = self.zones.get("Z8", {}).get("state", "OFF")
            self.appliances["light1"] = z2_state
            self.appliances["light2"] = z8_state

            # If ESP32 mirror is active
            if not self.esp32["online"]:
                self.esp32["relay1"] = z2_state
                self.esp32["relay2"] = z8_state

    def update_hardware_state(
        self,
        esp32_summary: Optional[Dict[str, Any]] = None,
        pzem_data: Optional[Dict[str, Any]] = None
    ):
        """Updates real hardware link states from the ESP32 bridge."""
        with self._lock:
            if esp32_summary:
                self.esp32["online"] = bool(esp32_summary.get("online", False))
                self.esp32["port"] = esp32_summary.get("port", "AUTO")
                self.esp32["relay1"] = esp32_summary.get("relay1", self.appliances["light1"])
                self.esp32["relay2"] = esp32_summary.get("relay2", self.appliances["light2"])

            if pzem_data:
                self.pzem["measured_device"] = pzem_data.get("measured_device", self.pzem["measured_device"])
                self.pzem["measured_zone"] = pzem_data.get("measured_zone", self.pzem["measured_zone"])
                self.pzem["voltage"] = pzem_data.get("voltage")
                self.pzem["current"] = pzem_data.get("current")
                self.pzem["power"] = pzem_data.get("power")
                self.pzem["energy"] = pzem_data.get("energy")
                self.pzem["frequency"] = pzem_data.get("frequency")
                self.pzem["power_factor"] = pzem_data.get("power_factor", pzem_data.get("pf"))
                self.pzem["valid"] = bool(pzem_data.get("valid", False))
                self.pzem["status"] = pzem_data.get("status", "ONLINE" if self.pzem["valid"] else "OFFLINE")

    def get_full_lab_status(self) -> Dict[str, Any]:
        """
        Constructs the clean, unified JSON structure requested by the user and their friend.
        """
        with self._lock:
            # Sync with zone_service if present and no vision override
            if self.zone_service and not self.camera_online:
                for zid in list(self.zones.keys()):
                    z = self.zone_service.get_zone(zid)
                    if z:
                        self.zones[zid] = {
                            "occupied": z.occupied,
                            "occupant_count": z.occupant_count,
                            "device": self.zone_device_mapping.get(zid, None),
                            "state": z.light_state,
                            "mode": z.mode
                        }
                self.appliances["light1"] = self.zones.get("Z2", {}).get("state", "OFF")
                self.appliances["light2"] = self.zones.get("Z8", {}).get("state", "OFF")

            return {
                "camera": {
                    "online": self.camera_online,
                    "fps": self.camera_fps,
                    "cctv_stream_url": "/api/cctv/stream"
                },
                "people_count": self.people_count,
                "people": list(self.people),
                "zones": dict(self.zones),
                "appliances": dict(self.appliances),
                "esp32": dict(self.esp32),
                "pzem": dict(self.pzem),
                "timestamp": round(time.time(), 3)
            }
