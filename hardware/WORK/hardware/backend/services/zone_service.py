"""
Zone Management Service.
Centralizes laboratory appliance states, API overrides,
and automatic ESP32 relay/dimmer dispatching.
"""

import json
import os
import time
from typing import Dict, List, Optional, Any

from backend.models.schemas import ZoneInfo
from backend.services.esp32_client import ESP32Client


class ZoneService:
    """
    State manager and hardware dispatcher for all 9 lab zones.
    """

    def __init__(self, zones_config_path: str = "config/zones.json", esp32_client: Optional[ESP32Client] = None):
        self.zones_config_path = zones_config_path
        self.esp32_client = esp32_client or ESP32Client()
        self.zones: Dict[str, ZoneInfo] = {}
        
        self._load_zones_config()

    def _load_zones_config(self):
        """Loads default zone structure and hardware mappings from config."""
        if os.path.exists(self.zones_config_path):
            try:
                with open(self.zones_config_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for z in data.get("zones", []):
                        zid = z["id"]
                        self.zones[zid] = ZoneInfo(
                            zone_id=zid,
                            name=z.get("name", f"Zone {zid}"),
                            row=z.get("row", 0),
                            col=z.get("col", 0),
                            appliances=z.get("appliances", {})
                        )
                    return
            except Exception as e:
                print(f"[ZoneService] Error reading {self.zones_config_path}: {e}")

        # Fallback default 9 zones
        for r in range(3):
            for c in range(3):
                zid = f"Z{r * 3 + c + 1}"
                self.zones[zid] = ZoneInfo(
                    zone_id=zid,
                    name=f"Zone {zid}",
                    row=r,
                    col=c
                )

    def get_all_zones(self) -> List[Dict[str, Any]]:
        """Returns all 9 zones serialized as dictionaries."""
        return [z.to_dict() for z in self.zones.values()]

    def get_zone(self, zone_id: str) -> Optional[ZoneInfo]:
        """Returns a single zone by ID (e.g. 'Z1')."""
        return self.zones.get(zone_id.upper())

    def set_light(self, zone_id: str, state: bool, source: str = "api") -> Dict[str, Any]:
        """
        Switches a zone light ON or OFF and commands the corresponding hardware relay.
        """
        zid = zone_id.upper()
        if zid not in self.zones:
            return {"error": f"Zone {zone_id} not found", "success": False}

        zone = self.zones[zid]
        zone.light_state = "ON" if state else "OFF"
        
        if source == "api":
            zone.manual_override = True
            zone.mode = "MANUAL_ON" if state else "MANUAL_OFF"

        # Hardware dispatch
        light_appliance = zone.appliances.get("light", {})
        relay_id = light_appliance.get("relay_id")

        hw_result = None
        if relay_id is not None:
            hw_result = self.esp32_client.send_relay_command(relay_id=relay_id, state=state)

        return {
            "success": True,
            "zone_id": zid,
            "light_state": zone.light_state,
            "mode": zone.mode,
            "source": source,
            "hardware_result": hw_result
        }

    def set_fan(
        self,
        zone_id: str,
        state: bool,
        speed: Optional[int] = None,
        source: str = "api"
    ) -> Dict[str, Any]:
        """
        Switches a zone fan ON or OFF and sets speed on dimmer hardware.
        """
        zid = zone_id.upper()
        if zid not in self.zones:
            return {"error": f"Zone {zone_id} not found", "success": False}

        zone = self.zones[zid]
        zone.fan_state = "ON" if state else "OFF"

        if speed is not None:
            zone.fan_speed = max(0, min(100, speed))
        elif state and zone.fan_speed == 0:
            zone.fan_speed = 70
        elif not state:
            zone.fan_speed = 0

        if source == "api":
            zone.manual_override = True
            zone.mode = "MANUAL_ON" if state else "MANUAL_OFF"

        # Hardware dispatch
        fan_appliance = zone.appliances.get("fan", {})
        relay_id = fan_appliance.get("relay_id")
        dimmer_ch = fan_appliance.get("dimmer_channel")

        hw_relay_res = None
        hw_dimmer_res = None

        if relay_id is not None:
            hw_relay_res = self.esp32_client.send_relay_command(relay_id=relay_id, state=state)

        if dimmer_ch is not None and state:
            hw_dimmer_res = self.esp32_client.send_dimmer_command(channel=dimmer_ch, speed_percent=zone.fan_speed)

        return {
            "success": True,
            "zone_id": zid,
            "fan_state": zone.fan_state,
            "fan_speed": zone.fan_speed,
            "mode": zone.mode,
            "source": source,
            "hardware_relay": hw_relay_res,
            "hardware_dimmer": hw_dimmer_res
        }

    def sync_from_vision(self, zone_states_dict: Dict[str, Any]):
        """
        Synchronizes zone telemetry generated by the computer vision subsystem.
        Automatically updates appliance relay states and dimmers if changed.
        """
        for zid, vstate in zone_states_dict.items():
            if zid in self.zones:
                zone = self.zones[zid]
                prev_light = (zone.light_state == "ON")
                prev_fan = (zone.fan_state == "ON")

                new_light_on = (vstate.get("light_state") == "ON" or vstate.get("light_bool") is True)
                new_fan_on = (vstate.get("fan_state") == "ON" or vstate.get("fan_bool") is True)

                zone.occupied = vstate.get("occupied", False)
                zone.occupancy_state = vstate.get("occupancy_state", "EMPTY")
                zone.mode = vstate.get("mode", "AUTO")
                zone.manual_override = vstate.get("manual_override", False)
                zone.occupant_count = vstate.get("occupant_count", 0)
                zone.occupant_ids = vstate.get("occupant_ids", [])
                
                # If vision toggled light, dispatch to ESP32
                if new_light_on != prev_light:
                    self.set_light(zid, new_light_on, source="vision")

                # If vision toggled fan, dispatch to ESP32
                if new_fan_on != prev_fan:
                    speed = vstate.get("fan_speed", 70 if new_fan_on else 0)
                    self.set_fan(zid, new_fan_on, speed=speed, source="vision")

    def get_system_summary(self) -> Dict[str, Any]:
        """Provides an aggregated health and status snapshot of the entire laboratory."""
        total_zones = len(self.zones)
        occupied_count = sum(1 for z in self.zones.values() if z.occupied)
        lights_on = sum(1 for z in self.zones.values() if z.light_state == "ON")
        fans_on = sum(1 for z in self.zones.values() if z.fan_state == "ON")
        manual_override_count = sum(1 for z in self.zones.values() if z.manual_override)

        return {
            "total_zones": total_zones,
            "occupied_zones": occupied_count,
            "lights_active": lights_on,
            "fans_active": fans_on,
            "manual_overrides": manual_override_count,
            "esp32_connected": self.esp32_client.is_connected,
            "mock_hardware_mode": self.esp32_client.mock_hardware,
            "timestamp": time.time()
        }
