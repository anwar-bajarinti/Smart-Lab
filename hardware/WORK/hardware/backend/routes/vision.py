"""
Vision pipeline integration and MJPEG video streaming routes.
"""

import time
from flask import Blueprint, jsonify, request, Response, current_app

vision_bp = Blueprint("vision", __name__)

# Global storage for latest vision telemetry
latest_vision_data = {
    "fps": 0.0,
    "people": [],
    "last_sync": 0.0
}
latest_jpeg_frame = None


def set_latest_frame(jpeg_bytes: bytes):
    global latest_jpeg_frame
    latest_jpeg_frame = jpeg_bytes


@vision_bp.route("/api/vision/sync", methods=["POST"])
def sync_vision():
    """
    Receives real-time telemetry from the vision controller.
    """
    global latest_vision_data
    data = request.get_json(silent=True) or {}
    zone_states = data.get("zone_states", {})
    people = data.get("people", [])
    fps = data.get("fps", 0.0)

    latest_vision_data = {
        "fps": fps,
        "people": people,
        "last_sync": time.time()
    }

    # Dispatch to ZoneService to auto-trigger ESP32 relays if vision state changed
    zone_service = current_app.config["ZONE_SERVICE"]
    zone_service.sync_from_vision(zone_states)

    return jsonify({"success": True, "synced_zones": len(zone_states)})


@vision_bp.route("/api/vision/status", methods=["GET"])
def get_vision_status():
    """Returns the latest vision tracking status and active occupants."""
    return jsonify({
        "success": True,
        "data": latest_vision_data
    })


def generate_mjpeg_stream():
    """Generator yielding JPEG frames for live browser display."""
    global latest_jpeg_frame
    while True:
        # Check if camera is directly attached to app
        cam = current_app.config.get("CAMERA")
        frame_bytes = None
        if cam is not None:
            frame_bytes = cam.get_jpeg()
        elif latest_jpeg_frame is not None:
            frame_bytes = latest_jpeg_frame

        if frame_bytes is not None:
            yield (b"--frame\r\n"
                   b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n")
            time.sleep(0.04)  # ~25 FPS
        else:
            time.sleep(0.1)


@vision_bp.route("/api/vision/feed", methods=["GET"])
def get_vision_feed():
    """Provides an MJPEG stream for the frontend live vision monitor."""
    return Response(
        generate_mjpeg_stream(),
        mimetype="multipart/x-mixed-replace; boundary=frame"
    )
