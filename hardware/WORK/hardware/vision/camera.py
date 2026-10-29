"""
Camera capture interface supporting physical laptop webcams,
threaded continuous capture, frame mirroring, and MJPEG encoding.
"""

import threading
import time
from typing import Optional, Tuple
import cv2
import numpy as np


class Camera:
    """
    High-performance webcam capture abstraction.
    """

    def __init__(
        self,
        device_index: int = 0,
        width: int = 1280,
        height: int = 720,
        fps: int = 30,
        mirror: bool = True
    ):
        self.device_index = device_index
        self.target_width = width
        self.target_height = height
        self.target_fps = fps
        self.mirror = mirror

        self.cap: Optional[cv2.VideoCapture] = None
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        
        self._latest_frame: Optional[np.ndarray] = None
        self._frame_timestamp: float = 0.0
        self.is_opened = False

        self._init_camera()

    def _init_camera(self):
        """Attempts to open the video capture device using DirectShow or MSMF."""
        try:
            # On Windows, cv2.CAP_DSHOW or cv2.CAP_MSMF provides fast initialization
            self.cap = cv2.VideoCapture(self.device_index, cv2.CAP_DSHOW)
            if not self.cap.isOpened():
                # Fallback to default backend
                self.cap = cv2.VideoCapture(self.device_index)

            if self.cap.isOpened():
                self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.target_width)
                self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.target_height)
                self.cap.set(cv2.CAP_PROP_FPS, self.target_fps)
                self.is_opened = True
                print(f"[Camera] Opened device {self.device_index} successfully.")
            else:
                print(f"[Camera] Warning: Could not open device {self.device_index}. Fallback frames will be generated.")
                self.is_opened = False
        except Exception as e:
            print(f"[Camera] Exception opening camera {self.device_index}: {e}")
            self.is_opened = False

    def start(self):
        """Starts asynchronous threaded capture."""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._thread.start()

    def _capture_loop(self):
        """Continuous background capture loop to avoid buffer lag."""
        while self._running:
            if self.is_opened and self.cap is not None:
                ret, frame = self.cap.read()
                if ret and frame is not None:
                    if self.mirror:
                        frame = cv2.flip(frame, 1)
                    with self._lock:
                        self._latest_frame = frame
                        self._frame_timestamp = time.time()
                else:
                    time.sleep(0.02)
            else:
                # Generate a clean synthetic test frame showing camera offline
                frame = np.zeros((self.target_height, self.target_width, 3), dtype=np.uint8)
                cv2.putText(
                    frame, "CAMERA INITIALIZING / OFFLINE", (50, self.target_height // 2),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 165, 255), 2, cv2.LINE_AA
                )
                with self._lock:
                    self._latest_frame = frame
                    self._frame_timestamp = time.time()
                time.sleep(0.05)

    def read(self) -> Tuple[bool, Optional[np.ndarray]]:
        """Reads the latest frame from the capture stream."""
        if not self._running:
            # Synchronous read if thread is not active
            if self.is_opened and self.cap is not None:
                ret, frame = self.cap.read()
                if ret and frame is not None:
                    if self.mirror:
                        frame = cv2.flip(frame, 1)
                    return True, frame
            # Return synthetic if not open
            frame = np.zeros((self.target_height, self.target_width, 3), dtype=np.uint8)
            cv2.putText(
                frame, "NO CAMERA ATTACHED", (50, self.target_height // 2),
                cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 255), 2, cv2.LINE_AA
            )
            return True, frame

        with self._lock:
            if self._latest_frame is not None:
                return True, self._latest_frame.copy()
            return False, None

    def get_jpeg(self, quality: int = 80) -> Optional[bytes]:
        """Encodes the latest frame as JPEG bytes for web streaming."""
        success, frame = self.read()
        if not success or frame is None:
            return None
        ret, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
        if ret:
            return buffer.tobytes()
        return None

    def release(self):
        """Safely stops threads and releases camera hardware."""
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1.0)
        if self.cap and self.cap.isOpened():
            self.cap.release()
            print("[Camera] Released camera hardware.")
        self.is_opened = False
