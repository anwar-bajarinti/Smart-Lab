"""
Unit tests for biomechanical raised hand detection and temporal debounce stability.
"""

import numpy as np
import pytest
from vision.gesture_detector import GestureDetector
from vision.person_state import PersonState
from vision.pose_detector import (
    LEFT_SHOULDER, RIGHT_SHOULDER,
    LEFT_ELBOW, RIGHT_ELBOW,
    LEFT_WRIST, RIGHT_WRIST
)


def create_mock_keypoints(left_hand_up: bool = False, right_hand_up: bool = False) -> np.ndarray:
    """Helper to synthesize 17 COCO keypoints with controllable arm positions."""
    # Initialize all keypoints at torso level
    kpts = np.zeros((17, 3), dtype=np.float32)
    # Default confidence = 0.9
    kpts[:, 2] = 0.9

    # Shoulders at y = 200
    kpts[LEFT_SHOULDER] = [380, 200, 0.95]
    kpts[RIGHT_SHOULDER] = [420, 200, 0.95]

    # Hips at y = 350 (Torso height = 150)
    kpts[11] = [385, 350, 0.9]
    kpts[12] = [415, 350, 0.9]

    # Ankles at y = 500
    kpts[15] = [385, 500, 0.9]
    kpts[16] = [415, 500, 0.9]

    # Left arm
    if left_hand_up:
        # Wrist clearly above shoulder (y = 80 < 200)
        kpts[LEFT_ELBOW] = [370, 140, 0.95]
        kpts[LEFT_WRIST] = [360, 80, 0.95]
    else:
        # Wrist down by hip (y = 320 > 200)
        kpts[LEFT_ELBOW] = [370, 260, 0.95]
        kpts[LEFT_WRIST] = [370, 320, 0.95]

    # Right arm
    if right_hand_up:
        kpts[RIGHT_ELBOW] = [430, 140, 0.95]
        kpts[RIGHT_WRIST] = [440, 80, 0.95]
    else:
        kpts[RIGHT_ELBOW] = [430, 260, 0.95]
        kpts[RIGHT_WRIST] = [430, 320, 0.95]

    return kpts


def test_gesture_detector_zero_hands():
    """Verify 0 hands raised produces NONE / AUTO."""
    gd = GestureDetector()
    kpts = create_mock_keypoints(left_hand_up=False, right_hand_up=False)
    count, name, _ = gd.detect_gestures(kpts, torso_scale=150.0)
    assert count == 0
    assert name == "NONE"


def test_gesture_detector_one_hand():
    """Verify 1 hand raised produces ONE_HAND_RAISED."""
    gd = GestureDetector()
    # Left hand up, right hand down
    kpts = create_mock_keypoints(left_hand_up=True, right_hand_up=False)
    count, name, details = gd.detect_gestures(kpts, torso_scale=150.0)
    assert count == 1
    assert name == "ONE_HAND_RAISED"
    assert details["left_raised"] is True
    assert details["right_raised"] is False


def test_gesture_detector_two_hands():
    """Verify 2 hands raised produces TWO_HANDS_RAISED."""
    gd = GestureDetector()
    kpts = create_mock_keypoints(left_hand_up=True, right_hand_up=True)
    count, name, details = gd.detect_gestures(kpts, torso_scale=150.0)
    assert count == 2
    assert name == "TWO_HANDS_RAISED"
    assert details["left_raised"] is True
    assert details["right_raised"] is True


def test_gesture_stability_debounce():
    """
    Test Requirement 6:
    Gesture must remain stable for 0.7 - 1.0s before accepting.
    """
    person = PersonState(tracking_id=1, stability_duration_sec=0.8)
    t0 = 1000.0

    # Frame 1: Person in AUTO with 0 hands
    person.update_gestures(raw_hand_count=0, current_time=t0)
    assert person.mode == "AUTO"
    assert person.stable_hand_count == 0

    # Frame 2: Person raises 1 hand at t = 1000.2 (elapsed = 0.0s from transition)
    person.update_gestures(raw_hand_count=1, current_time=t0 + 0.2)
    assert person.mode == "AUTO"  # Not yet debounced!
    assert person.stable_hand_count == 0

    # Frame 3: Hand held for 0.5s after transition (elapsed = 0.7 - 0.2 = 0.5s < 0.8s)
    person.update_gestures(raw_hand_count=1, current_time=t0 + 0.7)
    assert person.mode == "AUTO"

    # Frame 4: Hand held for 0.85s after transition (elapsed = 1.05 - 0.2 = 0.85s >= 0.8s)
    person.update_gestures(raw_hand_count=1, current_time=t0 + 1.05)
    assert person.stable_hand_count == 1
    assert person.gesture == "ONE_HAND_RAISED"
    assert person.mode == "MANUAL_OFF"


def test_manual_override_persists_when_hands_lowered():
    """
    Test Requirement 3:
    When a person in MANUAL_OFF lowers their hands to 0,
    the manual OFF command must remain active while the person stays in the zone!
    """
    person = PersonState(tracking_id=1, stability_duration_sec=0.8)
    t0 = 1000.0

    # Trigger MANUAL_OFF
    person.update_gestures(raw_hand_count=1, current_time=t0)
    person.update_gestures(raw_hand_count=1, current_time=t0 + 0.85)
    assert person.mode == "MANUAL_OFF"

    # Lower hands to 0 and hold for 2 seconds
    person.update_gestures(raw_hand_count=0, current_time=t0 + 1.0)
    person.update_gestures(raw_hand_count=0, current_time=t0 + 2.5)
    
    # Must remain MANUAL_OFF!
    assert person.mode == "MANUAL_OFF"


def test_two_hands_overrides_manual_off():
    """
    Test Requirement 4:
    Raising TWO hands overrides MANUAL_OFF and engages MANUAL_ON.
    """
    person = PersonState(tracking_id=1, stability_duration_sec=0.8)
    t0 = 1000.0

    # First set MANUAL_OFF
    person.update_gestures(raw_hand_count=1, current_time=t0)
    person.update_gestures(raw_hand_count=1, current_time=t0 + 0.85)
    assert person.mode == "MANUAL_OFF"

    # Now raise 2 hands
    person.update_gestures(raw_hand_count=2, current_time=t0 + 1.0)
    person.update_gestures(raw_hand_count=2, current_time=t0 + 1.9)  # 0.9s elapsed
    assert person.mode == "MANUAL_ON"
    assert person.gesture == "TWO_HANDS_RAISED"
