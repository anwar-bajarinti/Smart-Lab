/*
 ==============================================================================
 SMART LAB AUTOMATION - ESP32 DUAL RELAY & PZEM-004T CONTROLLER
 ==============================================================================
 Target Hardware  : ESP32 DevKit V1 (ESP-WROOM-32)
 Function         : High-reliability appliance switching (Active HIGH Relays)
                    and non-blocking AC energy monitoring via PZEM-004T.
 Communication    : USB Hardware Serial (115200 Baud).
 
 PHYSICAL HARDWARE PIN DEFINITIONS:
 ------------------------------------------------------------------------------
  Relay 1 (REAL LIGHT 1 / Zone Z2) : GPIO 22 (Active HIGH: HIGH = ON, LOW = OFF)
  Relay 2 (REAL LIGHT 2 / Zone Z8) : GPIO 23 (Active HIGH: HIGH = ON, LOW = OFF)
  Status LED                       : GPIO 2  (Diagnostic pulse only; NOT an appliance)
  PZEM-004T TX -> ESP32 RX         : GPIO 25 (HardwareSerial 1 RX)
  PZEM-004T RX <- ESP32 TX         : GPIO 33 (HardwareSerial 1 TX)
  PZEM-004T VCC                    : 5V (VIN)
  PZEM-004T GND                    : GND
 ------------------------------------------------------------------------------
 SERIAL PROTOCOL (115200 Baud):
  Commands:
    "R1 ON"  or "RELAY 1 ON"   --> Turns Relay 1 ON  (GPIO 22 = HIGH -> Real Light 1 ON)
    "R1 OFF" or "RELAY 1 OFF"  --> Turns Relay 1 OFF (GPIO 22 = LOW  -> Real Light 1 OFF)
    "R2 ON"  or "RELAY 2 ON"   --> Turns Relay 2 ON  (GPIO 23 = HIGH -> Real Light 2 ON)
    "R2 OFF" or "RELAY 2 OFF"  --> Turns Relay 2 OFF (GPIO 23 = LOW  -> Real Light 2 OFF)
    "STATUS"                   --> Returns current state of Relays and PZEM
    "PZEM"   or "ENERGY"       --> Returns JSON formatted PZEM telemetry
 ==============================================================================
*/

#include <Arduino.h>
#include <PZEM004Tv30.h>

// Hardware Pin Definitions
#define RELAY_1_PIN      22  // Controls REAL LIGHT 1 through Relay 1
#define RELAY_2_PIN      23  // Controls REAL LIGHT 2 through Relay 2
#define STATUS_LED_PIN    2  // Diagnostic LED (NOT an appliance)

#define PZEM_RX_PIN      25  // ESP32 receives from PZEM TX
#define PZEM_TX_PIN      33  // ESP32 transmits to PZEM RX

// Relay Active HIGH logic
#define RELAY_ON_LEVEL   HIGH
#define RELAY_OFF_LEVEL  LOW

// Hardware Serial 1 for PZEM-004T
HardwareSerial PZEMSerial(1);
PZEM004Tv30 pzem(PZEMSerial, PZEM_RX_PIN, PZEM_TX_PIN);

// Relay States
bool relay1State = false;
bool relay2State = false;

// Cached PZEM Telemetry
float pzemVoltage   = 0.0f;
float pzemCurrent   = 0.0f;
float pzemPower     = 0.0f;
float pzemEnergy    = 0.0f;
float pzemFrequency = 0.0f;
float pzemPF        = 0.0f;
bool  pzemValid     = false;

// Non-blocking timer for PZEM reading (reads every 1.5 seconds)
unsigned long lastPzemRead = 0;
const unsigned long PZEM_READ_INTERVAL_MS = 1500;

// Blink status LED briefly (15ms) on command RX
void pulseStatusLed() {
  digitalWrite(STATUS_LED_PIN, HIGH);
  delay(15);
  digitalWrite(STATUS_LED_PIN, LOW);
}

void setRelay1(bool state) {
  relay1State = state;
  digitalWrite(RELAY_1_PIN, state ? RELAY_ON_LEVEL : RELAY_OFF_LEVEL);
  Serial.printf("[ESP32] Relay 1 (GPIO %d) -> %s [REAL LIGHT 1]\n", RELAY_1_PIN, state ? "ON" : "OFF");
}

void setRelay2(bool state) {
  relay2State = state;
  digitalWrite(RELAY_2_PIN, state ? RELAY_ON_LEVEL : RELAY_OFF_LEVEL);
  Serial.printf("[ESP32] Relay 2 (GPIO %d) -> %s [REAL LIGHT 2]\n", RELAY_2_PIN, state ? "ON" : "OFF");
}

// Non-blocking periodic reading from PZEM-004T
void updatePzemReadings() {
  unsigned long now = millis();
  if (now - lastPzemRead >= PZEM_READ_INTERVAL_MS) {
    lastPzemRead = now;

    float v = pzem.voltage();
    if (!isnan(v) && v > 0.0f) {
      pzemVoltage   = v;
      pzemCurrent   = pzem.current();
      pzemPower     = pzem.power();
      pzemEnergy    = pzem.energy();
      pzemFrequency = pzem.frequency();
      pzemPF        = pzem.pf();

      // Validate other metrics against NaN
      if (isnan(pzemCurrent))   pzemCurrent   = 0.0f;
      if (isnan(pzemPower))     pzemPower     = 0.0f;
      if (isnan(pzemEnergy))    pzemEnergy    = 0.0f;
      if (isnan(pzemFrequency)) pzemFrequency = 50.0f;
      if (isnan(pzemPF))        pzemPF        = 1.0f;

      pzemValid = true;
    } else {
      pzemValid = false;
    }
  }
}

void printStatus() {
  Serial.printf("[STATUS] Relay1(GPIO22):%s | Relay2(GPIO23):%s | PZEM:%s\n",
                relay1State ? "ON" : "OFF",
                relay2State ? "ON" : "OFF",
                pzemValid ? "ONLINE" : "NO_DATA");
}

void printPzemJson() {
  if (pzemValid) {
    Serial.printf("PZEM:{\"voltage\":%.1f,\"current\":%.2f,\"power\":%.1f,\"energy\":%.2f,\"frequency\":%.1f,\"pf\":%.2f,\"valid\":true}\n",
                  pzemVoltage, pzemCurrent, pzemPower, pzemEnergy, pzemFrequency, pzemPF);
  } else {
    Serial.println("PZEM:{\"voltage\":null,\"current\":null,\"power\":null,\"energy\":null,\"frequency\":null,\"pf\":null,\"valid\":false}");
  }
}

// Serial command parser
void handleSerialCommand(String cmd) {
  cmd.trim();
  cmd.toUpperCase();
  if (cmd.length() == 0) return;

  pulseStatusLed();

  if (cmd == "R1 ON" || cmd == "RELAY 1 ON") {
    setRelay1(true);
  } else if (cmd == "R1 OFF" || cmd == "RELAY 1 OFF") {
    setRelay1(false);
  } else if (cmd == "R2 ON" || cmd == "RELAY 2 ON") {
    setRelay2(true);
  } else if (cmd == "R2 OFF" || cmd == "RELAY 2 OFF") {
    setRelay2(false);
  } else if (cmd == "STATUS") {
    printStatus();
  } else if (cmd == "PZEM" || cmd == "ENERGY") {
    printPzemJson();
  } else {
    Serial.printf("[ERROR] Unknown command: '%s'\n", cmd.c_str());
    Serial.println("[HELP] Valid commands: R1 ON, R1 OFF, R2 ON, R2 OFF, STATUS, PZEM");
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);

  Serial.println("\n==================================================");
  Serial.println(" SMART LAB - ESP32 DUAL RELAY & PZEM CONTROLLER READY");
  Serial.println(" Relay 1 (REAL LIGHT 1): GPIO 22 (Active HIGH)");
  Serial.println(" Relay 2 (REAL LIGHT 2): GPIO 23 (Active HIGH)");
  Serial.println(" Status LED            : GPIO 2  (Status only - NOT a light)");
  Serial.println(" PZEM UART             : TX->GPIO25, RX->GPIO33");
  Serial.println(" Default State         : BOTH RELAYS OFF");
  Serial.println("==================================================");

  // Initialize GPIOs
  pinMode(RELAY_1_PIN, OUTPUT);
  pinMode(RELAY_2_PIN, OUTPUT);
  pinMode(STATUS_LED_PIN, OUTPUT);

  // Set default state to OFF
  digitalWrite(RELAY_1_PIN, RELAY_OFF_LEVEL);
  digitalWrite(RELAY_2_PIN, RELAY_OFF_LEVEL);
  digitalWrite(STATUS_LED_PIN, LOW);

  printStatus();
}

void loop() {
  // Non-blocking periodic reading of PZEM sensor
  updatePzemReadings();

  // Check USB Serial input
  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    handleSerialCommand(input);
  }
}