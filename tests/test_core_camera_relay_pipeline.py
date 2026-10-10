"""
End-to-end integration tests for the Core Camera -> 3x3 Zones -> Gesture -> Relay Pipeline.
Explicitly verifies the 8 core operational requirements requested by the user:
1. Person enters Z2 -> Light 1 ON
2. Person leaves Z2 -> Light 1 OFF after timeout
3. Person enters Z8 -> Light 2 ON
4. One hand in Z2 -> Light 1 OFF (MANUAL_OFF)
5. Two hands in Z2 -> Light 1 ON (MANUAL_ON)
6. Person in Z2 and another in Z8 -> both work independently
7. Gesture in Z2 must never affect Z8
8. Moving between zones must update control correctly
"""

import numpy as np
import pytest
from vision.zone_manager import ZoneManager
from vision.occupancy_manager import OccupancyManager
from vision.esp32_relay_bridge import ESP32RelayBridge


def test_relay_bridge_strict_mode_refuses_to_run_without_hardware(monkeypatch):
    """Strict hardware mode must fail closed instead of silently emulating.

    This guards the real startup path used by run_smart_lab.py, which must stop
    when the ESP32 cannot be opened on the configured COM port.
    """

    import serial

    monkeypatch.setattr("serial.tools.list_ports.comports", lambda: [])

    def fake_serial(*args, **kwargs):
        raise FileNotFoundError(2, "The system cannot find the file specified.", None, 2)

    monkeypatch.setattr(serial, "Serial", fake_serial)

    with pytest.raises(RuntimeError, match="real ESP32.*COM4|strict hardware"):
        ESP32RelayBridge(config_path="config/relay_mapping.json", port="COM4", strict_hardware=True)


def make_keypoints_for_zone(cx: float, cy: float, left_up: bool = False, right_up: bool = False) -> np.ndarray:
    """Generates standard 17 COCO keypoints centered at floor position (cx, cy)."""
    k = np.zeros((17, 3), dtype=np.float32)
    k[:, 2] = 0.95
    # Shoulders
    k[5] = [cx - 25, cy - 60, 0.95]
    k[6] = [cx + 25, cy - 60, 0.95]
    # Hips
    k[11] = [cx - 20, cy - 20, 0.95]
    k[12] = [cx + 20, cy - 20, 0.95]
    # Ankles (floor position)
    k[15] = [cx - 15, cy, 0.95]
    k[16] = [cx + 15, cy, 0.95]
    # Left arm
    if left_up:
        k[7] = [cx - 30, cy - 90, 0.95]
        k[9] = [cx - 35, cy - 130, 0.95]  # Wrist above shoulder
    else:
        k[7] = [cx - 30, cy - 40, 0.95]
        k[9] = [cx - 30, cy - 15, 0.95]
    # Right arm
    if right_up:
        k[8] = [cx + 30, cy - 90, 0.95]
        k[10] = [cx + 35, cy - 130, 0.95]  # Wrist above shoulder
    else:
        k[8] = [cx + 30, cy - 40, 0.95]
        k[10] = [cx + 30, cy - 15, 0.95]
    return k


class MockRelayBridge(ESP32RelayBridge):
    """Test subclass tracking physical relay switching events."""
    def __init__(self):
        super().__init__(config_path="config/relay_mapping.json")
        self.dispatched_commands = []

    def send_relay_command(self, relay_id: str, state: bool):
        self.dispatched_commands.append((relay_id, state))
        self.relay_states[relay_id] = state


@pytest.fixture
def lab_env():
    zm = ZoneManager(config_path="config/zones.json")
    mgr = OccupancyManager(zone_manager=zm, leave_timeout_sec=10.0, gesture_stability_sec=0.7)
    bridge = MockRelayBridge()
    # 1200x900 resolution
    w, h = 1200, 900
    # Z1 center: col 0, row 0 -> (200, 150)
    # Z9 center: col 2, row 2 -> (1000, 750)
    z1_pos = (200.0, 150.0)
    z9_pos = (1000.0, 750.0)
    return zm, mgr, bridge, w, h, z1_pos, z9_pos


def test_1_person_enters_z1_light1_on(lab_env):
    """Scenario 1: Person enters Z1 -> Light 1 (Relay 1) turns ON."""
    _, mgr, bridge, w, h, z1_pos, _ = lab_env
    kpts = make_keypoints_for_zone(z1_pos[0], z1_pos[1], left_up=False, right_up=False)
    detections = [{"tracking_id": 1, "bbox": (z1_pos[0]-40, z1_pos[1]-150, z1_pos[0]+40, z1_pos[1]), "keypoints": kpts}]

    mgr.process_frame_detections(detections, w, h, current_time=10.0)
    bridge.sync_zone_states(mgr.zones)

    assert mgr.zones["Z1"].occupied is True
    assert mgr.zones["Z1"].light_state is True
    assert bridge.relay_states["1"] is True  # Relay 1 (GPIO 22) is ON!


def test_2_person_leaves_z1_light1_off_after_timeout(lab_env):
    """
    Scenario 2: Person leaves Z1 ->
    - Zone becomes EMPTY immediately (occupied = False)
    - 10-second vacancy timer starts
    - At 5.0s empty: Light 1 MUST REMAIN ON, Relay 1 (GPIO 22) stays TRUE
    - At 10.1s empty: Light 1 turns OFF, Relay 1 (GPIO 22) turns FALSE.
    """
    _, mgr, bridge, w, h, z1_pos, _ = lab_env
    kpts = make_keypoints_for_zone(z1_pos[0], z1_pos[1], left_up=False, right_up=False)
    detections = [{"tracking_id": 1, "bbox": (z1_pos[0]-40, z1_pos[1]-150, z1_pos[0]+40, z1_pos[1]), "keypoints": kpts}]

    # Step 1: Person in Z1 at t = 10.0
    mgr.process_frame_detections(detections, w, h, current_time=10.0)
    bridge.sync_zone_states(mgr.zones)
    assert bridge.relay_states["1"] is True

    # Step 2: Person leaves, checked at t = 15.0 (5.0s after leave < 10.0s timeout)
    mgr.process_frame_detections([], w, h, current_time=15.0)
    bridge.sync_zone_states(mgr.zones)
    assert mgr.zones["Z1"].occupied is False
    assert mgr.zones["Z1"].occupancy_state == "EMPTY"
    assert mgr.zones["Z1"].vacancy_timer_active is True
    assert 4.9 <= mgr.zones["Z1"].vacancy_remaining_seconds <= 5.1
    assert mgr.zones["Z1"].light_state is True
    assert bridge.relay_states["1"] is True  # MUST REMAIN ON DURING 10s GRACE PERIOD!

    # Step 3: Checked at t = 20.1 (10.1s after leave >= 10.0s timeout)
    mgr.process_frame_detections([], w, h, current_time=20.1)
    bridge.sync_zone_states(mgr.zones)
    assert mgr.zones["Z1"].occupied is False
    assert mgr.zones["Z1"].vacancy_timer_active is False
    assert mgr.zones["Z1"].light_state is False
    assert bridge.relay_states["1"] is False  # Now Relay 1 (GPIO 22) turns OFF!


def test_2b_person_reenters_z1_cancels_10s_timer(lab_env):
    """
    Person leaves Z1, but re-enters within 10.0s:
    Vacancy timer cancelled, Light 1 remains ON continuously.
    """
    _, mgr, bridge, w, h, z1_pos, _ = lab_env
    kpts = make_keypoints_for_zone(z1_pos[0], z1_pos[1], left_up=False, right_up=False)
    detections = [{"tracking_id": 1, "bbox": (z1_pos[0]-40, z1_pos[1]-150, z1_pos[0]+40, z1_pos[1]), "keypoints": kpts}]

    # Enter Z1 at t = 10.0
    mgr.process_frame_detections(detections, w, h, current_time=10.0)
    bridge.sync_zone_states(mgr.zones)
    assert bridge.relay_states["1"] is True

    # Leaves at t = 10.0, checked at t = 15.0 (5.0s < 10.0s)
    mgr.process_frame_detections([], w, h, current_time=15.0)
    bridge.sync_zone_states(mgr.zones)
    assert mgr.zones["Z1"].vacancy_timer_active is True
    assert bridge.relay_states["1"] is True

    # Re-enters at t = 16.0 (6.0s < 10.0s)
    mgr.process_frame_detections(detections, w, h, current_time=16.0)
    bridge.sync_zone_states(mgr.zones)
    assert mgr.zones["Z1"].occupied is True
    assert mgr.zones["Z1"].vacancy_timer_active is False
    assert bridge.relay_states["1"] is True


def test_3_person_enters_z9_light2_on(lab_env):
    """Scenario 3: Person enters Z9 -> Light 2 (Relay 2) turns ON."""
    _, mgr, bridge, w, h, _, z9_pos = lab_env
    kpts = make_keypoints_for_zone(z9_pos[0], z9_pos[1], left_up=False, right_up=False)
    detections = [{"tracking_id": 2, "bbox": (z9_pos[0]-40, z9_pos[1]-150, z9_pos[0]+40, z9_pos[1]), "keypoints": kpts}]

    mgr.process_frame_detections(detections, w, h, current_time=20.0)
    bridge.sync_zone_states(mgr.zones)

    assert mgr.zones["Z9"].occupied is True
    assert mgr.zones["Z9"].light_state is True
    assert bridge.relay_states["2"] is True  # Relay 2 (GPIO 23) is ON!
    assert bridge.relay_states["1"] is False  # Relay 1 unaffected


def test_4_one_hand_in_z1_light1_off(lab_env):
    """
    Scenario 4: Person in Z1 raises 1 hand for >0.7s:
    Light 1 turns OFF (MANUAL_OFF) and stays OFF while person stands there.
    """
    _, mgr, bridge, w, h, z1_pos, _ = lab_env
    # 1 hand raised
    kpts_1hand = make_keypoints_for_zone(z1_pos[0], z1_pos[1], left_up=True, right_up=False)
    det = [{"tracking_id": 1, "bbox": (z1_pos[0]-40, z1_pos[1]-150, z1_pos[0]+40, z1_pos[1]), "keypoints": kpts_1hand}]

    t0 = 30.0
    # Initial detection (enters in AUTO)
    mgr.process_frame_detections(det, w, h, current_time=t0)
    bridge.sync_zone_states(mgr.zones)
    assert bridge.relay_states["1"] is True

    # Gesture held for 0.8s (> 0.7s debounce)
    mgr.process_frame_detections(det, w, h, current_time=t0 + 0.8)
    bridge.sync_zone_states(mgr.zones)

    assert mgr.zones["Z1"].mode == "MANUAL_OFF"
    assert mgr.zones["Z1"].light_state is False
    assert bridge.relay_states["1"] is False  # Relay 1 turned OFF!

    # Person lowers hand to 0 while remaining standing in Z1
    kpts_0hands = make_keypoints_for_zone(z1_pos[0], z1_pos[1], left_up=False, right_up=False)
    det_0 = [{"tracking_id": 1, "bbox": (z1_pos[0]-40, z1_pos[1]-150, z1_pos[0]+40, z1_pos[1]), "keypoints": kpts_0hands}]
    mgr.process_frame_detections(det_0, w, h, current_time=t0 + 2.0)
    bridge.sync_zone_states(mgr.zones)

    # Must REMAIN OFF!
    assert mgr.zones["Z1"].mode == "MANUAL_OFF"
    assert bridge.relay_states["1"] is False


def test_5_two_hands_in_z1_light1_on(lab_env):
    """
    Scenario 5: Person in Z1 raises 2 hands:
    Overrides previous MANUAL_OFF and turns Light 1 ON (MANUAL_ON).
    """
    _, mgr, bridge, w, h, z1_pos, _ = lab_env
    kpts_1hand = make_keypoints_for_zone(z1_pos[0], z1_pos[1], left_up=True, right_up=False)
    det_1 = [{"tracking_id": 1, "bbox": (z1_pos[0]-40, z1_pos[1]-150, z1_pos[0]+40, z1_pos[1]), "keypoints": kpts_1hand}]

    t0 = 40.0
    # First set MANUAL_OFF
    mgr.process_frame_detections(det_1, w, h, current_time=t0)
    mgr.process_frame_detections(det_1, w, h, current_time=t0 + 0.8)
    bridge.sync_zone_states(mgr.zones)
    assert bridge.relay_states["1"] is False

    # Now raise 2 hands
    kpts_2hands = make_keypoints_for_zone(z1_pos[0], z1_pos[1], left_up=True, right_up=True)
    det_2 = [{"tracking_id": 1, "bbox": (z1_pos[0]-40, z1_pos[1]-150, z1_pos[0]+40, z1_pos[1]), "keypoints": kpts_2hands}]
    mgr.process_frame_detections(det_2, w, h, current_time=t0 + 1.0)
    mgr.process_frame_detections(det_2, w, h, current_time=t0 + 1.85)
    bridge.sync_zone_states(mgr.zones)

    # Overrides to MANUAL_ON!
    assert mgr.zones["Z1"].mode == "MANUAL_ON"
    assert mgr.zones["Z1"].light_state is True
    assert bridge.relay_states["1"] is True  # Relay 1 turned ON!


def test_6_and_7_multi_person_independence_and_no_cross_zone(lab_env):
    """
    Scenario 6 & 7:
    Person 1 in Z1 raises 1 hand -> Relay 1 OFF
    Person 2 in Z9 raises 2 hands -> Relay 2 ON
    Both operate simultaneously and independently.
    Gesture in Z1 NEVER affects Relay 2 / Z9!
    """
    _, mgr, bridge, w, h, z1_pos, z9_pos = lab_env
    kpts_p1 = make_keypoints_for_zone(z1_pos[0], z1_pos[1], left_up=True, right_up=False)
    kpts_p2 = make_keypoints_for_zone(z9_pos[0], z9_pos[1], left_up=True, right_up=True)

    detections = [
        {"tracking_id": 1, "bbox": (z1_pos[0]-40, z1_pos[1]-150, z1_pos[0]+40, z1_pos[1]), "keypoints": kpts_p1},
        {"tracking_id": 2, "bbox": (z9_pos[0]-40, z9_pos[1]-150, z9_pos[0]+40, z9_pos[1]), "keypoints": kpts_p2}
    ]

    t0 = 50.0
    mgr.process_frame_detections(detections, w, h, current_time=t0)
    mgr.process_frame_detections(detections, w, h, current_time=t0 + 0.8)
    bridge.sync_zone_states(mgr.zones)

    # Z1 (Person 1, 1 hand): MANUAL_OFF -> Relay 1 is OFF
    assert mgr.zones["Z1"].mode == "MANUAL_OFF"
    assert bridge.relay_states["1"] is False

    # Z9 (Person 2, 2 hands): MANUAL_ON -> Relay 2 is ON
    assert mgr.zones["Z9"].mode == "MANUAL_ON"
    assert bridge.relay_states["2"] is True

    # Now Person 1 in Z1 lowers their hand to 0
    kpts_p1_down = make_keypoints_for_zone(z1_pos[0], z1_pos[1], left_up=False, right_up=False)
    detections_mod = [
        {"tracking_id": 1, "bbox": (z1_pos[0]-40, z1_pos[1]-150, z1_pos[0]+40, z1_pos[1]), "keypoints": kpts_p1_down},
        {"tracking_id": 2, "bbox": (z9_pos[0]-40, z9_pos[1]-150, z9_pos[0]+40, z9_pos[1]), "keypoints": kpts_p2}
    ]
    mgr.process_frame_detections(detections_mod, w, h, current_time=t0 + 2.0)
    bridge.sync_zone_states(mgr.zones)

    # Relay 1 remains OFF, Relay 2 remains ON!
    assert bridge.relay_states["1"] is False
    assert bridge.relay_states["2"] is True


def test_8_moving_between_zones_updates_control_correctly(lab_env):
    """
    Scenario 8:
    Person 1 in Z1 sets MANUAL_OFF (Relay 1 OFF).
    Person 1 walks to Z9.
    - Manual state does NOT follow: Person enters Z9 in AUTO -> Relay 2 turns ON.
    - Z1 is now empty -> after 10.0s timeout, Z1 resets to EMPTY, OFF, AUTO.
    """
    _, mgr, bridge, w, h, z1_pos, z9_pos = lab_env
    kpts_p1_z1 = make_keypoints_for_zone(z1_pos[0], z1_pos[1], left_up=True, right_up=False)
    det_z1 = [{"tracking_id": 1, "bbox": (z1_pos[0]-40, z1_pos[1]-150, z1_pos[0]+40, z1_pos[1]), "keypoints": kpts_p1_z1}]

    t0 = 60.0
    # Person in Z1 sets MANUAL_OFF
    mgr.process_frame_detections(det_z1, w, h, current_time=t0)
    mgr.process_frame_detections(det_z1, w, h, current_time=t0 + 0.8)
    bridge.sync_zone_states(mgr.zones)
    assert bridge.relay_states["1"] is False
    assert bridge.relay_states["2"] is False

    # Person remains in Z1 until t = 62.0
    mgr.process_frame_detections(det_z1, w, h, current_time=t0 + 2.0)

    # Person 1 walks to Z9 at t = 63.0 (with hands down)
    kpts_p1_z9 = make_keypoints_for_zone(z9_pos[0], z9_pos[1], left_up=False, right_up=False)
    det_z9 = [{"tracking_id": 1, "bbox": (z9_pos[0]-40, z9_pos[1]-150, z9_pos[0]+40, z9_pos[1]), "keypoints": kpts_p1_z9}]

    mgr.process_frame_detections(det_z9, w, h, current_time=t0 + 3.0)
    bridge.sync_zone_states(mgr.zones)

    # Person is in Z9 in AUTO -> Relay 2 (Light 2) turns ON!
    assert mgr.zones["Z9"].occupied is True
    assert mgr.zones["Z9"].mode == "AUTO"
    assert bridge.relay_states["2"] is True

    # Z1 grace period check at t = 65.0 (3.0s after departure < 10.0s)
    assert mgr.zones["Z1"].occupied is False
    assert mgr.zones["Z1"].vacancy_timer_active is True

    # After 10s timeout at t = 73.5 (11.5s after departure >= 10.0s)
    mgr.process_frame_detections(det_z9, w, h, current_time=t0 + 13.5)
    bridge.sync_zone_states(mgr.zones)

    # Z1 is now completely reset to EMPTY & AUTO
    assert mgr.zones["Z1"].occupied is False
    assert mgr.zones["Z1"].vacancy_timer_active is False
    assert mgr.zones["Z1"].mode == "AUTO"
    assert bridge.relay_states["1"] is False

    # Z9 remains active ON
    assert bridge.relay_states["2"] is True
