"""
Master Vision Controller.
Integrates camera input, detection, tracking, zone mapping,
gesture recognition, state machine updates, and HUD visualization rendering.
"""

import time
from typing import Dict, Any, Tuple, Optional, List
import cv2
import numpy as np

from vision.camera import Camera
from vision.zone_manager import ZoneManager
from vision.occupancy_manager import OccupancyManager
from vision.person_detector import PersonDetector
from vision.zone_state import VACANCY_GRACE_PERIOD


# Skeleton connections for standard 17 COCO keypoints
SKELETON_PAIRS = [
    (5, 6),   # Shoulders
    (5, 7), (7, 9),    # Left arm
    (6, 8), (8, 10),   # Right arm
    (5, 11), (6, 12),  # Torso sides
    (11, 12),          # Hips
    (11, 13), (13, 15), # Left leg
    (12, 14), (14, 16)  # Right leg
]


class VisionController:
    """
    Coordinates the entire vision pipeline and renders live diagnostic overlays.
    """

    def __init__(
        self,
        config_path: str = "config/system_config.json",
        zones_config_path: str = "config/zones.json"
    ):
        self.config_path = config_path
        self.zones_config_path = zones_config_path

        # Subsystems
        self.zone_manager = ZoneManager(zones_config_path)
        self.occupancy_manager = OccupancyManager(
            zone_manager=self.zone_manager,
            leave_timeout_sec=VACANCY_GRACE_PERIOD,
            gesture_stability_sec=0.8
        )
        self.detector = PersonDetector(model_name_or_path="yolov8n-pose.pt")
        self.camera: Optional[Camera] = None

        # Diagnostics & FPS
        self.fps: float = 0.0
        self._prev_frame_time: float = time.time()
        self.latest_clean_frame: Optional[np.ndarray] = None
        self.latest_clean_jpeg: Optional[bytes] = None
        self.latest_annotated_frame: Optional[np.ndarray] = None

    def initialize_camera(self, device_index: int = 0, width: int = 1280, height: int = 720):
        """Initializes and starts the webcam capture thread."""
        self.camera = Camera(device_index=device_index, width=width, height=height)
        self.camera.start()

    def process_frame(
        self,
        frame: np.ndarray,
        current_time: Optional[float] = None
    ) -> Tuple[np.ndarray, Dict[str, Any], List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Processes a single video frame end-to-end.
        
        Returns:
            annotated_frame, zone_states_dict, people_list, state_change_events
        """
        if current_time is None:
            current_time = time.time()

        # Update FPS
        dt = current_time - self._prev_frame_time
        if dt > 0:
            self.fps = 0.9 * self.fps + 0.1 * (1.0 / dt)
        self._prev_frame_time = current_time

        h, w = frame.shape[:2]
        self.latest_clean_frame = frame

        # Encode clean frame into JPEG for low-overhead CCTV distribution
        try:
            ret, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            if ret:
                self.latest_clean_jpeg = buf.tobytes()
        except Exception:
            pass

        # 1. Run detection and tracking
        detections = self.detector.detect_and_track(frame)

        # 2. Update occupancy and state machines
        events = self.occupancy_manager.process_frame_detections(
            detections=detections,
            frame_w=w,
            frame_h=h,
            current_time=current_time
        )

        zone_states = self.occupancy_manager.get_zone_states_dict()
        people = self.occupancy_manager.get_people_dict()

        # 3. Render visual annotations
        annotated = frame.copy()
        
        # Draw 3x3 zones grid
        self.zone_manager.draw_grid(annotated, zone_states)

        # Draw persons (bboxes, skeletons, badges, feet)
        for p in self.occupancy_manager.people.values():
            self._render_person_overlay(annotated, p, detections)

        # Draw real-time 9-zone status HUD panel (Requirement 14)
        annotated = self._render_status_hud(annotated, zone_states)

        self.latest_annotated_frame = annotated
        return annotated, zone_states, people, events

    def get_clean_jpeg(self) -> Optional[bytes]:
        """Returns the latest clean, unannotated camera frame as JPEG bytes."""
        if self.latest_clean_jpeg is not None:
            return self.latest_clean_jpeg
        if self.latest_clean_frame is not None:
            try:
                ret, buf = cv2.imencode(".jpg", self.latest_clean_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                if ret:
                    self.latest_clean_jpeg = buf.tobytes()
                    return self.latest_clean_jpeg
            except Exception:
                pass
        return None

    def _render_person_overlay(self, frame: np.ndarray, person: Any, detections: List[Dict[str, Any]]):
        """Renders bounding box, skeleton, floor contact, and diagnostic badge."""
        x1, y1, x2, y2 = [int(v) for v in person.bbox]
        
        # Color based on mode
        if person.mode == "MANUAL_ON":
            color = (0, 215, 255)  # Gold / Amber
        elif person.mode == "MANUAL_OFF":
            color = (0, 0, 255)    # Bright Red
        else:
            color = (0, 255, 0)    # Green (AUTO)

        # Bounding box
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

        # Draw skeleton if keypoints exist
        for det in detections:
            if det["tracking_id"] == person.tracking_id:
                kpts = det["keypoints"]
                for p1_idx, p2_idx in SKELETON_PAIRS:
                    pt1 = kpts[p1_idx]
                    pt2 = kpts[p2_idx]
                    conf1 = pt1[2] if len(pt1) > 2 else 1.0
                    conf2 = pt2[2] if len(pt2) > 2 else 1.0
                    if conf1 >= 0.35 and conf2 >= 0.35:
                        c1 = (int(pt1[0]), int(pt1[1]))
                        c2 = (int(pt2[0]), int(pt2[1]))
                        cv2.line(frame, c1, c2, (255, 255, 0), 2, cv2.LINE_AA)
                for pt in kpts:
                    conf = pt[2] if len(pt) > 2 else 1.0
                    if conf >= 0.35:
                        cv2.circle(frame, (int(pt[0]), int(pt[1])), 3, (0, 0, 255), -1)
                break

        # Floor position marker (midpoint between ankles or bottom-center)
        fx, fy = int(person.position[0]), int(person.position[1])
        cv2.circle(frame, (fx, fy), 6, (255, 0, 255), -1)
        cv2.circle(frame, (fx, fy), 10, (255, 0, 255), 2)
        cv2.putText(
            frame, f"Feet ({person.position_source[:5]})", (fx + 12, fy + 4),
            cv2.FONT_HERSHEY_SIMPLEX, 0.40, (255, 0, 255), 1, cv2.LINE_AA
        )

        # Diagnostic HUD badge above person head
        badge_y = max(20, y1 - 85)
        badge_x = max(10, x1)
        badge_w = 175
        badge_h = 80

        # Background card
        cv2.rectangle(frame, (badge_x, badge_y), (badge_x + badge_w, badge_y + badge_h), (15, 15, 15), -1)
        cv2.rectangle(frame, (badge_x, badge_y), (badge_x + badge_w, badge_y + badge_h), color, 2)

        # Lines of text (Requirement 13)
        lines = [
            f"ID:{person.tracking_id}  ZONE: {person.zone or 'OUT'}",
            f"HANDS: {person.raw_hand_count} (st: {person.stable_hand_count})",
            f"GESTURE: {person.gesture}",
            f"MODE: {person.mode}"
        ]

        for idx, line in enumerate(lines):
            ty = badge_y + 16 + (idx * 16)
            txt_color = (255, 255, 255)
            if "MODE: MANUAL_OFF" in line:
                txt_color = (100, 100, 255)
            elif "MODE: MANUAL_ON" in line:
                txt_color = (0, 215, 255)
            elif "MODE: AUTO" in line:
                txt_color = (100, 255, 100)
            cv2.putText(frame, line, (badge_x + 8, ty), cv2.FONT_HERSHEY_SIMPLEX, 0.42, txt_color, 1, cv2.LINE_AA)

    def _render_status_hud(self, frame: np.ndarray, zone_states: Dict[str, Any]) -> np.ndarray:
        """
        Renders the real-time 9-zone status panel (Requirement 14).
        Creates an elegant right-hand telemetry side-panel.
        """
        h, w = frame.shape[:2]
        panel_w = 310
        
        # Extend canvas horizontally to make room for status panel
        canvas = np.zeros((h, w + panel_w, 3), dtype=np.uint8)
        canvas[:, :w] = frame

        # Panel styling
        panel = canvas[:, w:]
        panel[:] = (24, 26, 27)  # Dark slate background

        # Panel Header
        cv2.rectangle(panel, (0, 0), (panel_w, 60), (35, 39, 42), -1)
        cv2.putText(
            panel, "SMART LAB STATUS", (16, 26),
            cv2.FONT_HERSHEY_SIMPLEX, 0.60, (0, 255, 255), 2, cv2.LINE_AA
        )
        cv2.putText(
            panel, f"FPS: {self.fps:.1f} | OCCUPANTS: {len(self.occupancy_manager.people)}",
            (16, 48), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (180, 180, 180), 1, cv2.LINE_AA
        )
        cv2.line(panel, (0, 60), (panel_w, 60), (70, 75, 80), 1)

        # 9 Zone Status Rows (Requirement 14)
        start_y = 75
        row_height = 42

        for i in range(1, 10):
            zid = f"Z{i}"
            z = zone_states.get(zid, {})
            light = z.get("light_state", "OFF")
            mode = z.get("mode", "AUTO")
            occ = z.get("occupancy_state", "EMPTY")

            y = start_y + (i - 1) * row_height

            # Row container card
            is_active = (occ == "OCCUPIED" or light == "ON")
            row_bg = (38, 43, 48) if is_active else (30, 32, 34)
            cv2.rectangle(panel, (8, y), (panel_w - 8, y + row_height - 6), row_bg, -1)

            # Left indicator bar
            if light == "ON":
                bar_color = (0, 220, 100) if mode == "AUTO" else (0, 215, 255)
            elif mode == "MANUAL_OFF":
                bar_color = (0, 0, 220)
            else:
                bar_color = (60, 65, 70)
            cv2.rectangle(panel, (8, y), (14, y + row_height - 6), bar_color, -1)

            # Zone label with physical relay mapping highlight
            hw_tag = ""
            if zid == "Z2":
                hw_tag = " [R1]"
            elif zid == "Z8":
                hw_tag = " [R2]"
            cv2.putText(panel, f"{zid}{hw_tag}", (18, y + 23), cv2.FONT_HERSHEY_SIMPLEX, 0.44, (255, 255, 255), 2 if hw_tag else 1, cv2.LINE_AA)

            # Light status pill
            light_col = (0, 255, 100) if light == "ON" else (140, 140, 140)
            cv2.putText(panel, f"L:{light}", (78, y + 23), cv2.FONT_HERSHEY_SIMPLEX, 0.45, light_col, 1, cv2.LINE_AA)

            # Mode pill
            mode_col = (0, 215, 255) if mode == "MANUAL_ON" else ((100, 100, 255) if mode == "MANUAL_OFF" else (200, 200, 200))
            cv2.putText(panel, f"| {mode}", (145, y + 23), cv2.FONT_HERSHEY_SIMPLEX, 0.38, mode_col, 1, cv2.LINE_AA)

            # Occupancy and vacancy countdown
            if z.get("vacancy_timer_active", False) and occ == "EMPTY":
                rem = z.get("vacancy_remaining_seconds", 0.0)
                cv2.putText(panel, f"{rem:.1f}s", (panel_w - 55, y + 23), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 165, 255), 1, cv2.LINE_AA)
            else:
                occ_col = (0, 255, 100) if occ == "OCCUPIED" else (100, 105, 110)
                cv2.putText(panel, occ[:3], (panel_w - 45, y + 23), cv2.FONT_HERSHEY_SIMPLEX, 0.38, occ_col, 1, cv2.LINE_AA)

        # Footer instructions
        footer_y = start_y + 9 * row_height + 20
        cv2.putText(panel, "GESTURE CONTROLS:", (16, footer_y), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 255, 255), 1, cv2.LINE_AA)
        cv2.putText(panel, "* 0 Hands: AUTO", (16, footer_y + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (180, 180, 180), 1, cv2.LINE_AA)
        cv2.putText(panel, "* 1 Hand : MANUAL OFF", (16, footer_y + 34), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (180, 180, 180), 1, cv2.LINE_AA)
        cv2.putText(panel, "* 2 Hands: MANUAL ON", (16, footer_y + 50), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (180, 180, 180), 1, cv2.LINE_AA)

        return canvas
