import urllib.request
import json
import base64
import cv2
import numpy as np
import sys

def test_endpoint(payload_dict):
    payload = json.dumps(payload_dict).encode('utf-8')
    req = urllib.request.Request(
        'http://127.0.0.1:8000/api/scan-id',
        data=payload,
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    resp = urllib.request.urlopen(req, timeout=15)
    return json.loads(resp.read().decode('utf-8'))

def img_to_b64(img):
    _, buf = cv2.imencode('.png', img)
    return 'data:image/png;base64,' + base64.b64encode(buf).decode('utf-8')

print("==================================================")
print("RUNNING AUTOMATED OCR PIPELINE INTEGRATION TESTS")
print("==================================================")

# 1. Health check
print("\n[TEST 1] GET /api/health")
health_req = urllib.request.Request('http://127.0.0.1:8000/api/health')
health_resp = json.loads(urllib.request.urlopen(health_req, timeout=5).read().decode('utf-8'))
print("Result:", health_resp)
assert health_resp.get("status") == "ok", "Health status is not ok"
assert health_resp.get("ready") is True, "Ready is not true"
print("[PASSED] Test Passed!")

# 2. Blank Image (Pending Status)
print("\n[TEST 2] Blank Image -> status: pending")
blank = np.zeros((100, 100, 3), dtype=np.uint8)
res2 = test_endpoint({'image': img_to_b64(blank)})
print("Result:", res2)
assert res2["status"] == "pending", f"Expected pending, got {res2['status']}"
assert res2["name"] is None, "Name should be None"
assert res2["roll_number"] is None, "Roll should be None"
print("[PASSED]")

# 3. Roll Number Only (Partial Status)
print("\n[TEST 3] Roll Number Only -> status: partial")
roll_only = np.ones((200, 500, 3), dtype=np.uint8) * 255
cv2.putText(roll_only, 'COLLEGE ID', (30, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
cv2.putText(roll_only, '238W1A0477', (30, 110), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 0), 2)
cv2.putText(roll_only, 'DEPARTMENT ECE', (30, 160), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2)
res3 = test_endpoint({'image': img_to_b64(roll_only)})
print("Result:", res3)
assert res3["status"] == "partial", f"Expected partial, got {res3['status']}"
assert res3["roll_number"] is not None, f"Expected roll number, got None"
assert res3["name"] is None, f"Expected name to be None in partial roll test"
print("[PASSED]")

# 4. Success (Name + Roll Number)
print("\n[TEST 4] Name + Roll Number -> status: success")
full_card = np.ones((300, 600, 3), dtype=np.uint8) * 255
cv2.putText(full_card, 'SIDDHARTHA ENGINEERING COLLEGE', (30, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2)
cv2.putText(full_card, 'BODDU SURYA TEJA', (40, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 0), 2)
cv2.putText(full_card, '238W1A04C2', (40, 190), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 0), 2)
cv2.putText(full_card, 'BRANCH ECE', (40, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2)
res4 = test_endpoint({'image': img_to_b64(full_card)})
print("Result:", res4)
assert res4["status"] == "success", f"Expected success, got {res4['status']}"
assert res4["roll_number"] == "238W1A04C2", f"Expected 238W1A04C2, got {res4['roll_number']}"
assert "SURYA TEJA" in (res4["name"] or ""), f"Expected SURYA TEJA in name, got {res4['name']}"
print("[PASSED]")

# 5. Invalid / Random text rejection
print("\n[TEST 5] Random Text Rejection (No false positives)")
noise = np.ones((200, 400, 3), dtype=np.uint8) * 255
cv2.putText(noise, 'JUST RANDOM WORDS', (20, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
res5 = test_endpoint({'image': img_to_b64(noise)})
print("Result:", res5)
assert res5["roll_number"] is None, f"Roll number should be None for random words, got {res5['roll_number']}"
print("[PASSED]")

print("\n==================================================")
print("ALL 5 OCR INTEGRATION TESTS PASSED SUCCESSFULLY!")
print("==================================================")
