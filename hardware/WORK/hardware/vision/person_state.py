"""
Independent state tracker for an individual person detected by the vision system.
Ensures zero cross-contamination between different people or different zones.
"""

import time
from typing import Optional, Tuple


class PersonState:
    """
    Encapsulates the complete tracking and operational state for a single person.
    
    Attributes:
        tracking_id: Unique ID assigned by the tracker.
        zone: Current zone identifier (e.g. 'Z1'..'Z9') or None if outside grid.
        position: Estimated floor coordinate (x, y) in pixel space.
        position_source: Method used to compute position ('ankles_midpoint' or 'bbox_bottom_center').
        raw_hand_count: Instantaneous number of raised hands in current frame (0, 1, 2).
        stable_hand_count: Debounced, confirmed number of raised hands.
        gesture: Named gesture ('NONE', 'ONE_HAND_RAISED', 'TWO_HANDS_RAISED').
        mode: Person's requested zone control mode ('AUTO', 'MANUAL_OFF', 'MANUAL_ON').
        last_seen: Unix timestamp of the last frame this person was observed.
        occupancy: Always 'OCCUPIED' while tracked.
    """

    def __init__(self, tracking_id: int, stability_duration_sec: float = 0.8, current_time: Optional[float] = None):
        self.tracking_id = tracking_id
        self.zone: Optional[str] = None
        self.position: Tuple[float, float] = (0.0, 0.0)
        self.position_source: str = "bbox_bottom_center"
        self.bbox: Tuple[float, float, float, float] = (0.0, 0.0, 0.0, 0.0)
        
        self.raw_hand_count: int = 0
        self.stable_hand_count: int = 0
        self.gesture: str = "NONE"
        self.mode: str = "AUTO"
        
        now = current_time if current_time is not None else time.time()
        self.first_seen: float = now
        self.last_seen: float = now
        self.occupancy: str = "OCCUPIED"
        
        # Stability / Debounce tracking
        self.stability_duration_sec: float = stability_duration_sec
        self._candidate_hand_count: int = 0
        self._candidate_start_time: float = now

    def update_position(self, position: Tuple[float, float], source: str, bbox: Tuple[float, float, float, float]):
        """Update floor coordinates and bounding box."""
        self.position = position
        self.position_source = source
        self.bbox = bbox

    def update_zone(self, new_zone: Optional[str], current_time: Optional[float] = None):
        """
        Update the current zone for this person.
        
        CRITICAL ISOLATION RULE (Requirement 11):
        When a person transitions to a new zone, their manual override from the previous
        zone MUST NOT follow them. The mode resets to AUTO in the new zone.
        """
        now = current_time if current_time is not None else time.time()
        if new_zone != self.zone:
            self.zone = new_zone
            # Reset manual override state upon entering a new physical zone
            self.mode = "AUTO"
            self.gesture = "NONE"
            self.stable_hand_count = 0
            self._candidate_hand_count = 0
            self._candidate_start_time = now

    def update_gestures(self, raw_hand_count: int, current_time: Optional[float] = None):
        """
        Process the raw raised hand count with temporal debounce (0.7-1.0s).
        
        Gesture rules:
        - 1 hand stable (>= stability_duration_sec) -> MANUAL_OFF
        - 2 hands stable (>= stability_duration_sec) -> MANUAL_ON
        - 0 hands:
          If current mode is AUTO, remains AUTO.
          If current mode is MANUAL_OFF or MANUAL_ON, lowering hands to 0 DOES NOT
          revert to AUTO automatically; the person remains standing in the zone
          and the manual override remains active (Requirement 3).
        """
        if current_time is None:
            current_time = time.time()
            
        self.last_seen = current_time
        self.raw_hand_count = raw_hand_count

        # Check if the candidate gesture changed
        if raw_hand_count != self._candidate_hand_count:
            self._candidate_hand_count = raw_hand_count
            self._candidate_start_time = current_time
        else:
            # Candidate has been stable for some duration
            elapsed = current_time - self._candidate_start_time
            if elapsed >= self.stability_duration_sec:
                if self.stable_hand_count != self._candidate_hand_count:
                    self.stable_hand_count = self._candidate_hand_count
                    self._apply_gesture_transition(self.stable_hand_count)

    def _apply_gesture_transition(self, count: int):
        """Apply state transition based on the verified stable hand count."""
        if count == 1:
            self.gesture = "ONE_HAND_RAISED"
            self.mode = "MANUAL_OFF"
        elif count == 2:
            self.gesture = "TWO_HANDS_RAISED"
            self.mode = "MANUAL_ON"
        else:
            # count == 0
            self.gesture = "NONE"
            # Lowering hands to 0 does not destroy an active MANUAL override while
            # the person remains in the zone. If they were already in AUTO, they stay in AUTO.

    def to_dict(self) -> dict:
        """Serialize person state for logging, WebSocket, or API transfer."""
        return {
            "tracking_id": self.tracking_id,
            "zone": self.zone,
            "position": [round(self.position[0], 1), round(self.position[1], 1)],
            "position_source": self.position_source,
            "bbox": [round(v, 1) for v in self.bbox],
            "raw_hand_count": self.raw_hand_count,
            "stable_hand_count": self.stable_hand_count,
            "gesture": self.gesture,
            "mode": self.mode,
            "last_seen": round(self.last_seen, 2),
            "occupancy": self.occupancy
        }
