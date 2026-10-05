"""
Manages the 3x3 laboratory zone spatial geometry, point-to-zone localization,
and visual grid rendering. Fully modular to support perspective or polygon calibration.
"""

import json
import os
from typing import Dict, Tuple, Optional, Any
import cv2
import numpy as np


class ZoneManager:
    """
    Translates physical floor/foot coordinates to zones Z1..Z9.
    
    Grid layout:
    +---------+---------+---------+
    |   Z1    |   Z2    |   Z3    |
    +---------+---------+---------+
    |   Z4    |   Z5    |   Z6    |
    +---------+---------+---------+
    |   Z7    |   Z8    |   Z9    |
    +---------+---------+---------+
    """

    def __init__(self, config_path: Optional[str] = None):
        self.rows = 3
        self.cols = 3
        self.zones_metadata: Dict[str, Dict[str, Any]] = {}
        
        # Default zone definitions
        for r in range(self.rows):
            for c in range(self.cols):
                zid = f"Z{r * self.cols + c + 1}"
                self.zones_metadata[zid] = {
                    "row": r,
                    "col": c,
                    "name": f"Area {zid}"
                }

        if config_path and os.path.exists(config_path):
            self.load_config(config_path)

    def load_config(self, config_path: str):
        """Load zone metadata and custom geometries from JSON configuration."""
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                grid = data.get("grid", {})
                self.rows = grid.get("rows", 3)
                self.cols = grid.get("cols", 3)
                for z in data.get("zones", []):
                    zid = z.get("id")
                    if zid:
                        self.zones_metadata[zid] = z
        except Exception as e:
            print(f"[ZoneManager] Warning: Failed to parse {config_path}: {e}")

    def get_zone_for_point(self, x: float, y: float, frame_w: int, frame_h: int) -> Optional[str]:
        """
        Determines which zone contains point (x, y).
        
        Uses modular normalized coordinate calculations:
        Col = int(x / (frame_w / 3))
        Row = int(y / (frame_h / 3))
        """
        if frame_w <= 0 or frame_h <= 0:
            return None

        # Clamp within frame boundaries
        clamped_x = max(0.0, min(float(frame_w - 1), float(x)))
        clamped_y = max(0.0, min(float(frame_h - 1), float(y)))

        col_width = frame_w / self.cols
        row_height = frame_h / self.rows

        col = int(clamped_x // col_width)
        row = int(clamped_y // row_height)

        col = min(col, self.cols - 1)
        row = min(row, self.rows - 1)

        zone_index = row * self.cols + col + 1
        return f"Z{zone_index}"

    def get_zone_bounds(self, zone_id: str, frame_w: int, frame_h: int) -> Tuple[int, int, int, int]:
        """Returns pixel bounding box (x1, y1, x2, y2) for a given zone ID."""
        if zone_id not in self.zones_metadata:
            # Fallback parsing
            try:
                num = int(zone_id.replace("Z", "")) - 1
                row = num // self.cols
                col = num % self.cols
            except ValueError:
                return (0, 0, frame_w, frame_h)
        else:
            meta = self.zones_metadata[zone_id]
            row = meta["row"]
            col = meta["col"]

        col_w = frame_w / self.cols
        row_h = frame_h / self.rows

        x1 = int(col * col_w)
        y1 = int(row * row_h)
        x2 = int((col + 1) * col_w)
        y2 = int((row + 1) * row_h)

        return (x1, y1, x2, y2)

    def draw_grid(self, frame: np.ndarray, zone_states: Optional[Dict[str, Any]] = None):
        """
        Draws the 3x3 laboratory grid, zone headers, and live status highlights.
        """
        h, w = frame.shape[:2]
        col_w = w / self.cols
        row_h = h / self.rows

        overlay = frame.copy()

        # Highlight occupied or active zones
        if zone_states:
            for zid, state in zone_states.items():
                x1, y1, x2, y2 = self.get_zone_bounds(zid, w, h)
                occupied = getattr(state, "occupied", False) or (isinstance(state, dict) and state.get("occupied", False))
                mode = getattr(state, "mode", "AUTO") if not isinstance(state, dict) else state.get("mode", "AUTO")
                
                if occupied:
                    if mode == "MANUAL_ON":
                        color = (0, 200, 255)  # Orange-yellow
                    elif mode == "MANUAL_OFF":
                        color = (0, 0, 180)    # Red tint
                    else:
                        color = (0, 200, 0)    # Green tint
                    cv2.rectangle(overlay, (x1, y1), (x2, y2), color, -1)

        # Blend semi-transparent zone fill
        cv2.addWeighted(overlay, 0.12, frame, 0.88, 0, frame)

        # Draw grid dividing lines
        line_color = (255, 255, 255)
        for i in range(1, self.cols):
            x = int(i * col_w)
            cv2.line(frame, (x, 0), (x, h), line_color, 1, cv2.LINE_AA)

        for j in range(1, self.rows):
            y = int(j * row_h)
            cv2.line(frame, (0, y), (w, y), line_color, 1, cv2.LINE_AA)

        # Draw zone labels and badge info in top-left of each zone
        for zid in [f"Z{i}" for i in range(1, 10)]:
            x1, y1, x2, y2 = self.get_zone_bounds(zid, w, h)
            
            # Badge background
            badge_w, badge_h = 70, 24
            cv2.rectangle(frame, (x1 + 4, y1 + 4), (x1 + 4 + badge_w, y1 + 4 + badge_h), (20, 20, 20), -1)
            cv2.rectangle(frame, (x1 + 4, y1 + 4), (x1 + 4 + badge_w, y1 + 4 + badge_h), (80, 80, 80), 1)

            # Zone Label text
            cv2.putText(
                frame, zid, (x1 + 10, y1 + 21),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 2, cv2.LINE_AA
            )

            # If state exists, show brief status icon
            if zone_states and zid in zone_states:
                st = zone_states[zid]
                light_on = getattr(st, "light_state", False) if not isinstance(st, dict) else st.get("light_bool", False)
                mode_str = getattr(st, "mode", "AUTO") if not isinstance(st, dict) else st.get("mode", "AUTO")
                
                # Small status pill
                status_txt = f"{'ON' if light_on else 'OFF'}|{mode_str[:4]}"
                stat_col = (0, 255, 0) if light_on else (160, 160, 160)
                cv2.putText(
                    frame, status_txt, (x1 + badge_w + 10, y1 + 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.40, stat_col, 1, cv2.LINE_AA
                )
