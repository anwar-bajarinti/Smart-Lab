"""
Unit tests for multi-person tracking and complete cross-zone isolation.
"""

import numpy as np
import pytest
from vision.zone_manager import ZoneManager
from vision.occupancy_manager import OccupancyManager


def test_multiple_people_different_zones_isolation():
    """
    Test Requirement 7:
    Person 1: ID=1, Zone=Z2, Hands=1 -> Z2: Light OFF, Fan OFF, MANUAL_OFF
    Person 2: ID=2, Zone=Z8, Hands=2 -> Z8: Light ON, Fan ON, MANUAL_ON
    ALL OTHER ZONES: UNCHANGED / OFF
    One person's gesture must NEVER control another person's zone!
    """
    zm = ZoneManager()
    mgr = OccupancyManager(zone_manager=zm, leave_timeout_sec=2.5, gesture_stability_sec=0.5)

    w, h = 1200, 900
    # Coordinates:
    # Z2 center: col 1 (x=600), row 0 (y=150)
    # Z8 center: col 1 (x=600), row 2 (y=750)
    z2_pos = (600, 150)
    z8_pos = (600, 750)

    # Frame 1: Person 1 in Z2 with 1 hand raised; Person 2 in Z8 with 2 hands raised
    def make_person_kpts(center_x, center_y, left_up=False, right_up=False):
        k = np.zeros((17, 3), dtype=np.float32)
        k[:, 2] = 0.95
        # Shoulders
        k[5] = [center_x - 25, center_y - 60, 0.95]
        k[6] = [center_x + 25, center_y - 60, 0.95]
        # Hips
        k[11] = [center_x - 20, center_y - 20, 0.95]
        k[12] = [center_x + 20, center_y - 20, 0.95]
        # Ankles
        k[15] = [center_x - 15, center_y, 0.95]
        k[16] = [center_x + 15, center_y, 0.95]
        # Left arm
        if left_up:
            k[7] = [center_x - 30, center_y - 90, 0.95]
            k[9] = [center_x - 35, center_y - 130, 0.95]
        else:
            k[7] = [center_x - 30, center_y - 40, 0.95]
            k[9] = [center_x - 30, center_y - 15, 0.95]
        # Right arm
        if right_up:
            k[8] = [center_x + 30, center_y - 90, 0.95]
            k[10] = [center_x + 35, center_y - 130, 0.95]
        else:
            k[8] = [center_x + 30, center_y - 40, 0.95]
            k[10] = [center_x + 30, center_y - 15, 0.95]
        return k

    kpts_1hand = make_person_kpts(z2_pos[0], z2_pos[1], left_up=True, right_up=False)
    kpts_2hands = make_person_kpts(z8_pos[0], z8_pos[1], left_up=True, right_up=True)

    detections = [
        {
            "tracking_id": 1,
            "bbox": (z2_pos[0] - 40, z2_pos[1] - 150, z2_pos[0] + 40, z2_pos[1]),
            "keypoints": kpts_1hand
        },
        {
            "tracking_id": 2,
            "bbox": (z8_pos[0] - 40, z8_pos[1] - 150, z8_pos[0] + 40, z8_pos[1]),
            "keypoints": kpts_2hands
        }
    ]

    t0 = 100.0
    # Step 1: Initial detection
    mgr.process_frame_detections(detections, w, h, current_time=t0)
    
    # Step 2: Hold stable for 0.6s (> 0.5s stability duration)
    mgr.process_frame_detections(detections, w, h, current_time=t0 + 0.6)

    zones = mgr.zones

    # Verify Z2: MANUAL_OFF -> Light OFF, Fan OFF
    assert zones["Z2"].occupied is True
    assert zones["Z2"].mode == "MANUAL_OFF"
    assert zones["Z2"].light_state is False
    assert zones["Z2"].fan_state is False

    # Verify Z8: MANUAL_ON -> Light ON, Fan ON
    assert zones["Z8"].occupied is True
    assert zones["Z8"].mode == "MANUAL_ON"
    assert zones["Z8"].light_state is True
    assert zones["Z8"].fan_state is True

    # Verify ALL OTHER ZONES: EMPTY and OFF
    for zid in ["Z1", "Z3", "Z4", "Z5", "Z6", "Z7", "Z9"]:
        assert zones[zid].occupied is False
        assert zones[zid].light_state is False
        assert zones[zid].fan_state is False
        assert zones[zid].mode == "AUTO"
