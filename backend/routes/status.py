"""
System status and health check API routes.
"""

from flask import Blueprint, jsonify, current_app

status_bp = Blueprint("status", __name__)


@status_bp.route("/api/status", methods=["GET"])
def get_status():
    """Returns aggregated system telemetry, occupancy totals, and hardware link status."""
    zone_service = current_app.config["ZONE_SERVICE"]
    summary = zone_service.get_system_summary()
    return jsonify({
        "success": True,
        "system": {
            "name": "SMART LAB AUTOMATION SYSTEM",
            "version": "1.0.0",
            "status": "OPERATIONAL"
        },
        "summary": summary
    })
