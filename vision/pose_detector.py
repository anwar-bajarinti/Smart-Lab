"""
Pose feature extraction, body landmark analysis, and floor localization.
Translates 17-point COCO skeletal keypoints into robust biomechanical indicators.
"""

from typing import Tuple, Dict, Any, Optional
import numpy as np


# Standard COCO 17 Keypoint Indices
NOSE = 0
LEFT_EYE = 1
RIGHT_EYE = 2
LEFT_EAR = 3
RIGHT_EAR = 4
LEFT_SHOULDER = 5
RIGHT_SHOULDER = 6
LEFT_ELBOW = 7
RIGHT_ELBOW = 8
LEFT_WRIST = 9
RIGHT_WRIST = 10
LEFT_HIP = 11
RIGHT_HIP = 12
LEFT_KNEE = 13
RIGHT_KNEE = 14
LEFT_ANKLE = 15
RIGHT_ANKLE = 16


class PoseDetector:
    """
    Extracts floor contact position and arm biomechanics from pose keypoints.
    """

    def __init__(self, keypoint_conf_threshold: float = 0.35):
        self.conf_thresh = keypoint_conf_threshold

    def get_floor_position(
        self,
        keypoints: np.ndarray,
        bbox: Tuple[float, float, float, float]
    ) -> Tuple[Tuple[float, float], str]:
        """
        Determines the person's physical floor contact position.
        
        Priority (Requirement 12):
            1. Midpoint between ankle landmarks (if detected with high confidence)
            2. Single ankle landmark (if only one is visible)
            3. Fallback: Bottom-center of the bounding box
            
        Args:
            keypoints: ndarray of shape (17, 2) or (17, 3) [x, y, conf]
            bbox: (x1, y1, x2, y2) in pixel coordinates
            
        Returns:
            ((x, y), source_name)
        """
        has_conf = keypoints.shape[-1] >= 3

        l_ankle = keypoints[LEFT_ANKLE]
        r_ankle = keypoints[RIGHT_ANKLE]

        l_conf = float(l_ankle[2]) if has_conf else 1.0
        r_conf = float(r_ankle[2]) if has_conf else 1.0

        l_valid = l_conf >= self.conf_thresh and not (l_ankle[0] == 0 and l_ankle[1] == 0)
        r_valid = r_conf >= self.conf_thresh and not (r_ankle[0] == 0 and r_ankle[1] == 0)

        # 1. Both ankles valid -> midpoint
        if l_valid and r_valid:
            mid_x = (float(l_ankle[0]) + float(r_ankle[0])) / 2.0
            mid_y = (float(l_ankle[1]) + float(r_ankle[1])) / 2.0
            return ((mid_x, mid_y), "ankles_midpoint")

        # 2. Single ankle valid
        if l_valid:
            return ((float(l_ankle[0]), float(l_ankle[1])), "left_ankle")
        if r_valid:
            return ((float(r_ankle[0]), float(r_ankle[1])), "right_ankle")

        # 3. Fallback: Bottom-center of bounding box
        x1, y1, x2, y2 = bbox
        bottom_center_x = (x1 + x2) / 2.0
        bottom_center_y = y2
        return ((bottom_center_x, bottom_center_y), "bbox_bottom_center")

    def get_torso_scale(self, keypoints: np.ndarray, bbox: Tuple[float, float, float, float]) -> float:
        """
        Computes reference torso scale to normalize vertical thresholds across distances.
        """
        has_conf = keypoints.shape[-1] >= 3
        l_sh = keypoints[LEFT_SHOULDER]
        r_sh = keypoints[RIGHT_SHOULDER]
        l_hip = keypoints[LEFT_HIP]
        r_hip = keypoints[RIGHT_HIP]

        # Try shoulder-to-hip vertical distance
        sh_y = (l_sh[1] + r_sh[1]) / 2.0
        hip_y = (l_hip[1] + r_hip[1]) / 2.0
        torso_h = abs(hip_y - sh_y)

        if torso_h > 15.0:
            return float(torso_h)

        # Fallback to bounding box height
        bbox_h = abs(bbox[3] - bbox[1])
        return max(30.0, float(bbox_h * 0.45))
