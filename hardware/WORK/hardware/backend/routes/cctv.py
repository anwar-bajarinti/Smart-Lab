"""
CCTV Live Video Streaming Routes.
Provides a clean, unannotated CCTV camera stream exactly like a security camera:
- NO 3x3 grid
- NO zone labels
- NO bounding boxes
- NO person IDs
- NO skeletons
- NO gesture or AUTO/MANUAL labels
"""

import time
import cv2
import numpy as np
from flask import Blueprint, Response, request, jsonify, current_app

cctv_bp = Blueprint("cctv", __name__)


def generate_clean_cctv_stream(lab_service=None, vc=None, cam=None, max_iterations=None):
    """
    Generator yielding clean, unannotated JPEG frames for the CCTV stream.
    Single capture: frames come directly from raw webcam before any AI drawing.
    """
    fallback_frame = None
    count = 0

    while True:
        if max_iterations is not None and count >= max_iterations:
            break
        count += 1

        frame_bytes = None

        # 1. Check LabService
        if lab_service:
            frame_bytes = lab_service.get_clean_frame()

        # 2. Check direct VisionController if attached
        if frame_bytes is None and vc:
            frame_bytes = vc.get_clean_jpeg()

        # 3. Check direct Camera if attached
        if frame_bytes is None and cam:
            frame_bytes = cam.get_jpeg()

        # 4. Generate clean standby frame if camera offline
        if frame_bytes is None:
            if fallback_frame is None:
                img = np.zeros((720, 1280, 3), dtype=np.uint8)
                cv2.putText(
                    img, "SMART LAB CCTV - CAMERA CONNECTING / STANDBY",
                    (120, 360), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (180, 180, 180), 2, cv2.LINE_AA
                )
                _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 75])
                fallback_frame = buf.tobytes()
            frame_bytes = fallback_frame
            time.sleep(0.08)

        yield (b"--frame\r\n"
               b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n")
        time.sleep(0.033)  # ~30 FPS


@cctv_bp.route("/api/cctv/stream", methods=["GET"])
def cctv_stream():
    """
    Main clean CCTV video stream endpoint.
    Consumable via standard browser or <img> tag by external websites:
    <img src="http://localhost:5000/api/cctv/stream" />
    """
    lab_service = current_app.config.get("LAB_SERVICE")
    vc = current_app.config.get("VISION_CONTROLLER")
    cam = current_app.config.get("CAMERA")
    return Response(
        generate_clean_cctv_stream(lab_service=lab_service, vc=vc, cam=cam),
        mimetype="multipart/x-mixed-replace; boundary=frame"
    )


@cctv_bp.route("/api/cctv/frame", methods=["POST"])
def post_clean_frame():
    """
    Receives clean JPEG frames from an external vision controller process.
    """
    jpeg_bytes = request.data
    fps = request.args.get("fps", type=float, default=0.0)
    if jpeg_bytes:
        lab_service = current_app.config.get("LAB_SERVICE")
        if lab_service:
            lab_service.set_clean_frame(jpeg_bytes, fps=fps)
        return jsonify({"success": True})
    return jsonify({"success": False, "error": "Empty frame data"}), 400
