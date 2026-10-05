"""
Real-time Person & Pose Detector using YOLOv8-Pose.
Extracts bounding boxes, multi-person tracking IDs, and 17 COCO skeletal keypoints.
"""

import os
from typing import List, Dict, Any, Optional
import numpy as np


class PersonDetector:
    """
    Unified person detector and pose estimator.
    """

    def __init__(
        self,
        model_name_or_path: str = "yolov8n-pose.pt",
        conf_threshold: float = 0.5,
        device: str = "cpu"
    ):
        self.model_path = model_name_or_path
        self.conf_threshold = conf_threshold
        self.device = device
        self.model = None
        self._fallback_id_counter = 1
        
        self._init_model()

    def _init_model(self):
        """Initializes Ultralytics YOLOv8-pose model."""
        try:
            from ultralytics import YOLO
            print(f"[PersonDetector] Loading YOLO-Pose model: {self.model_path}...")
            self.model = YOLO(self.model_path)
            print("[PersonDetector] YOLO-Pose loaded successfully.")
        except Exception as e:
            print(f"[PersonDetector] Warning: Could not initialize YOLO model ({e}). Will run in simulated/fallback mode.")
            self.model = None

    def detect_and_track(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """
        Executes person detection, ByteTrack tracking, and pose extraction.
        
        Returns:
            List of detected person dictionaries containing:
            - tracking_id: int
            - bbox: (x1, y1, x2, y2)
            - confidence: float
            - keypoints: ndarray of shape (17, 3) [x, y, conf]
        """
        if self.model is None or frame is None:
            return []

        try:
            # model.track with persist=True preserves IDs across successive frames
            results = self.model.track(
                source=frame,
                persist=True,
                conf=self.conf_threshold,
                device=self.device,
                verbose=False
            )

            if not results or len(results) == 0:
                return []

            res = results[0]
            boxes = res.boxes
            keypoints_data = res.keypoints

            if boxes is None or len(boxes) == 0:
                return []

            detections = []
            
            # Extract boxes and IDs
            xyxy_list = boxes.xyxy.cpu().numpy()
            conf_list = boxes.conf.cpu().numpy()
            
            if boxes.id is not None:
                id_list = boxes.id.int().cpu().numpy()
            else:
                # If tracker hasn't assigned an ID in the very first frame, assign sequential ID
                id_list = [self._fallback_id_counter + i for i in range(len(xyxy_list))]
                self._fallback_id_counter += len(xyxy_list)

            # Keypoints (shape: N, 17, 3 or N, 17, 2)
            if keypoints_data is not None and keypoints_data.data is not None:
                kpts_all = keypoints_data.data.cpu().numpy()
            else:
                kpts_all = np.zeros((len(xyxy_list), 17, 3), dtype=np.float32)

            for i in range(len(xyxy_list)):
                box = xyxy_list[i]
                trk_id = int(id_list[i])
                confidence = float(conf_list[i])
                kpts = kpts_all[i]

                # Ensure shape is (17, 3)
                if kpts.shape[-1] == 2:
                    ones = np.ones((17, 1), dtype=np.float32)
                    kpts = np.hstack([kpts, ones])

                detections.append({
                    "tracking_id": trk_id,
                    "bbox": (float(box[0]), float(box[1]), float(box[2]), float(box[3])),
                    "confidence": confidence,
                    "keypoints": kpts
                })

            return detections

        except Exception as e:
            print(f"[PersonDetector] Inference error: {e}")
            return []
