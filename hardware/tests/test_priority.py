"""
Unit tests for same-zone multi-person priority arbitration and inter-zone transitions.
"""

import pytest
from vision.zone_state import ZoneState
from vision.person_state import PersonState


def test_same_zone_priority_manual_off_over_auto():
    """
    Test Requirement 10:
    Person 1 -> Z5 -> AUTO
    Person 2 -> Z5 -> MANUAL_OFF
    Result: Z5 = OFF (MANUAL_OFF)
    """
    zone = ZoneState(zone_id="Z5")

    p1 = PersonState(tracking_id=1)
    p1.zone = "Z5"
    p1.mode = "AUTO"

    p2 = PersonState(tracking_id=2)
    p2.zone = "Z5"
    p2.mode = "MANUAL_OFF"

    zone.update(occupants=[p1, p2], current_time=100.0)

    assert zone.mode == "MANUAL_OFF"
    assert zone.light_state is False
    assert zone.fan_state is False


def test_same_zone_priority_manual_on_over_manual_off():
    """
    Test Requirement 10:
    Priority: MANUAL_ON > MANUAL_OFF > AUTO
    If one person requests MANUAL_ON -> Zone = ON (MANUAL_ON)
    """
    zone = ZoneState(zone_id="Z5")

    p1 = PersonState(tracking_id=1)
    p1.mode = "AUTO"

    p2 = PersonState(tracking_id=2)
    p2.mode = "MANUAL_OFF"

    p3 = PersonState(tracking_id=3)
    p3.mode = "MANUAL_ON"

    zone.update(occupants=[p1, p2, p3], current_time=100.0)

    assert zone.mode == "MANUAL_ON"
    assert zone.light_state is True
    assert zone.fan_state is True


def test_person_moves_between_zones_isolation():
    """
    Test Requirement 11:
    Person ID 1: Z5 -> Z2
    The manual state from Z5 must NOT follow the person.
    Z5 eventually becomes: EMPTY, OFF, AUTO.
    Person ID 1 now controls Z2 in AUTO.
    """
    z5 = ZoneState(zone_id="Z5", leave_timeout_sec=2.0)
    z2 = ZoneState(zone_id="Z2", leave_timeout_sec=2.0)

    p1 = PersonState(tracking_id=1, stability_duration_sec=0.5)
    
    # 1. Person in Z5 sets MANUAL_OFF
    p1.update_zone("Z5", current_time=10.0)
    p1.update_gestures(raw_hand_count=1, current_time=10.0)
    p1.update_gestures(raw_hand_count=1, current_time=10.6)
    assert p1.mode == "MANUAL_OFF"

    z5.update(occupants=[p1], current_time=10.6)
    assert z5.light_state is False
    assert z5.mode == "MANUAL_OFF"

    # Person remains in Z5 until t = 14.0
    z5.update(occupants=[p1], current_time=14.0)

    # 2. Person 1 walks from Z5 to Z2 at t = 14.5
    p1.update_zone("Z2", current_time=14.5)

    # Mode must reset to AUTO upon entering new physical zone!
    assert p1.mode == "AUTO"

    # Z2 gets Person 1 in AUTO
    z2.update(occupants=[p1], current_time=14.5)
    assert z2.occupied is True
    assert z2.light_state is True
    assert z2.fan_state is True
    assert z2.mode == "AUTO"

    # Z5 is now empty (Person 1 left at 14.0)
    z5.update(occupants=[], current_time=15.0)  # 1.0s after leave (< 2.0s timeout)
    assert z5.occupied is False  # Physically empty
    assert z5.vacancy_timer_active is True  # In grace period
    assert z5.mode == "MANUAL_OFF"  # Holds state during grace period

    # After timeout passes (t = 16.5, 2.5s after leave >= 2.0s timeout)
    z5.update(occupants=[], current_time=16.5)
    assert z5.occupied is False
    assert z5.occupancy_state == "EMPTY"
    assert z5.light_state is False
    assert z5.fan_state is False
    assert z5.mode == "AUTO"
