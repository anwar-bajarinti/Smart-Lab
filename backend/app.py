"""
Smart Lab Automation - Master Backend Application.
Provides RESTful APIs for Zone control, Energy monitoring,
Vision synchronization, and ESP32 hardware bridge.
"""

import argparse
import json
import os
import sys
from flask import Flask, jsonify, send_from_directory, request

from backend.services.esp32_client import ESP32Client
from backend.services.zone_service import ZoneService
from backend.services.energy_service import EnergyService
from backend.services.lab_service import LabService
from backend.routes.zones import zones_bp
from backend.routes.status import status_bp
from backend.routes.energy import energy_bp
from backend.routes.vision import vision_bp
from backend.routes.cctv import cctv_bp
from backend.routes.lab import lab_bp


def load_config(config_path: str = "config/system_config.json") -> dict:
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[Backend] Error loading config: {e}")
    return {}


def create_app(config_path: str = "config/system_config.json", zones_path: str = "config/zones.json") -> Flask:
    """Application factory for Smart Lab Backend."""
    frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))
    
    app = Flask(__name__, static_folder=frontend_dir, static_url_path="")
    
    # Load configuration
    sys_cfg = load_config(config_path)
    esp_cfg = sys_cfg.get("esp32", {})
    mock_hw = esp_cfg.get("mock_hardware", True)

    # Initialize core services
    esp32_client = ESP32Client(
        host=esp_cfg.get("host", "192.168.1.150"),
        port=esp_cfg.get("port", 80),
        timeout=esp_cfg.get("timeout_sec", 1.0),
        mock_hardware=mock_hw
    )
    zone_service = ZoneService(zones_config_path=zones_path, esp32_client=esp32_client)
    lab_service = LabService(zone_service=zone_service, esp32_client=esp32_client)
    energy_service = EnergyService(esp32_client=esp32_client, lab_service=lab_service)

    # Store in app config for blueprint access
    app.config["ZONE_SERVICE"] = zone_service
    app.config["ESP32_CLIENT"] = esp32_client
    app.config["ENERGY_SERVICE"] = energy_service
    app.config["LAB_SERVICE"] = lab_service
    app.config["SYSTEM_CONFIG"] = sys_cfg

    # Register blueprints
    app.register_blueprint(zones_bp)
    app.register_blueprint(status_bp)
    app.register_blueprint(energy_bp)
    app.register_blueprint(vision_bp)
    app.register_blueprint(cctv_bp)
    app.register_blueprint(lab_bp)

    # Enable CORS for all incoming requests
    @app.after_request
    def apply_cors_headers(response):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        return response

    # Serve Frontend Single Page Application
    @app.route("/", methods=["GET"])
    def serve_index():
        if os.path.exists(os.path.join(frontend_dir, "index.html")):
            return send_from_directory(frontend_dir, "index.html")
        return jsonify({
            "name": "SMART LAB AUTOMATION API",
            "version": "1.0.0",
            "status": "RUNNING",
            "docs": "/api/status",
            "note": "Frontend index.html not yet built or located in frontend/"
        })

    @app.route("/<path:path>", methods=["GET"])
    def serve_static(path):
        file_path = os.path.join(frontend_dir, path)
        if os.path.exists(file_path):
            return send_from_directory(frontend_dir, path)
        return send_from_directory(frontend_dir, "index.html")

    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Smart Lab Automation Backend Server")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Binding host IP")
    parser.add_argument("--port", type=int, default=5000, help="Binding port")
    parser.add_argument("--config", type=str, default="config/system_config.json")
    args = parser.parse_args()

    app = create_app(config_path=args.config)
    print("==================================================")
    print("      SMART LAB AUTOMATION - BACKEND SERVER       ")
    print("==================================================")
    print(f" Listening on : http://{args.host}:{args.port}")
    print(f" REST API Root: http://localhost:{args.port}/api/status")
    print(f" Dashboard    : http://localhost:{args.port}/")
    print("==================================================")
    app.run(host=args.host, port=args.port, debug=False, threaded=True)
