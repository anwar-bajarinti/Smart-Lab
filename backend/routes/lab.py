"""
Smart Lab Unified Automation & Sensor Telemetry API Routes.
Exposes the single master endpoint:
GET /api/lab/status
"""

from flask import Blueprint, jsonify, request, current_app

lab_bp = Blueprint("lab", __name__)


@lab_bp.route("/api/lab/status", methods=["GET"])
def get_lab_status():
    """
    Master unified status endpoint for external consumption.
    Provides complete state: Camera, People, Zones, Appliances, ESP32, and PZEM.
    """
    lab_service = current_app.config.get("LAB_SERVICE")
    if lab_service:
        status_data = lab_service.get_full_lab_status()
    else:
        # Fallback minimal response if lab_service not mounted
        status_data = {
            "camera": {"online": False, "cctv_stream_url": "/api/cctv/stream"},
            "people_count": 0,
            "people": [],
            "zones": {},
            "appliances": {"light1": "OFF", "light2": "OFF"},
            "esp32": {"online": False, "relay1": "OFF", "relay2": "OFF"},
            "pzem": {
                "measured_device": "Light 1",
                "measured_zone": "Z1",
                "voltage": None,
                "current": None,
                "power": None,
                "energy": None,
                "frequency": None,
                "power_factor": None,
                "valid": False,
                "status": "OFFLINE"
            }
        }
    return jsonify(status_data)


@lab_bp.route("/api/lab/sync", methods=["POST"])
def sync_lab_state():
    """
    Internal synchronization endpoint for the computer vision controller
    and hardware bridge to push real-time automation state into the API.
    """
    data = request.get_json(silent=True) or {}
    lab_service = current_app.config.get("LAB_SERVICE")
    if not lab_service:
        return jsonify({"success": False, "error": "LabService not active"}), 500

    zone_states = data.get("zone_states", {})
    people = data.get("people", [])
    fps = data.get("fps", 0.0)
    camera_online = data.get("camera_online", True)
    esp32_summary = data.get("esp32")
    pzem_data = data.get("pzem")

    lab_service.update_vision_state(
        zone_states=zone_states,
        people=people,
        fps=fps,
        camera_online=camera_online
    )

    if esp32_summary or pzem_data:
        lab_service.update_hardware_state(
            esp32_summary=esp32_summary,
            pzem_data=pzem_data
        )

    # Also sync zone service for backward-compatibility with existing routes
    zone_service = current_app.config.get("ZONE_SERVICE")
    if zone_service and zone_states:
        zone_service.sync_from_vision(zone_states)

    return jsonify({"success": True, "message": "Laboratory state synchronized"})
