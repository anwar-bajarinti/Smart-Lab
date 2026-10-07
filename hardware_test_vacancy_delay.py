"""
Real Hardware Verification Script for 10-Second Vacancy Delay.
Runs with REAL ESP32 on COM4 controlling Physical Relays:
- Relay 1: GPIO 22 -> Light 1 (Zone Z2)
- Relay 2: GPIO 23 -> Light 2 (Zone Z8)

Executes Tests 1 to 5 per user requirement:
TEST 1: Person enters Z2 -> GPIO 22 HIGH -> Light 1 ON
TEST 2: Person leaves Z2 -> wait 5s -> Light 1 MUST STILL BE ON
TEST 3: Continue until 10s -> GPIO 22 LOW -> Light 1 OFF
TEST 4: Person re-enters Z2 before 10s -> timer cancelled -> Light 1 stays ON
TEST 5: Repeat for Z8 / GPIO 23 / Light 2
"""

import sys
import time
from vision.zone_state import ZoneState, VACANCY_GRACE_PERIOD
from vision.person_state import PersonState
from vision.esp32_relay_bridge import ESP32RelayBridge


def run_hardware_tests():
    print("=================================================================")
    print("SMART LAB — PHYSICAL HARDWARE VACANCY DELAY TEST SUITE (COM4)")
    print("=================================================================")
    print(f"Configured VACANCY_GRACE_PERIOD: {VACANCY_GRACE_PERIOD} seconds")

    # 1. Connect to REAL ESP32 (No emulation allowed)
    bridge = ESP32RelayBridge(config_path="config/relay_mapping.json", port="COM4")
    if not bridge.is_connected:
        print("[ERROR] Physical ESP32 on COM4 not detected or could not be opened!")
        print("Please ensure no other application (e.g. Arduino Serial Monitor) is locking COM4.")
        sys.exit(1)

    print(f"[OK] Physical ESP32 CONNECTED on {bridge.serial_port} at {bridge.baud_rate} baud.\n")

    # Initial state: Ensure both relays are OFF
    bridge.send_relay_command("1", False)
    bridge.send_relay_command("2", False)
    time.sleep(0.5)

    # =========================================================================
    # TEST 1: Person enters Z2 -> GPIO 22 HIGH -> Light 1 ON
    # =========================================================================
    print(">>> RUNNING TEST 1: Person enters Z2")
    z2 = ZoneState("Z2", leave_timeout_sec=10.0)
    p1 = PersonState(tracking_id=1)
    p1.zone = "Z2"

    t0 = time.time()
    z2.update([p1], current_time=t0)
    bridge.sync_zone_states({"Z2": z2.to_dict(), "Z8": {"light_bool": False}})
    
    assert z2.occupied is True, "Z2 should be occupied"
    assert z2.light_state is True, "Z2 light_state should be True"
    assert bridge.relay_states["1"] is True, "Relay 1 must be ON"
    print("  [PASS] Test 1: Z2 OCCUPIED -> GPIO 22 HIGH -> Real Relay 1 / Light 1 ON!\n")
    time.sleep(1.0)

    # =========================================================================
    # TEST 2: Person leaves Z2 -> wait 5s -> Light 1 MUST STILL BE ON
    # =========================================================================
    print(">>> RUNNING TEST 2: Person leaves Z2 -> Wait 5 seconds (Live Real-Time)")
    # Person leaves
    t_leave = time.time()
    z2.update([], current_time=t_leave)
    bridge.sync_zone_states({"Z2": z2.to_dict(), "Z8": {"light_bool": False}})

    assert z2.occupied is False, "Z2 should be physically EMPTY immediately"
    assert z2.vacancy_timer_active is True, "Vacancy timer must start immediately"
    assert bridge.relay_states["1"] is True, "Relay 1 must NOT turn off immediately!"
    print("  -> Person left. Vacancy timer started (10.0s). Waiting 5 real seconds...")

    # Wait 5 real seconds with live progress check
    for sec in range(1, 6):
        time.sleep(1.0)
        now = time.time()
        z2.update([], current_time=now)
        bridge.sync_zone_states({"Z2": z2.to_dict(), "Z8": {"light_bool": False}})
        print(f"     [t = {sec}s] Remaining: {z2.vacancy_remaining_seconds:.1f}s | Light 1: {'ON' if z2.light_state else 'OFF'} | Relay 1: {'ON' if bridge.relay_states['1'] else 'OFF'}")
        assert z2.light_state is True, "Light must remain ON at 5s"
        assert bridge.relay_states["1"] is True, "Relay 1 (GPIO 22) must remain HIGH at 5s"

    print("  [PASS] Test 2: At 5.0 seconds empty -> Real Relay 1 / Light 1 STILL ON!\n")

    # =========================================================================
    # TEST 3: Continue until 10 seconds -> GPIO 22 LOW -> Light 1 OFF
    # =========================================================================
    print(">>> RUNNING TEST 3: Continue until 10 seconds elapsed -> Light 1 OFF")
    for sec in range(6, 12):
        time.sleep(1.0)
        now = time.time()
        z2.update([], current_time=now)
        bridge.sync_zone_states({"Z2": z2.to_dict(), "Z8": {"light_bool": False}})
        elapsed = now - t_leave
        print(f"     [t = {elapsed:.1f}s] Remaining: {z2.vacancy_remaining_seconds:.1f}s | Light 1: {'ON' if z2.light_state else 'OFF'} | Relay 1: {'ON' if bridge.relay_states['1'] else 'OFF'}")

    assert z2.vacancy_timer_active is False, "Vacancy timer should be expired"
    assert z2.light_state is False, "Z2 light should be turned OFF after 10s"
    assert bridge.relay_states["1"] is False, "Relay 1 (GPIO 22) must be turned LOW"
    assert z2.mode == "AUTO", "Zone must reset to AUTO"
    print("  [PASS] Test 3: Complete 10s elapsed -> GPIO 22 LOW -> Real Relay 1 / Light 1 OFF!\n")
    time.sleep(1.0)

    # =========================================================================
    # TEST 4: Person enters Z2 again before 10s -> Cancel timer -> Light remains ON
    # =========================================================================
    print(">>> RUNNING TEST 4: Person re-enters Z2 at 5 seconds -> Cancel Timer")
    # Person enters Z2
    now = time.time()
    z2.update([p1], current_time=now)
    bridge.sync_zone_states({"Z2": z2.to_dict(), "Z8": {"light_bool": False}})
    assert bridge.relay_states["1"] is True, "Relay 1 must be ON"
    print("  -> Person entered Z2: Light 1 ON (GPIO 22 HIGH)")
    time.sleep(1.0)

    # Person leaves Z2 -> timer starts
    t_leave2 = time.time()
    z2.update([], current_time=t_leave2)
    bridge.sync_zone_states({"Z2": z2.to_dict(), "Z8": {"light_bool": False}})
    assert z2.vacancy_timer_active is True, "Timer must be active"
    print("  -> Person leaves Z2: Timer started. Waiting 4 seconds...")
    time.sleep(4.0)

    # Person re-enters at 4.0s (< 10.0s)
    t_reenter = time.time()
    z2.update([p1], current_time=t_reenter)
    bridge.sync_zone_states({"Z2": z2.to_dict(), "Z8": {"light_bool": False}})
    assert z2.occupied is True, "Z2 must be OCCUPIED"
    assert z2.vacancy_timer_active is False, "Timer must be CANCELLED"
    assert z2.vacancy_remaining_seconds == 0.0, "Remaining seconds must reset to 0"
    assert z2.light_state is True, "Light 1 must remain ON"
    assert bridge.relay_states["1"] is True, "Relay 1 must stay ON without toggling"
    print("  -> Person re-entered! Vacancy timer cancelled! Light 1 stays ON.")

    # Continue past 10s to verify light remains ON continuously
    time.sleep(6.0)
    now = time.time()
    z2.update([p1], current_time=now)
    bridge.sync_zone_states({"Z2": z2.to_dict(), "Z8": {"light_bool": False}})
    assert z2.light_state is True, "Light 1 must stay ON indefinitely while occupied"
    assert bridge.relay_states["1"] is True, "Relay 1 must stay HIGH"
    print("  [PASS] Test 4: Timer cancelled on re-entry -> Real Light 1 stays ON!\n")

    # Clean up Z2
    z2.update([], current_time=time.time() + 11.0)
    bridge.sync_zone_states({"Z2": z2.to_dict(), "Z8": {"light_bool": False}})
    time.sleep(1.0)

    # =========================================================================
    # TEST 5: Repeat exact test sequence for Z8 / GPIO 23 / Light 2 (Relay 2)
    # =========================================================================
    print(">>> RUNNING TEST 5: Testing Z8 / Light 2 / Relay 2 (GPIO 23)")
    z8 = ZoneState("Z8", leave_timeout_sec=10.0)
    p2 = PersonState(tracking_id=2)
    p2.zone = "Z8"

    # Step 5A: Enter Z8 -> Light 2 ON
    now = time.time()
    z8.update([p2], current_time=now)
    bridge.sync_zone_states({"Z2": {"light_bool": False}, "Z8": z8.to_dict()})
    assert z8.occupied is True, "Z8 should be occupied"
    assert z8.light_state is True, "Z8 light_state should be True"
    assert bridge.relay_states["2"] is True, "Relay 2 (GPIO 23) must be ON"
    print("  -> Step 5A: Person in Z8 -> GPIO 23 HIGH -> Real Relay 2 / Light 2 ON!")
    time.sleep(1.0)

    # Step 5B: Leave Z8 -> Wait 5s -> Must remain ON
    t_leave_z8 = time.time()
    z8.update([], current_time=t_leave_z8)
    bridge.sync_zone_states({"Z2": {"light_bool": False}, "Z8": z8.to_dict()})
    assert z8.occupied is False, "Z8 physically empty"
    assert z8.vacancy_timer_active is True, "Z8 vacancy timer active"
    print("  -> Step 5B: Person leaves Z8 -> Vacancy timer active. Waiting 5 real seconds...")
    for sec in range(1, 6):
        time.sleep(1.0)
        now = time.time()
        z8.update([], current_time=now)
        bridge.sync_zone_states({"Z2": {"light_bool": False}, "Z8": z8.to_dict()})
        print(f"     [t = {sec}s] Remaining: {z8.vacancy_remaining_seconds:.1f}s | Light 2: {'ON' if z8.light_state else 'OFF'} | Relay 2: {'ON' if bridge.relay_states['2'] else 'OFF'}")
        assert z8.light_state is True
        assert bridge.relay_states["2"] is True

    print("  -> Step 5B Passed: Relay 2 STILL ON at 5s.")

    # Step 5C: Wait until 10s -> Turns OFF
    print("  -> Step 5C: Waiting until 10.0s complete...")
    for sec in range(6, 12):
        time.sleep(1.0)
        now = time.time()
        z8.update([], current_time=now)
        bridge.sync_zone_states({"Z2": {"light_bool": False}, "Z8": z8.to_dict()})
        elapsed = now - t_leave_z8
        print(f"     [t = {elapsed:.1f}s] Remaining: {z8.vacancy_remaining_seconds:.1f}s | Light 2: {'ON' if z8.light_state else 'OFF'} | Relay 2: {'ON' if bridge.relay_states['2'] else 'OFF'}")

    assert z8.vacancy_timer_active is False
    assert z8.light_state is False
    assert bridge.relay_states["2"] is False, "Relay 2 (GPIO 23) must be turned LOW"
    assert z8.mode == "AUTO"
    print("  -> Step 5C Passed: GPIO 23 LOW -> Real Relay 2 / Light 2 OFF after 10s!")

    # Step 5D: Re-enter Z8 within 10s cancels timer
    now = time.time()
    z8.update([p2], current_time=now)
    bridge.sync_zone_states({"Z2": {"light_bool": False}, "Z8": z8.to_dict()})
    assert bridge.relay_states["2"] is True
    time.sleep(1.0)
    # Leaves
    z8.update([], current_time=time.time())
    bridge.sync_zone_states({"Z2": {"light_bool": False}, "Z8": z8.to_dict()})
    time.sleep(3.0)
    # Re-enters
    z8.update([p2], current_time=time.time())
    bridge.sync_zone_states({"Z2": {"light_bool": False}, "Z8": z8.to_dict()})
    assert z8.vacancy_timer_active is False
    assert bridge.relay_states["2"] is True
    print("  -> Step 5D Passed: Re-entry to Z8 cancels timer and keeps Relay 2 ON!")

    # Clean up both relays
    bridge.send_relay_command("1", False)
    bridge.send_relay_command("2", False)
    bridge.close()

    print("\n=================================================================")
    print("ALL 5 PHYSICAL HARDWARE TESTS COMPLETED AND VERIFIED ON ESP32!")
    print("=================================================================")


if __name__ == "__main__":
    run_hardware_tests()
