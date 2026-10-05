"""
Integration tests for Flask Backend REST API endpoints.
"""

import json
import pytest
from backend.app import create_app


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def test_api_status(client):
    """Verify system status endpoint."""
    res = client.get("/api/status")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert "summary" in data
    assert data["summary"]["total_zones"] == 9


def test_api_get_zones(client):
    """Verify zones endpoint returns all 9 zones."""
    res = client.get("/api/zones")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert len(data["zones"]) == 9
    zids = [z["zone_id"] for z in data["zones"]]
    assert "Z1" in zids
    assert "Z9" in zids


def test_api_light_control(client):
    """Verify POST /api/zones/{zone}/light/on and off."""
    # Turn ON
    res_on = client.post("/api/zones/Z1/light/on")
    assert res_on.status_code == 200
    data_on = res_on.get_json()
    assert data_on["success"] is True
    assert data_on["light_state"] == "ON"
    assert data_on["mode"] == "MANUAL_ON"

    # Turn OFF
    res_off = client.post("/api/zones/Z1/light/off")
    assert res_off.status_code == 200
    data_off = res_off.get_json()
    assert data_off["success"] is True
    assert data_off["light_state"] == "OFF"
    assert data_off["mode"] == "MANUAL_OFF"


def test_api_fan_control(client):
    """Verify POST /api/zones/{zone}/fan/on, off, and speed."""
    # Turn ON
    res_on = client.post("/api/zones/Z1/fan/on", json={"speed": 80})
    assert res_on.status_code == 200
    assert res_on.get_json()["fan_state"] == "ON"
    assert res_on.get_json()["fan_speed"] == 80

    # Set Speed
    res_spd = client.post("/api/zones/Z1/fan/speed", json={"speed": 45})
    assert res_spd.status_code == 200
    assert res_spd.get_json()["fan_speed"] == 45

    # Turn OFF
    res_off = client.post("/api/zones/Z1/fan/off")
    assert res_off.status_code == 200
    assert res_off.get_json()["fan_state"] == "OFF"


def test_api_energy(client):
    """Verify energy endpoint."""
    res = client.get("/api/energy")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert "voltage" in data["metrics"]
    assert "power" in data["metrics"]


def test_api_vision_sync(client):
    """Verify vision sync endpoint."""
    payload = {
        "zone_states": {
            "Z5": {
                "occupied": True,
                "occupancy_state": "OCCUPIED",
                "light_state": "ON",
                "fan_state": "ON",
                "fan_speed": 75,
                "mode": "AUTO"
            }
        },
        "people": [{"tracking_id": 1, "zone": "Z5", "mode": "AUTO"}],
        "fps": 28.5
    }
    res = client.post("/api/vision/sync", json=payload)
    assert res.status_code == 200
    assert res.get_json()["success"] is True

    # Check that zone was updated in zone service
    res_z5 = client.get("/api/zones/Z5")
    assert res_z5.status_code == 200
    z5 = res_z5.get_json()["zone"]
    assert z5["occupied"] is True
    assert z5["light_state"] == "ON"
