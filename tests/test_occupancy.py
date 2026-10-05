"""
Unit tests for zone entry, exit vacancy delay timer (2-3s), and automatic appliance control.
"""

import pytest
from vision.zone_state import ZoneState
from vision.person_state import PersonState


def test_person_enters_zone_auto():
    """
    Test Requirement 1:
    Person enters Z5 -> Zone = Z5, Occupancy = OCCUPIED, Light = ON, Fan = ON, Mode = AUTO.
    """
    zone = ZoneState(zone_id="Z5", leave_timeout_sec=2.5)
    person = PersonState(tracking_id=1)
    person.zone = "Z5"
    person.mode = "AUTO"

    t0 = 500.0
    changed = zone.update(occupants=[person], current_time=t0)

    assert changed is True
    assert zone.occupied is True
    assert zone.occupancy_state == "OCCUPIED"
    assert zone.light_state is True
    assert zone.fan_state is True
    assert zone.mode == "AUTO"
    assert zone.current_occupant_ids == [1]


def test_person_leaves_zone_delay_and_auto_off():
    """
    Test Requirement 2:
    When person leaves zone:
    Do NOT immediately switch OFF.
    Wait ~2-3 seconds. If nobody is detected, Light = OFF, Fan = OFF, Zone = EMPTY, Mode = AUTO.
    """
    zone = ZoneState(zone_id="Z5", leave_timeout_sec=2.5)
    person = PersonState(tracking_id=1)
    person.zone = "Z5"

    t0 = 100.0
    zone.update(occupants=[person], current_time=t0)
    assert zone.light_state is True

    # Person leaves at t = 101.0
    t_leave = 101.0
    # Update with empty occupants at t = 102.0 (1.0s after departure < 2.5s timeout)
    changed = zone.update(occupants=[], current_time=t_leave + 1.0)
    
    # Must STILL BE ON during grace period!
    assert zone.occupied is True
    assert zone.light_state is True
    assert zone.fan_state is True

    # Update at t = 103.6 (2.6s after departure >= 2.5s timeout)
    changed = zone.update(occupants=[], current_time=t_leave + 2.6)

    # Now must turn OFF
    assert zone.occupied is False
    assert zone.occupancy_state == "EMPTY"
    assert zone.light_state is False
    assert zone.fan_state is False
    assert zone.mode == "AUTO"
