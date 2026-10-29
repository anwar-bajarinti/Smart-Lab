"""
High-accuracy biomechanical gesture detector for raised-hand laboratory commands.
Analyzes shoulder, elbow, and wrist spatial alignment with adaptive thresholds.
"""

from typing import Tuple, Dict, Any
import numpy as np
from vision.pose_detector import (
    LEFT_SHOULDER, RIGHT_SHOULDER,
    LEFT_ELBOW, RIGHT_ELBOW,
    LEFT_WRIST, RIGHT_WRIST
)


class GestureDetector:
    """
    Evaluates whether one or both arms are raised.
    
    Biomechanical Rules (Requirement 5):
    - A hand is considered RAISED only when the pose indicates that the wrist
      is clearly above the corresponding shoulder.
    - Uses: Shoulder, Elbow, Wrist and suitable thresholds.
    - Avoids false triggers from typing, scratching head/chin, or walking arm swings.
    """

    def __init__(
        self,
        min_conf: float = 0.35,
        vertical_margin_ratio: float = 0.05
    ):
        self.min_conf = min_conf
        self.margin_ratio = vertical_margin_ratio

    def evaluate_arm(
        self,
        wrist: np.ndarray,
        elbow: np.ndarray,
        shoulder: np.ndarray,
        torso_scale: float,
        has_conf: bool = True
    ) -> Tuple[bool, Dict[str, Any]]:
        """
        Evaluates a single arm.
        
        Returns:
            (is_raised, debug_info)
        """
        w_conf = float(wrist[2]) if has_conf else 1.0
        e_conf = float(elbow[2]) if has_conf else 1.0
        s_conf = float(shoulder[2]) if has_conf else 1.0

        debug_info = {
            "wrist_conf": w_conf,
            "elbow_conf": e_conf,
            "shoulder_conf": s_conf,
            "wrist_y": float(wrist[1]),
            "shoulder_y": float(shoulder[1]),
            "is_raised": False,
            "reason": ""
        }

        # Keypoints must be valid and visible
        if w_conf < self.min_conf or s_conf < self.min_conf:
            debug_info["reason"] = "low_confidence"
            return False, debug_info

        if (wrist[0] == 0 and wrist[1] == 0) or (shoulder[0] == 0 and shoulder[1] == 0):
            debug_info["reason"] = "zero_coordinates"
            return False, debug_info

        # In image coordinates, y=0 is TOP, so smaller y = physically HIGHER
        wrist_y = float(wrist[1])
        elbow_y = float(elbow[1]) if e_conf >= self.min_conf else wrist_y
        shoulder_y = float(shoulder[1])

        # Vertical clearance threshold above shoulder
        clearance = torso_scale * self.margin_ratio
        shoulder_threshold_y = shoulder_y - clearance

        # Condition 1: Wrist must be clearly above shoulder
        wrist_above_shoulder = wrist_y < shoulder_threshold_y

        # Condition 2: Wrist must also be higher than or approximately level with elbow
        # (prevents false positive when elbow is bent sideways with wrist drooping down)
        wrist_above_elbow = wrist_y <= (elbow_y + torso_scale * 0.10)

        is_raised = bool(wrist_above_shoulder and wrist_above_elbow)
        debug_info["is_raised"] = is_raised
        debug_info["reason"] = "raised_verified" if is_raised else "below_threshold"

        return is_raised, debug_info

    def detect_gestures(
        self,
        keypoints: np.ndarray,
        torso_scale: float
    ) -> Tuple[int, str, Dict[str, Any]]:
        """
        Analyzes full body pose to classify hands raised count and gesture name.
        
        Returns:
            (hand_count, gesture_name, details)
        """
        has_conf = keypoints.shape[-1] >= 3

        l_wrist = keypoints[LEFT_WRIST]
        l_elbow = keypoints[LEFT_ELBOW]
        l_shoulder = keypoints[LEFT_SHOULDER]

        r_wrist = keypoints[RIGHT_WRIST]
        r_elbow = keypoints[RIGHT_ELBOW]
        r_shoulder = keypoints[RIGHT_SHOULDER]

        l_raised, l_info = self.evaluate_arm(l_wrist, l_elbow, l_shoulder, torso_scale, has_conf)
        r_raised, r_info = self.evaluate_arm(r_wrist, r_elbow, r_shoulder, torso_scale, has_conf)

        count = (1 if l_raised else 0) + (1 if r_raised else 0)

        if count == 0:
            gesture_name = "NONE"
        elif count == 1:
            gesture_name = "ONE_HAND_RAISED"
        else:
            gesture_name = "TWO_HANDS_RAISED"

        details = {
            "left_raised": l_raised,
            "right_raised": r_raised,
            "left_arm": l_info,
            "right_arm": r_info,
            "count": count
        }

        return count, gesture_name, details
