"""
Energy and electrical load API routes.
"""

from flask import Blueprint, jsonify, current_app

energy_bp = Blueprint("energy", __name__)


@energy_bp.route("/api/energy", methods=["GET"])
def get_energy():
    """Returns current power measurements from the PZEM-004T sensor."""
    energy_service = current_app.config["ENERGY_SERVICE"]
    metrics = energy_service.get_current_metrics()
    return jsonify({
        "success": True,
        "metrics": metrics.to_dict()
    })


@energy_bp.route("/api/energy/history", methods=["GET"])
def get_energy_history():
    """Returns telemetry history for frontend charts."""
    energy_service = current_app.config["ENERGY_SERVICE"]
    return jsonify({
        "success": True,
        "history": energy_service.get_history()
    })
