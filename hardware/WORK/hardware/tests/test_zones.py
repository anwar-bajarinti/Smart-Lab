"""
Unit tests for 3x3 laboratory zone spatial mapping and boundary calculation.
"""

import pytest
from vision.zone_manager import ZoneManager


def test_zone_manager_all_9_zones():
    """Verify that points in each of the 3x3 sectors map accurately to Z1..Z9."""
    zm = ZoneManager()
    width = 1200
    height = 900

    col_w = width / 3.0  # 400
    row_h = height / 3.0  # 300

    # Center points for each zone
    expected_mappings = {
        "Z1": (col_w * 0.5, row_h * 0.5),
        "Z2": (col_w * 1.5, row_h * 0.5),
        "Z3": (col_w * 2.5, row_h * 0.5),
        "Z4": (col_w * 0.5, row_h * 1.5),
        "Z5": (col_w * 1.5, row_h * 1.5),
        "Z6": (col_w * 2.5, row_h * 1.5),
        "Z7": (col_w * 0.5, row_h * 2.5),
        "Z8": (col_w * 1.5, row_h * 2.5),
        "Z9": (col_w * 2.5, row_h * 2.5),
    }

    for expected_zid, (cx, cy) in expected_mappings.items():
        actual_zid = zm.get_zone_for_point(cx, cy, width, height)
        assert actual_zid == expected_zid, f"Point ({cx}, {cy}) mapped to {actual_zid}, expected {expected_zid}"


def test_zone_manager_boundary_clamping():
    """Ensure coordinates at or outside the frame edge are safely clamped."""
    zm = ZoneManager()
    w, h = 1200, 900

    # Negative coordinates clamp to top-left (Z1)
    assert zm.get_zone_for_point(-50, -50, w, h) == "Z1"
    
    # Far bottom-right clamps to Z9
    assert zm.get_zone_for_point(2000, 1500, w, h) == "Z9"


def test_zone_manager_bounds_retrieval():
    """Verify zone bounding boxes."""
    zm = ZoneManager()
    w, h = 900, 600
    
    # Z5 is row 1, col 1
    x1, y1, x2, y2 = zm.get_zone_bounds("Z5", w, h)
    assert x1 == 300
    assert y1 == 200
    assert x2 == 600
    assert y2 == 400
