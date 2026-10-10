"""
Automated Verification Suite for New CCTV Stream and Master Lab Status APIs.
Verifies:
1. Clean CCTV stream endpoint GET /api/cctv/stream
2. Master Automation Status endpoint GET /api/lab/status
3. State synchronization endpoint POST /api/lab/sync
4. Clean frame posting endpoint POST /api/cctv/frame
5. Single capture distribution: clean frame vs AI processed frame
6. Single PZEM sensor telemetry reporting with measured_device & measured_zone
"""

import json
import pytest
import numpy as np
import cv2
from backend.app import create_app
from vision.controller import VisionController
from vision.esp32_relay_bridge import ESP32RelayBridge


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client, app


def test_cctv_stream_endpoint(client):
    """Scenario 1: GET /api/cctv/stream returns 200 and MJPEG stream headers."""
    c, app = client
    res = c.get("/api/cctv/stream", buffered=False)
    assert res.status_code == 200
    assert "multipart/x-mixed-replace" in res.content_type
    assert "boundary=frame" in res.content_type
    first_chunk = next(res.response)
    assert b"--frame" in first_chunk
    assert b"Content-Type: image/jpeg" in first_chunk
    res.close()


def test_post_cctv_frame_endpoint(client):
    """Scenario 2: External vision process can push clean frame to /api/cctv/frame."""
    c, app = client
    # Generate simple test clean JPEG
    test_img = np.zeros((480, 640, 3), dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", test_img)
    jpeg_bytes = buf.tobytes()

    res = c.post("/api/cctv/frame?fps=29.5", data=jpeg_bytes, content_type="image/jpeg")
    assert res.status_code == 200
    assert res.get_json()["success"] is True

    lab_service = app.config.get("LAB_SERVICE")
    assert lab_service is not None
    assert lab_service.latest_clean_jpeg == jpeg_bytes
    assert lab_service.camera_fps == 29.5
    assert lab_service.camera_online is True


def test_master_lab_status_structure(client):
    """Scenario 3: GET /api/lab/status provides complete frontend-friendly structure."""
    c, _ = client
    res = c.get("/api/lab/status")
    assert res.status_code == 200
    data = res.get_json()

    # 1. Camera
    assert "camera" in data
    assert "online" in data["camera"]
    assert "cctv_stream_url" in data["camera"]
    assert data["camera"]["cctv_stream_url"] == "/api/cctv/stream"

    # 2. People
    assert "people_count" in data
    assert isinstance(data["people"], list)

    # 3. Zones
    assert "zones" in data
    for i in range(1, 10):
        zid = f"Z{i}"
        assert zid in data["zones"]
        z = data["zones"][zid]
        assert "occupied" in z
        assert "state" in z
        assert "mode" in z
        assert "device" in z
        assert "vacancy_timer_active" in z
        assert "vacancy_remaining_seconds" in z

    # Specific zone appliance assignments
    assert data["zones"]["Z1"]["device"] == "Light 1"
    assert data["zones"]["Z9"]["device"] == "Light 2"

    # 4. Appliances
    assert "appliances" in data
    assert "light1" in data["appliances"]
    assert "light2" in data["appliances"]

    # 5. ESP32
    assert "esp32" in data
    assert "online" in data["esp32"]
    assert "relay1" in data["esp32"]
    assert "relay2" in data["esp32"]

    # 6. PZEM
    assert "pzem" in data
    assert data["pzem"]["measured_device"] == "Light 1"
    assert data["pzem"]["measured_zone"] == "Z1"
    assert "voltage" in data["pzem"]
    assert "current" in data["pzem"]
    assert "power" in data["pzem"]
    assert "energy" in data["pzem"]
    assert "frequency" in data["pzem"]
    assert "power_factor" in data["pzem"]
    assert "valid" in data["pzem"]


def test_master_lab_sync_endpoint(client):
    """Scenario 4: POST /api/lab/sync updates lab state and is immediately reflected in status."""
    c, app = client

    sync_payload = {
        "zone_states": {
            "Z1": {
                "occupied": True,
                "occupants": [1],
                "light_state": "ON",
                "mode": "AUTO"
            },
            "Z9": {
                "occupied": True,
                "occupants": [2],
                "light_state": "OFF",
                "mode": "MANUAL_OFF"
            }
        },
        "people": [
            {"tracking_id": 1, "zone": "Z1", "stable_hand_count": 0, "mode": "AUTO", "gesture": "NONE"},
            {"tracking_id": 2, "zone": "Z9", "stable_hand_count": 1, "mode": "MANUAL_OFF", "gesture": "ONE_HAND_RAISED"}
        ],
        "fps": 30.0,
        "camera_online": True,
        "esp32": {
            "online": True,
            "port": "COM4",
            "relay1": "ON",
            "relay2": "OFF"
        },
        "pzem": {
            "measured_device": "Light 1",
            "measured_zone": "Z1",
            "voltage": 231.8,
            "current": 0.42,
            "power": 96.5,
            "energy": 1.24,
            "frequency": 50.0,
            "power_factor": 0.96,
            "valid": True,
            "status": "ONLINE"
        }
    }

    sync_res = c.post("/api/lab/sync", json=sync_payload)
    assert sync_res.status_code == 200

    # Query master status API to confirm updates
    status_res = c.get("/api/lab/status")
    assert status_res.status_code == 200
    st = status_res.get_json()

    assert st["people_count"] == 2
    assert st["people"][0]["zone"] == "Z1"
    assert st["people"][1]["mode"] == "MANUAL_OFF"

    assert st["zones"]["Z1"]["occupied"] is True
    assert st["zones"]["Z1"]["state"] == "ON"
    assert st["zones"]["Z9"]["occupied"] is True
    assert st["zones"]["Z9"]["state"] == "OFF"
    assert st["zones"]["Z9"]["mode"] == "MANUAL_OFF"

    assert st["appliances"]["light1"] == "ON"
    assert st["appliances"]["light2"] == "OFF"

    assert st["esp32"]["online"] is True
    assert st["esp32"]["relay1"] == "ON"
    assert st["esp32"]["relay2"] == "OFF"

    assert st["pzem"]["voltage"] == 231.8
    assert st["pzem"]["power"] == 96.5
    assert st["pzem"]["valid"] is True


def test_single_capture_distribution():
    """Scenario 5: VisionController caches clean unannotated frame separately from annotated frame."""
    vc = VisionController()
    raw = np.zeros((720, 1280, 3), dtype=np.uint8)
    # Put distinct white pixels in raw
    raw[100:150, 100:150] = 255

    annotated, _, _, _ = vc.process_frame(raw, current_time=1.0)

    # 1. vc.latest_clean_frame must be the exact raw frame
    assert vc.latest_clean_frame is raw
    # 2. annotated frame is a copy with overlays
    assert annotated is not raw

    # 3. get_clean_jpeg returns valid JPEG
    clean_bytes = vc.get_clean_jpeg()
    assert clean_bytes is not None
    assert clean_bytes.startswith(b"\xff\xd8")  # Standard JPEG magic header


def test_esp32_relay_bridge_pzem_handling():
    """Scenario 6: ESP32RelayBridge returns structured PZEM data without fake values when offline."""
    bridge = ESP32RelayBridge(config_path="config/relay_mapping.json")
    pzem = bridge.get_pzem_data()

    assert pzem["measured_device"] == "Light 1"
    assert pzem["measured_zone"] == "Z1"
    # When offline in emulation, valid should be False
    assert pzem["valid"] is False
    assert pzem["voltage"] is None

    summary = bridge.get_status_summary()
    assert "online" in summary
    assert "relay1" in summary
    assert "relay2" in summary
    bridge.close()


def test_master_lab_vacancy_delay_api(client):
    """
    Scenario 7: Master status API reflects exact vacancy contract when empty with timer active.
    """
    c, _ = client

    # Push active vacancy timer state
    sync_payload = {
        "zone_states": {
            "Z1": {
                "occupied": False,
                "occupant_ids": [],
                "light_state": "ON",
                "mode": "AUTO",
                "vacancy_timer_active": True,
                "vacancy_remaining_seconds": 7.4
            }
        },
        "people": [],
        "fps": 30.0,
        "camera_online": True
    }
    c.post("/api/lab/sync", json=sync_payload)

    res = c.get("/api/lab/status")
    assert res.status_code == 200
    st = res.get_json()

    z1 = st["zones"]["Z1"]
    assert z1["zone"] == "Z1"
    assert z1["occupied"] is False
    assert z1["device"] == "Light 1"
    assert z1["state"] == "ON"
    assert z1["vacancy_timer_active"] is True
    assert z1["vacancy_remaining_seconds"] == 7.4

    # Now person re-enters Z1
    reenter_payload = {
        "zone_states": {
            "Z1": {
                "occupied": True,
                "occupant_ids": [1],
                "light_state": "ON",
                "mode": "AUTO",
                "vacancy_timer_active": False,
                "vacancy_remaining_seconds": 0.0
            }
        },
        "people": [{"tracking_id": 1, "zone": "Z1"}],
        "fps": 30.0,
        "camera_online": True
    }
    c.post("/api/lab/sync", json=reenter_payload)

    res2 = c.get("/api/lab/status")
    st2 = res2.get_json()
    z1_re = st2["zones"]["Z1"]
    assert z1_re["zone"] == "Z1"
    assert z1_re["occupied"] is True
    assert z1_re["device"] == "Light 1"
    assert z1_re["state"] == "ON"
    assert z1_re["vacancy_timer_active"] is False
    assert z1_re["vacancy_remaining_seconds"] == 0.0
