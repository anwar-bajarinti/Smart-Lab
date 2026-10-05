"""
Occupancy Manager coordinating multi-person spatial assignments,
zone state machines, delay timers, and deterministic priority arbitration.
"""

import time
from typing import Dict, List, Optional, Tuple, Any
import numpy as np

from vision.person_state import PersonState
from vision.zone_state import ZoneState
from vision.zone_manager import ZoneManager
from vision.pose_detector import PoseDetector
from vision.gesture_detector import GestureDetector


class OccupancyManager:
    """
    Core orchestrator linking vision detections, person tracking, and zone appliances.
    """

    def __init__(
        self,
        zone_manager: ZoneManager,
        leave_timeout_sec: float = 2.5,
        gesture_stability_sec: float = 0.8,
        person_timeout_sec: float = 2.0
    ):
        self.zone_manager = zone_manager
        self.leave_timeout_sec = leave_timeout_sec
        self.gesture_stability_sec = gesture_stability_sec
        self.person_timeout_sec = person_timeout_sec

        self.pose_detector = PoseDetector()
        self.gesture_detector = GestureDetector()

        # Independent states per person and per zone
        self.people: Dict[int, PersonState] = {}
        self.zones: Dict[str, ZoneState] = {}

        # Initialize all 9 zones (Z1 to Z9)
        for i in range(1, 10):
            zid = f"Z{i}"
            meta = self.zone_manager.zones_metadata.get(zid, {})
            name = meta.get("name", f"Zone {zid}")
            self.zones[zid] = ZoneState(zid, name=name, leave_timeout_sec=leave_timeout_sec)

        # Callbacks for appliance state changes
        self._on_zone_change_callbacks: List[Any] = []

    def register_change_callback(self, callback):
        """Register a callback function to be called when any zone state changes."""
        self._on_zone_change_callbacks.append(callback)

    def process_frame_detections(
        self,
        detections: List[Dict[str, Any]],
        frame_w: int,
        frame_h: int,
        current_time: Optional[float] = None
    ) -> List[Dict[str, Any]]:
        """
        Process tracker outputs for the current frame.
        
        Args:
            detections: List of dicts, each containing:
                - 'tracking_id': int
                - 'bbox': (x1, y1, x2, y2)
                - 'keypoints': ndarray (17, 2) or (17, 3)
            frame_w: Current frame width in pixels
            frame_h: Current frame height in pixels
            current_time: Optional mock timestamp for deterministic testing
            
        Returns:
            List of state change events that occurred in this update cycle.
        """
        if current_time is None:
            current_time = time.time()

        seen_ids = set()

        for det in detections:
            track_id = det["tracking_id"]
            bbox = det["bbox"]
            keypoints = det["keypoints"]
            seen_ids.add(track_id)

            # 1. Retrieve or create independent PersonState
            if track_id not in self.people:
                self.people[track_id] = PersonState(
                    tracking_id=track_id,
                    stability_duration_sec=self.gesture_stability_sec,
                    current_time=current_time
                )
            person = self.people[track_id]

            # 2. Determine physical floor position (ankles or fallback)
            floor_pos, pos_source = self.pose_detector.get_floor_position(keypoints, bbox)
            person.update_position(floor_pos, pos_source, bbox)

            # 3. Determine zone based on floor position
            zone_id = self.zone_manager.get_zone_for_point(floor_pos[0], floor_pos[1], frame_w, frame_h)
            person.update_zone(zone_id, current_time=current_time)

            # 4. Biomechanical gesture evaluation
            torso_scale = self.pose_detector.get_torso_scale(keypoints, bbox)
            raw_count, gesture_name, _ = self.gesture_detector.detect_gestures(keypoints, torso_scale)

            # 5. Temporal stability debounce
            person.update_gestures(raw_count, current_time)

        # 6. Purge stale persons not seen recently
        stale_ids = [
            pid for pid, p in self.people.items()
            if (current_time - p.last_seen) > self.person_timeout_sec and pid not in seen_ids
        ]
        for pid in stale_ids:
            del self.people[pid]

        # 7. Group active occupants by zone (only persons physically detected in current frame)
        zone_occupants: Dict[str, List[PersonState]] = {zid: [] for zid in self.zones}
        for pid, person in self.people.items():
            if pid in seen_ids and person.zone and person.zone in zone_occupants:
                zone_occupants[person.zone].append(person)

        # 8. Update each zone independently and collect state changes
        changes = []
        for zid, zone in self.zones.items():
            occupants = zone_occupants.get(zid, [])
            changed = zone.update(occupants, current_time)
            if changed:
                change_event = {
                    "zone_id": zid,
                    "light": zone.light_state,
                    "fan": zone.fan_state,
                    "fan_speed": zone.fan_speed,
                    "mode": zone.mode,
                    "occupancy": zone.occupancy_state,
                    "timestamp": current_time
                }
                changes.append(change_event)
                for cb in self._on_zone_change_callbacks:
                    try:
                        cb(change_event)
                    except Exception as ex:
                        print(f"[OccupancyManager] Callback error: {ex}")

        return changes

    def get_zone_states_dict(self) -> Dict[str, Dict[str, Any]]:
        """Return serialized state of all 9 zones."""
        return {zid: z.to_dict() for zid, z in self.zones.items()}

    def get_people_dict(self) -> List[Dict[str, Any]]:
        """Return serialized state of all active people."""
        return [p.to_dict() for p in self.people.values()]
