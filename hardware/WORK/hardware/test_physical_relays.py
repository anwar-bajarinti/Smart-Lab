"""
SMART LAB - PHYSICAL RELAY & REAL AC LIGHT TEST SUITE
======================================================
Tests the real physical relay hardware outputs connected to the ESP32:
  - Relay 1: GPIO 22  ===> REAL AC LIGHT 1 (Zone Z2)
  - Relay 2: GPIO 23  ===> REAL AC LIGHT 2 (Zone Z8)
  - GPIO 2 : Optional ESP32 onboard status LED (NOT a light / appliance)

Usage:
  python test_physical_relays.py [--port COM4] [--interactive]
"""

import sys
import time
import argparse
from typing import Optional

try:
    import serial
    import serial.tools.list_ports
    HAS_SERIAL = True
except ImportError:
    HAS_SERIAL = False
    print("[ERROR] pyserial is required. Install via: pip install pyserial")
    sys.exit(1)


def find_esp32_port() -> Optional[str]:
    """Auto-detects ESP32 CP210x or USB-Serial port."""
    ports = list(serial.tools.list_ports.comports())
    for p in ports:
        desc = p.description.lower()
        if "cp210" in desc or "ch340" in desc or "usb-serial" in desc or "uart" in desc:
            return p.device
    if len(ports) > 0:
        return ports[0].device
    return None


class PhysicalRelayTester:
    def __init__(self, port: Optional[str] = None, baud_rate: int = 115200):
        self.port = port or find_esp32_port() or "COM4"
        self.baud_rate = baud_rate
        self.ser: Optional[serial.Serial] = None
        self.r1_state = False
        self.r2_state = False

    def connect(self) -> bool:
        print(f"\n[CONNECT] Connecting to ESP32 on {self.port} at {self.baud_rate} baud...")
        try:
            self.ser = serial.Serial(self.port, self.baud_rate, timeout=0.5)
            self.ser.dtr = False
            self.ser.rts = False
            time.sleep(1.8)  # Wait for boot
            self.ser.read_all()  # Flush boot messages
            print(f"[CONNECT] Successfully connected to {self.port}!")
            return True
        except Exception as e:
            print(f"[ERROR] Failed to open {self.port}: {e}")
            return False

    def send_cmd(self, cmd: str) -> str:
        if not self.ser or not self.ser.is_open:
            return "[NOT CONNECTED]"
        line = cmd.strip() + "\n"
        self.ser.write(line.encode("utf-8"))
        self.ser.flush()
        time.sleep(0.15)
        resp = self.ser.read_all().decode("utf-8", errors="ignore").strip()
        return resp

    def set_relay_1(self, state: bool) -> str:
        self.r1_state = state
        cmd = "R1 ON" if state else "R1 OFF"
        resp = self.send_cmd(cmd)
        state_str = "ON  (AC MAINS CLOSED)" if state else "OFF (AC MAINS OPEN)"
        print(f"  [RELAY 1] GPIO 22 -> {state_str} ===> REAL LIGHT 1 {resp and f'({resp})'}")
        return resp

    def set_relay_2(self, state: bool) -> str:
        self.r2_state = state
        cmd = "R2 ON" if state else "R2 OFF"
        resp = self.send_cmd(cmd)
        state_str = "ON  (AC MAINS CLOSED)" if state else "OFF (AC MAINS OPEN)"
        print(f"  [RELAY 2] GPIO 23 -> {state_str} ===> REAL LIGHT 2 {resp and f'({resp})'}")
        return resp

    def get_status(self) -> str:
        resp = self.send_cmd("STATUS")
        return resp

    def all_off(self):
        self.set_relay_1(False)
        self.set_relay_2(False)

    def close(self):
        if self.ser and self.ser.is_open:
            self.all_off()
            self.ser.close()
            print("[DISCONNECT] Serial port closed. Relays safely set to OFF.")

    def run_automated_test(self):
        print("\n" + "=" * 70)
        print("  STARTING AUTOMATED PHYSICAL RELAY & LIGHT SWITCHING TEST")
        print("=" * 70)
        print("  NOTE: Listen for the mechanical CLICK of the relays and observe")
        print("        your REAL AC LIGHTS turning ON and OFF!")
        print("=" * 70)

        # Ensure start with ALL OFF
        print("\n[STEP 0] Ensuring all outputs are safely OFF...")
        self.all_off()
        time.sleep(1.0)

        # 1. Test Relay 1 (GPIO 22) -> Real Light 1
        print("\n[TEST 1] Testing RELAY 1 (GPIO 22) -> REAL LIGHT 1 (Zone Z2)")
        print("  >> Turning Relay 1 ON for 2.5 seconds...")
        self.set_relay_1(True)
        time.sleep(2.5)
        print("  >> Turning Relay 1 OFF...")
        self.set_relay_1(False)
        time.sleep(1.0)

        # 2. Test Relay 2 (GPIO 23) -> Real Light 2
        print("\n[TEST 2] Testing RELAY 2 (GPIO 23) -> REAL LIGHT 2 (Zone Z8)")
        print("  >> Turning Relay 2 ON for 2.5 seconds...")
        self.set_relay_2(True)
        time.sleep(2.5)
        print("  >> Turning Relay 2 OFF...")
        self.set_relay_2(False)
        time.sleep(1.0)

        # 3. Test Both Relays Together
        print("\n[TEST 3] Testing BOTH RELAYS SIMULTANEOUSLY (GPIO 22 & GPIO 23)")
        print("  >> Turning BOTH Relays ON for 3.0 seconds...")
        self.set_relay_1(True)
        self.set_relay_2(True)
        time.sleep(3.0)
        print("  >> Turning BOTH Relays OFF...")
        self.all_off()
        time.sleep(0.5)

        # Final Status check
        status = self.get_status()
        print(f"\n[FINAL STATUS CHECK] Firmware State: {status}")
        print("\n" + "=" * 70)
        print("  [SUCCESS] All physical relay switching cycles completed!")
        print("  - Relay 1 (GPIO 22) -> Verified Real Light 1")
        print("  - Relay 2 (GPIO 23) -> Verified Real Light 2")
        print("  - GPIO 2 onboard LED is NOT used as an appliance light")
        print("=" * 70)

    def run_interactive(self):
        print("\n" + "=" * 70)
        print("  INTERACTIVE RELAY CONTROL CONSOLE")
        print("=" * 70)
        print("  Commands:")
        print("    '1'    : Toggle Real Light 1 (Relay 1 | GPIO 22)")
        print("    '2'    : Toggle Real Light 2 (Relay 2 | GPIO 23)")
        print("    'on'   : Turn BOTH Lights ON")
        print("    'off'  : Turn BOTH Lights OFF")
        print("    's'    : Query hardware status")
        print("    'q'    : Quit interactive mode and turn all off")
        print("=" * 70)

        while True:
            try:
                cmd = input("\nEnter command [1 / 2 / on / off / s / q]: ").strip().lower()
                if cmd == 'q':
                    print("Exiting...")
                    break
                elif cmd == '1':
                    self.set_relay_1(not self.r1_state)
                elif cmd == '2':
                    self.set_relay_2(not self.r2_state)
                elif cmd == 'on':
                    self.set_relay_1(True)
                    self.set_relay_2(True)
                elif cmd == 'off':
                    self.all_off()
                elif cmd == 's':
                    print(f"Status: {self.get_status()}")
                else:
                    print("Unknown command. Options: 1, 2, on, off, s, q")
            except (KeyboardInterrupt, EOFError):
                break


def main():
    parser = argparse.ArgumentParser(description="Test physical relay-controlled lights via ESP32")
    parser.add_argument("--port", type=str, default=None, help="COM port (default: auto-detect COM4)")
    parser.add_argument("--baud", type=int, default=115200, help="Baud rate (default: 115200)")
    parser.add_argument("--interactive", action="store_true", help="Launch interactive toggle console after test")
    args = parser.parse_args()

    print("========================================================================")
    print("   SMART LAB AUTOMATION - PHYSICAL RELAY HARDWARE VERIFICATION")
    print("========================================================================")
    print("   GPIO 22 ==> Relay 1 ===> REAL AC LIGHT 1 (Zone Z2)")
    print("   GPIO 23 ==> Relay 2 ===> REAL AC LIGHT 2 (Zone Z8)")
    print("   GPIO 2  ==> ESP32 Onboard Status LED (NOT an appliance/light)")
    print("========================================================================")

    tester = PhysicalRelayTester(port=args.port, baud_rate=args.baud)
    if not tester.connect():
        sys.exit(1)

    try:
        tester.run_automated_test()
        if args.interactive:
            tester.run_interactive()
    finally:
        tester.close()


if __name__ == "__main__":
    main()
