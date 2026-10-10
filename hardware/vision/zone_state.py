"""
Independent state manager for physical laboratory zones (Z1 to Z9).
Enforces deterministic multi-person priority arbitration and non-blocking vacancy delay timers (10.0s).
"""

import time
from typing import List, Optional, Dict, Any
from vision.person_state import PersonState

# Configurable Real-time Vacancy Grace Period (Requirement: 10.0 seconds)
VACANCY_GRACE_PERIOD: float = 10.0


class ZoneState:
    """
    Manages appliances, occupancy lifecycle, manual overrides, and
    non-blocking vacancy countdown for one zone.
    
    Priority Resolution (Requirement 10):
        MANUAL_ON > MANUAL_OFF > AUTO
    """

    def __init__(self, zone_id: str, name: str = "", leave_timeout_sec: float = VACANCY_GRACE_PERIOD):
        self.zone_id: str = zone_id
        self.name: str = name or f"Zone {zone_id}"
        self.leave_timeout_sec: float = leave_timeout_sec
        
        # Physical presence indicators
        self.occupied: bool = False
        self.occupancy_state: str = "EMPTY"  # "OCCUPIED" or "EMPTY"
        self.light_state: bool = False       # True = ON, False = OFF
        self.fan_state: bool = False         # True = ON, False = OFF
        self.fan_speed: int = 0              # 0 to 100%
        self.mode: str = "AUTO"              # "AUTO", "MANUAL_OFF", "MANUAL_ON"
        self.manual_override: bool = False
        
        # Real-time non-blocking vacancy timer (10-second grace period)
        self.vacancy_timer_active: bool = False
        self.vacancy_start_time: float = 0.0
        self.vacancy_remaining_seconds: float = 0.0
        
        # Timing
        self.last_occupied_time: float = 0.0
        self.current_occupant_ids: List[int] = []
        
        # Last state change timestamp
        self.last_state_change: float = time.time()

    def update(self, occupants: List[PersonState], current_time: Optional[float] = None) -> bool:
        """
        Evaluate current occupants and apply state transitions with a non-blocking
        10-second vacancy timer when empty.
        
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
            # =================================================================
            # 1. PERSON IS PRESENT IN THIS ZONE
            # =================================================================
            self.occupied = True
            self.occupancy_state = "OCCUPIED"
            self.last_occupied_time = current_time

            # Cancel any running vacancy timer immediately
            self.vacancy_timer_active = False
            self.vacancy_remaining_seconds = 0.0

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
            # =================================================================
            # 2. NO OCCUPANTS CURRENTLY DETECTED IN THIS ZONE
            # =================================================================
            self.occupied = False
            self.occupancy_state = "EMPTY"

            # Check if appliances were ON, or manual override was active, or timer already running
            if self.light_state or self.fan_state or self.manual_override or self.vacancy_timer_active:
                if not self.vacancy_timer_active:
                    # Person just left -> START the 10-second vacancy timer
                    self.vacancy_timer_active = True
                    self.vacancy_start_time = self.last_occupied_time if self.last_occupied_time > 0 else current_time

                time_vacant = current_time - self.vacancy_start_time
                remaining = self.leave_timeout_sec - time_vacant

                if remaining > 0.0:
                    # Still within the 10.0-second vacancy window:
                    # KEEP APPLIANCES IN EXISTING STATE (DO NOT TURN OFF YET)
                    self.vacancy_remaining_seconds = max(0.0, remaining)
                else:
                    # COMPLETE 10 SECONDS HAVE ELAPSED WHILE EMPTY:
                    # Turn physical appliances OFF and reset zone to AUTO
                    self.vacancy_timer_active = False
                    self.vacancy_remaining_seconds = 0.0
                    self.light_state = False
                    self.fan_state = False
                    self.fan_speed = 0
                    self.mode = "AUTO"
                    self.manual_override = False
            else:
                # Zone is already empty and OFF
                self.vacancy_timer_active = False
                self.vacancy_remaining_seconds = 0.0
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
        if state:
            self.vacancy_timer_active = False
            self.vacancy_remaining_seconds = 0.0

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
            "vacancy_timer_active": self.vacancy_timer_active,
            "vacancy_remaining_seconds": round(self.vacancy_remaining_seconds, 1),
            "last_occupied_time": round(self.last_occupied_time, 2)
        }
