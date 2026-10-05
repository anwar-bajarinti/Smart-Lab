"""
Zone management API routes.
"""

from flask import Blueprint, jsonify, request, current_app

zones_bp = Blueprint("zones", __name__)


@zones_bp.route("/api/zones", methods=["GET"])
def get_zones():
    """Returns all 9 lab zones and their current appliance and occupancy states."""
    zone_service = current_app.config["ZONE_SERVICE"]
    return jsonify({
        "success": True,
        "zones": zone_service.get_all_zones()
    })


@zones_bp.route("/api/zones/<zone_id>", methods=["GET"])
def get_zone_by_id(zone_id):
    """Returns details for a single zone."""
    zone_service = current_app.config["ZONE_SERVICE"]
    zone = zone_service.get_zone(zone_id)
    if not zone:
        return jsonify({"success": False, "error": f"Zone {zone_id} not found"}), 404
    return jsonify({"success": True, "zone": zone.to_dict()})


@zones_bp.route("/api/zones/<zone_id>/light/on", methods=["POST"])
def turn_light_on(zone_id):
    """Turns the zone light ON."""
    zone_service = current_app.config["ZONE_SERVICE"]
    result = zone_service.set_light(zone_id, state=True, source="api")
    status_code = 200 if result.get("success") else 400
    return jsonify(result), status_code


@zones_bp.route("/api/zones/<zone_id>/light/off", methods=["POST"])
def turn_light_off(zone_id):
    """Turns the zone light OFF."""
    zone_service = current_app.config["ZONE_SERVICE"]
    result = zone_service.set_light(zone_id, state=False, source="api")
    status_code = 200 if result.get("success") else 400
    return jsonify(result), status_code


@zones_bp.route("/api/zones/<zone_id>/fan/on", methods=["POST"])
def turn_fan_on(zone_id):
    """Turns the zone fan ON."""
    zone_service = current_app.config["ZONE_SERVICE"]
    data = request.get_json(silent=True) or {}
    speed = data.get("speed", 70)
    result = zone_service.set_fan(zone_id, state=True, speed=speed, source="api")
    status_code = 200 if result.get("success") else 400
    return jsonify(result), status_code


@zones_bp.route("/api/zones/<zone_id>/fan/off", methods=["POST"])
def turn_fan_off(zone_id):
    """Turns the zone fan OFF."""
    zone_service = current_app.config["ZONE_SERVICE"]
    result = zone_service.set_fan(zone_id, state=False, source="api")
    status_code = 200 if result.get("success") else 400
    return jsonify(result), status_code


@zones_bp.route("/api/zones/<zone_id>/fan/speed", methods=["POST"])
def set_fan_speed(zone_id):
    """Sets zone fan dimmer speed (0-100%)."""
    zone_service = current_app.config["ZONE_SERVICE"]
    data = request.get_json(silent=True) or {}
    if "speed" not in data:
        return jsonify({"success": False, "error": "Missing 'speed' parameter (0-100)"}), 400
    try:
        speed = int(data["speed"])
    except ValueError:
        return jsonify({"success": False, "error": "Invalid speed value; must be integer"}), 400

    state = speed > 0
    result = zone_service.set_fan(zone_id, state=state, speed=speed, source="api")
    status_code = 200 if result.get("success") else 400
    return jsonify(result), status_code
