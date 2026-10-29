"""
Unit tests for real-time 10-second zone vacancy delay, cancellation on re-entry, and multi-person occupancy.
"""

import pytest
from vision.zone_state import ZoneState, VACANCY_GRACE_PERIOD
from vision.person_state import PersonState


def test_person_enters_zone_auto():
    """
    Test Requirement 1:
    Person enters Z5 -> Zone = Z5, Occupancy = OCCUPIED, Light = ON, Fan = ON, Mode = AUTO.
    """
    zone = ZoneState(zone_id="Z5", leave_timeout_sec=VACANCY_GRACE_PERIOD)
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
    assert zone.vacancy_timer_active is False
    assert zone.vacancy_remaining_seconds == 0.0


def test_person_leaves_zone_10s_delay_and_auto_off():
    """
    Test Requirement 2 & Exact Requirement:
    VACANCY_GRACE_PERIOD = 10.0 seconds.
    When person leaves zone:
    - Zone becomes EMPTY (occupied = False)
    - DO NOT turn light OFF immediately
    - Start 10-second vacancy timer (vacancy_timer_active = True)
    - At 5.0 seconds empty -> Light MUST REMAIN ON
    - At full 10.0+ seconds empty -> Light turns OFF, reset to AUTO.
    """
    zone = ZoneState(zone_id="Z5", leave_timeout_sec=10.0)
    person = PersonState(tracking_id=1)
    person.zone = "Z5"

    t0 = 100.0
    zone.update(occupants=[person], current_time=t0)
    assert zone.light_state is True
    assert zone.occupied is True

    # Person leaves at t = 100.0
    t_leave = 100.0
    
    # Check at 5.0s (midpoint of 10-second grace period)
    zone.update(occupants=[], current_time=t_leave + 5.0)
    assert zone.occupied is False
    assert zone.occupancy_state == "EMPTY"
    assert zone.vacancy_timer_active is True
    assert 4.9 <= zone.vacancy_remaining_seconds <= 5.1
    # LIGHT MUST STILL BE ON!
    assert zone.light_state is True
    assert zone.fan_state is True

    # Check at 9.0s
    zone.update(occupants=[], current_time=t_leave + 9.0)
    assert zone.occupied is False
    assert zone.vacancy_timer_active is True
    assert 0.9 <= zone.vacancy_remaining_seconds <= 1.1
    assert zone.light_state is True

    # Check at 10.1s (full 10 seconds elapsed)
    zone.update(occupants=[], current_time=t_leave + 10.1)
    assert zone.occupied is False
    assert zone.occupancy_state == "EMPTY"
    assert zone.vacancy_timer_active is False
    assert zone.vacancy_remaining_seconds == 0.0
    # Now turned OFF
    assert zone.light_state is False
    assert zone.fan_state is False
    assert zone.mode == "AUTO"


def test_person_reenters_zone_cancels_vacancy_timer():
    """
    If person returns to zone before 10.0s:
    Cancel vacancy timer immediately, keep light ON, resume normal occupied state.
    """
    zone = ZoneState(zone_id="Z2", leave_timeout_sec=10.0)
    p = PersonState(tracking_id=1)
    p.zone = "Z2"

    t0 = 200.0
    zone.update(occupants=[p], current_time=t0)
    assert zone.light_state is True

    # Person leaves at t = 200.0, checked at t = 205.0 (5s < 10s)
    zone.update(occupants=[], current_time=t0 + 5.0)
    assert zone.occupied is False
    assert zone.vacancy_timer_active is True
    assert zone.light_state is True

    # Person re-enters at t = 208.0 (8s < 10s)
    zone.update(occupants=[p], current_time=t0 + 8.0)
    assert zone.occupied is True
    assert zone.occupancy_state == "OCCUPIED"
    assert zone.vacancy_timer_active is False
    assert zone.vacancy_remaining_seconds == 0.0
    assert zone.light_state is True

    # Remains ON continuously at t = 215.0
    zone.update(occupants=[p], current_time=t0 + 15.0)
    assert zone.occupied is True
    assert zone.light_state is True


def test_multi_person_leaves_zone_vacancy_trigger():
    """
    Multi-person requirement:
    Z2 has Person 1 and Person 2.
    Person 1 leaves -> Z2 still has Person 2 -> DO NOT start vacancy timer.
    Person 2 leaves -> Z2 becomes empty -> Start 10-second timer.
    """
    zone = ZoneState(zone_id="Z2", leave_timeout_sec=10.0)
    p1 = PersonState(tracking_id=1)
    p2 = PersonState(tracking_id=2)

    t0 = 300.0
    zone.update(occupants=[p1, p2], current_time=t0)
    assert zone.occupied is True
    assert zone.vacancy_timer_active is False

    # Person 1 leaves at t = 302.0 (Person 2 remains)
    zone.update(occupants=[p2], current_time=t0 + 2.0)
    assert zone.occupied is True
    assert zone.vacancy_timer_active is False
    assert zone.light_state is True

    # Person 2 leaves at t = 304.0 -> Now empty -> Start timer
    zone.update(occupants=[], current_time=t0 + 4.0)
    assert zone.occupied is False
    assert zone.vacancy_timer_active is True
    assert zone.light_state is True
