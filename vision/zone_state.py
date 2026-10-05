"""
Independent state manager for physical laboratory zones (Z1 to Z9).
Enforces deterministic multi-person priority arbitration and vacancy delay timers.
"""

import time
from typing import List, Optional, Dict, Any
from vision.person_state import PersonState


class ZoneState:
    """
    Manages appliances, occupancy lifecycle, and manual overrides for one zone.
    
    Priority Resolution (Requirement 10):
        MANUAL_ON > MANUAL_OFF > AUTO
    """

    def __init__(self, zone_id: str, name: str = "", leave_timeout_sec: float = 2.5):
        self.zone_id: str = zone_id
        self.name: str = name or f"Zone {zone_id}"
        self.leave_timeout_sec: float = leave_timeout_sec
        
        # State indicators
        self.occupied: bool = False
        self.occupancy_state: str = "EMPTY"  # "OCCUPIED" or "EMPTY"
        self.light_state: bool = False       # True = ON, False = OFF
        self.fan_state: bool = False         # True = ON, False = OFF
        self.fan_speed: int = 0              # 0 to 100%
        self.mode: str = "AUTO"              # "AUTO", "MANUAL_OFF", "MANUAL_ON"
        self.manual_override: bool = False
        
        # Timing
        self.last_occupied_time: float = 0.0
        self.current_occupant_ids: List[int] = []
        
        # Last state change timestamp
        self.last_state_change: float = time.time()

    def update(self, occupants: List[PersonState], current_time: Optional[float] = None) -> bool:
        """
        Evaluate current occupants and apply state transitions.
        
        Returns:
            bool: True if an appliance state or mode changed in this frame, False otherwise.
        """
        if current_time is None:
            current_time = time.time()

        old_light = self.light_state
        old_fan = self.fan_state
        old_mode = self.mode
        old_occupancy = self.occupancy_state

        self.current_occupant_ids = [p.tracking_id for p in occupants]

        if occupants:
            # At least one person is currently physically in the zone
            self.occupied = True
            self.occupancy_state = "OCCUPIED"
            self.last_occupied_time = current_time

            # Multi-person arbitration logic: MANUAL_ON > MANUAL_OFF > AUTO
            has_manual_on = any(p.mode == "MANUAL_ON" for p in occupants)
            has_manual_off = any(p.mode == "MANUAL_OFF" for p in occupants)

            if has_manual_on:
                self.mode = "MANUAL_ON"
                self.manual_override = True
                self.light_state = True
                self.fan_state = True
                if self.fan_speed == 0:
                    self.fan_speed = 75
            elif has_manual_off:
                self.mode = "MANUAL_OFF"
                self.manual_override = True
                self.light_state = False
                self.fan_state = False
            else:
                # Everyone is in AUTO
                self.mode = "AUTO"
                self.manual_override = False
                self.light_state = True
                self.fan_state = True
                if self.fan_speed == 0:
                    self.fan_speed = 60

        else:
            # Nobody currently detected in this zone
            if self.occupied:
                # Check leave timeout (2-3 seconds grace period)
                time_since_last_seen = current_time - self.last_occupied_time
                if time_since_last_seen >= self.leave_timeout_sec:
                    # Timeout reached: clear zone
                    self.occupied = False
                    self.occupancy_state = "EMPTY"
                    self.light_state = False
                    self.fan_state = False
                    self.fan_speed = 0
                    self.mode = "AUTO"
                    self.manual_override = False
                else:
                    # Inside grace period: keep existing states running
                    pass
            else:
                # Remains EMPTY
                self.occupancy_state = "EMPTY"
                self.light_state = False
                self.fan_state = False
                self.fan_speed = 0
                self.mode = "AUTO"
                self.manual_override = False

        changed = (
            old_light != self.light_state or
            old_fan != self.fan_state or
            old_mode != self.mode or
            old_occupancy != self.occupancy_state
        )

        if changed:
            self.last_state_change = current_time

        return changed

    def manual_set_light(self, state: bool):
        """Web/Manual override for light."""
        self.light_state = state
        self.manual_override = True
        self.mode = "MANUAL_ON" if state else "MANUAL_OFF"
        self.last_state_change = time.time()

    def manual_set_fan(self, state: bool, speed: Optional[int] = None):
        """Web/Manual override for fan."""
        self.fan_state = state
        if speed is not None:
            self.fan_speed = max(0, min(100, speed))
        elif state and self.fan_speed == 0:
            self.fan_speed = 70
        elif not state:
            self.fan_speed = 0
        self.manual_override = True
        self.mode = "MANUAL_ON" if state else "MANUAL_OFF"
        self.last_state_change = time.time()

    def to_dict(self) -> Dict[str, Any]:
        """Serialize zone state for API and status panel."""
        return {
            "zone_id": self.zone_id,
            "name": self.name,
            "occupied": self.occupied,
            "occupancy_state": self.occupancy_state,
            "light_state": "ON" if self.light_state else "OFF",
            "light_bool": self.light_state,
            "fan_state": "ON" if self.fan_state else "OFF",
            "fan_bool": self.fan_state,
            "fan_speed": self.fan_speed,
            "mode": self.mode,
            "manual_override": self.manual_override,
            "occupant_count": len(self.current_occupant_ids),
            "occupant_ids": self.current_occupant_ids,
            "last_occupied_time": round(self.last_occupied_time, 2)
        }
