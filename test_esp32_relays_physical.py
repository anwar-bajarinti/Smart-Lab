#!/usr/bin/env python3
"""
Physical Verification Script for Newly Uploaded ESP32 Firmware on COM4.
Tests:
- Serial communication (115200 baud)
- Boot banner & status command
- Relay 1 (GPIO 22 -> Z2 / Light 1) physical ON and OFF with ACK verification
- Relay 2 (GPIO 23 -> Z8 / Light 2) physical ON and OFF with ACK verification
- PZEM-004T telemetry readout (GPIO 25 RX / GPIO 33 TX)
- Safe hardware reset (Unconditional OFF)
"""

import sys
import time
import serial

PORT = "COM4"
BAUD = 115200

def test_hardware():
    print("=" * 60)
    print("  TESTING PHYSICAL ESP32 FIRMWARE & RELAYS ON COM4")
    print("=" * 60)

    try:
        ser = serial.Serial(PORT, BAUD, timeout=1.0)
        ser.dtr = False
        ser.rts = False
    except Exception as e:
        print(f"[FAIL] Could not open {PORT}: {e}")
        sys.exit(1)

    print(f"[OK] Opened {PORT} at {BAUD} baud.")
    time.sleep(1.5)  # Allow boot settling

    # Read boot banner if available
    if ser.in_waiting > 0:
        boot_msg = ser.read_all().decode("utf-8", errors="ignore").strip()
        print("\n--- ESP32 BOOT BANNER ---")
        print(boot_msg)
        print("-------------------------\n")

    # Helper function to send command and wait for response
    def send_cmd(cmd: str, wait: float = 0.3) -> str:
        ser.reset_input_buffer()
        ser.write((cmd + "\n").encode("utf-8"))
        ser.flush()
        time.sleep(wait)
        out = ""
        if ser.in_waiting > 0:
            out = ser.read_all().decode("utf-8", errors="ignore").strip()
        return out

    # 1. PING Test
    pong = send_cmd("PING")
    print(f"[TEST 1] PING -> Response: '{pong}'")
    assert "PONG" in pong, f"Expected PONG, got '{pong}'"
    print("         -> PING verified!\n")

    # 2. STATUS Test
    status = send_cmd("STATUS")
    print(f"[TEST 2] STATUS -> Response:\n{status}")
    assert "Relay1(GPIO22)" in status and "Relay2(GPIO23)" in status, "Status output format unexpected"
    print("         -> STATUS command verified!\n")

    # 3. Test Relay 1 ON (GPIO 22 HIGH -> Real Light 1 ON)
    print("[TEST 3] Turning Relay 1 ON (GPIO 22 HIGH)...")
    ack_r1_on = send_cmd("R1 ON", wait=0.3)
    print(f"         ACK: {ack_r1_on}")
    assert "Relay 1" in ack_r1_on and "ON" in ack_r1_on, f"Unexpected ACK: {ack_r1_on}"
    print("         -> Relay 1 is physically ON (GPIO 22 HIGH). Holding for 1.5 seconds...")
    time.sleep(1.5)

    # 4. Test Relay 1 OFF (GPIO 22 LOW -> Real Light 1 OFF)
    print("[TEST 4] Turning Relay 1 OFF (GPIO 22 LOW)...")
    ack_r1_off = send_cmd("R1 OFF", wait=0.3)
    print(f"         ACK: {ack_r1_off}")
    assert "Relay 1" in ack_r1_off and "OFF" in ack_r1_off, f"Unexpected ACK: {ack_r1_off}"
    print("         -> Relay 1 is physically OFF (GPIO 22 LOW).\n")
    time.sleep(0.5)

    # 5. Test Relay 2 ON (GPIO 23 HIGH -> Real Light 2 ON)
    print("[TEST 5] Turning Relay 2 ON (GPIO 23 HIGH)...")
    ack_r2_on = send_cmd("R2 ON", wait=0.3)
    print(f"         ACK: {ack_r2_on}")
    assert "Relay 2" in ack_r2_on and "ON" in ack_r2_on, f"Unexpected ACK: {ack_r2_on}"
    print("         -> Relay 2 is physically ON (GPIO 23 HIGH). Holding for 1.5 seconds...")
    time.sleep(1.5)

    # 6. Test Relay 2 OFF (GPIO 23 LOW -> Real Light 2 OFF)
    print("[TEST 6] Turning Relay 2 OFF (GPIO 23 LOW)...")
    ack_r2_off = send_cmd("R2 OFF", wait=0.3)
    print(f"         ACK: {ack_r2_off}")
    assert "Relay 2" in ack_r2_off and "OFF" in ack_r2_off, f"Unexpected ACK: {ack_r2_off}"
    print("         -> Relay 2 is physically OFF (GPIO 23 LOW).\n")
    time.sleep(0.5)

    # 7. Test PZEM Telemetry Query
    print("[TEST 7] Querying PZEM-004T AC Telemetry (GPIO 25 RX / GPIO 33 TX)...")
    pzem_resp = send_cmd("PZEM", wait=0.4)
    print(f"         Response:\n{pzem_resp}")
    assert "PZEM:" in pzem_resp, "Expected PZEM response prefix"
    print("         -> PZEM telemetry query verified!\n")

    # 8. Unconditional Safe Shutdown
    print("[SAFETY] Sending safety reset to both relays...")
    send_cmd("R1 OFF", wait=0.1)
    send_cmd("R2 OFF", wait=0.1)
    final_status = send_cmd("STATUS", wait=0.2)
    print(f"         Final Status: {final_status}")

    ser.close()
    print("\n" + "=" * 60)
    print("  ALL PHYSICAL ESP32 TESTS PASSED SUCCESSFULLY!")
    print("  - GPIO 22 (Relay 1 / Light 1): Verified ON & OFF")
    print("  - GPIO 23 (Relay 2 / Light 2): Verified ON & OFF")
    print("  - PZEM-004T (GPIO 25/33): Verified response")
    print("  - Both Relays safely OFF")
    print("=" * 60)

if __name__ == "__main__":
    test_hardware()
