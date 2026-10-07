/*
 ==============================================================================
 SMART LAB AUTOMATION — ESP32 DUAL RELAY & PZEM-004T CONTROLLER FIRMWARE
 ==============================================================================
 Target Hardware  : ESP32 DevKit V1 (ESP-WROOM-32)
 Architecture     : Active HIGH Relay Switching + Non-blocking PZEM-004T + 
                    USB Serial (COM4) + Embedded HTTP REST Server
 
 PIN CONFIGURATION:
 ------------------------------------------------------------------------------
  Relay 1 (Light 1 / Zone Z2)   : GPIO 22 (Active HIGH: HIGH = ON, LOW = OFF)
  Relay 2 (Light 2 / Zone Z8)   : GPIO 23 (Active HIGH: HIGH = ON, LOW = OFF)
  Status LED (Diagnostic Pulse) : GPIO 2  (Onboard LED; NOT an appliance)
  PZEM-004T RX (ESP32 RX)       : GPIO 25 (HardwareSerial 1 RX <- PZEM TX)
  PZEM-004T TX (ESP32 TX)       : GPIO 33 (HardwareSerial 1 TX -> PZEM RX)
 ------------------------------------------------------------------------------
 SERIAL PROTOCOL (115200 Baud):
  Commands:
    "R1 ON"   / "RELAY 1 ON"  --> Turns Relay 1 ON  (GPIO 22 HIGH)
    "R1 OFF"  / "RELAY 1 OFF" --> Turns Relay 1 OFF (GPIO 22 LOW)
    "R2 ON"   / "RELAY 2 ON"  --> Turns Relay 2 ON  (GPIO 23 HIGH)
    "R2 OFF"  / "RELAY 2 OFF" --> Turns Relay 2 OFF (GPIO 23 LOW)
    "STATUS"                  --> Returns current Relay and PZEM states
    "PZEM"    / "ENERGY"      --> Returns JSON & text PZEM telemetry
    "PING"                    --> Returns PONG
 ------------------------------------------------------------------------------
 HTTP REST API (Port 80 via SoftAP "SmartLab-ESP32"):
    GET /                     --> System Status JSON
    GET /status               --> System Status JSON
    GET /relay/1/on           --> Turn Relay 1 ON
    GET /relay/1/off          --> Turn Relay 1 OFF
    GET /relay/2/on           --> Turn Relay 2 ON
    GET /relay/2/off          --> Turn Relay 2 OFF
    GET /pzem                 --> PZEM Telemetry JSON
 ==============================================================================
*/

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <PZEM004Tv30.h>

// ============================================================================
// HARDWARE PIN DEFINITIONS
// ============================================================================
#define RELAY_1_PIN       22  // Controls REAL LIGHT 1 through Relay 1 (Zone Z2)
#define RELAY_2_PIN       23  // Controls REAL LIGHT 2 through Relay 2 (Zone Z8)
#define STATUS_LED_PIN     2  // Onboard Diagnostic LED (NOT an appliance)

#define PZEM_RX_PIN       25  // ESP32 RX <- PZEM TX
#define PZEM_TX_PIN       33  // ESP32 TX -> PZEM RX

// Active HIGH relay logic
#define RELAY_ON_LEVEL    HIGH
#define RELAY_OFF_LEVEL   LOW

// ============================================================================
// PERIPHERALS & STATE
// ============================================================================
HardwareSerial PZEMSerial(1);
PZEM004Tv30 pzem(PZEMSerial, PZEM_RX_PIN, PZEM_TX_PIN);

// Relay States
bool relay1State = false;
bool relay2State = false;

// PZEM-004T Telemetry Cache
float pzemVoltage   = 0.0f;
float pzemCurrent   = 0.0f;
float pzemPower     = 0.0f;
float pzemEnergy    = 0.0f;
float pzemFrequency = 0.0f;
float pzemPF        = 0.0f;
bool  pzemValid     = false;

unsigned long lastPzemPoll = 0;
const unsigned long PZEM_POLL_INTERVAL_MS = 1500;

// Embedded HTTP Server
WebServer httpServer(80);
const char* AP_SSID = "SmartLab-ESP32";
const char* AP_PASS = "smartlab123";

// Serial input buffer
String serialBuffer = "";

// ============================================================================
// DIAGNOSTIC LED
// ============================================================================
void pulseStatusLed() {
  digitalWrite(STATUS_LED_PIN, HIGH);
  delay(12);
  digitalWrite(STATUS_LED_PIN, LOW);
}

// ============================================================================
// RELAY CONTROL FUNCTIONS (ACTIVE HIGH)
// ============================================================================
void setRelay1(bool state) {
  relay1State = state;
  digitalWrite(RELAY_1_PIN, state ? RELAY_ON_LEVEL : RELAY_OFF_LEVEL);
  Serial.printf("[ACK] Relay 1 (GPIO %d) -> %s [Z2 / Light 1]\n", RELAY_1_PIN, state ? "ON" : "OFF");
}

void setRelay2(bool state) {
  relay2State = state;
  digitalWrite(RELAY_2_PIN, state ? RELAY_ON_LEVEL : RELAY_OFF_LEVEL);
  Serial.printf("[ACK] Relay 2 (GPIO %d) -> %s [Z8 / Light 2]\n", RELAY_2_PIN, state ? "ON" : "OFF");
}

// ============================================================================
// PZEM-004T SENSOR POLLING (NON-BLOCKING)
// ============================================================================
void updatePzemReadings() {
  unsigned long now = millis();
  if (now - lastPzemPoll >= PZEM_POLL_INTERVAL_MS) {
    lastPzemPoll = now;

    float v = pzem.voltage();
    if (!isnan(v) && v > 0.0f) {
      pzemVoltage   = v;
      pzemCurrent   = pzem.current();
      pzemPower     = pzem.power();
      pzemEnergy    = pzem.energy();
      pzemFrequency = pzem.frequency();
      pzemPF        = pzem.pf();

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

// ============================================================================
// TELEMETRY & STATUS OUTPUTS
// ============================================================================
void printStatus() {
  Serial.printf("[STATUS] Relay1(GPIO22):%s | Relay2(GPIO23):%s | PZEM:%s\n",
                relay1State ? "ON" : "OFF",
                relay2State ? "ON" : "OFF",
                pzemValid ? "ONLINE" : "NO_DATA");
}

void printPzem() {
  if (pzemValid) {
    // 1. JSON output for Python esp32_relay_bridge
    Serial.printf("PZEM:{\"voltage\":%.1f,\"current\":%.2f,\"power\":%.1f,\"energy\":%.2f,\"frequency\":%.1f,\"pf\":%.2f,\"valid\":true}\n",
                  pzemVoltage, pzemCurrent, pzemPower, pzemEnergy, pzemFrequency, pzemPF);
    // 2. Formatted text for diagnostic scripts
    Serial.printf("[PZEM] Voltage: %.1fV | Current: %.2fA | Power: %.1fW | Energy: %.2fkWh | Freq: %.1fHz | PF: %.2f\n",
                  pzemVoltage, pzemCurrent, pzemPower, pzemEnergy, pzemFrequency, pzemPF);
  } else {
    Serial.println("PZEM:{\"voltage\":null,\"current\":null,\"power\":null,\"energy\":null,\"frequency\":null,\"pf\":null,\"valid\":false}");
    Serial.println("[PZEM] Voltage: None | Current: None | Power: None | Status: Idle/Offline");
  }
}

// ============================================================================
// SERIAL COMMAND PARSER
// ============================================================================
void handleSerialCommand(String cmd) {
  cmd.trim();
  if (cmd.length() == 0) return;

  pulseStatusLed();
  String upper = cmd;
  upper.toUpperCase();

  if (upper == "R1 ON" || upper == "RELAY 1 ON" || upper == "R1 1") {
    setRelay1(true);
  } else if (upper == "R1 OFF" || upper == "RELAY 1 OFF" || upper == "R1 0") {
    setRelay1(false);
  } else if (upper == "R2 ON" || upper == "RELAY 2 ON" || upper == "R2 1") {
    setRelay2(true);
  } else if (upper == "R2 OFF" || upper == "RELAY 2 OFF" || upper == "R2 0") {
    setRelay2(false);
  } else if (upper == "STATUS") {
    printStatus();
  } else if (upper == "PZEM" || upper == "ENERGY") {
    printPzem();
  } else if (upper == "PING") {
    Serial.println("[ACK] PONG");
  } else {
    Serial.printf("[ERROR] Unknown command: '%s'\n", cmd.c_str());
    Serial.println("[HELP] Valid commands: R1 ON, R1 OFF, R2 ON, R2 OFF, STATUS, PZEM, PING");
  }
}

// ============================================================================
// HTTP REST HANDLERS
// ============================================================================
void handleHttpRoot() {
  String json = "{";
  json += "\"device\":\"ESP32-SmartLab\",";
  json += "\"relay1\":" + String(relay1State ? "true" : "false") + ",";
  json += "\"relay2\":" + String(relay2State ? "true" : "false") + ",";
  json += "\"pzem_valid\":" + String(pzemValid ? "true" : "false") + ",";
  json += "\"voltage\":" + String(pzemVoltage, 1) + ",";
  json += "\"power\":" + String(pzemPower, 1);
  json += "}";
  httpServer.send(200, "application/json", json);
}

void setupHttpEndpoints() {
  httpServer.on("/", HTTP_GET, handleHttpRoot);
  httpServer.on("/status", HTTP_GET, handleHttpRoot);
  
  httpServer.on("/relay/1/on", HTTP_GET, []() {
    setRelay1(true);
    httpServer.send(200, "application/json", "{\"relay1\":true,\"gpio\":22,\"status\":\"ON\"}");
  });
  httpServer.on("/relay/1/off", HTTP_GET, []() {
    setRelay1(false);
    httpServer.send(200, "application/json", "{\"relay1\":false,\"gpio\":22,\"status\":\"OFF\"}");
  });
  httpServer.on("/relay/2/on", HTTP_GET, []() {
    setRelay2(true);
    httpServer.send(200, "application/json", "{\"relay2\":true,\"gpio\":23,\"status\":\"ON\"}");
  });
  httpServer.on("/relay/2/off", HTTP_GET, []() {
    setRelay2(false);
    httpServer.send(200, "application/json", "{\"relay2\":false,\"gpio\":23,\"status\":\"OFF\"}");
  });
  httpServer.on("/pzem", HTTP_GET, []() {
    String json = "{\"valid\":" + String(pzemValid ? "true" : "false");
    if (pzemValid) {
      json += ",\"voltage\":" + String(pzemVoltage, 1);
      json += ",\"current\":" + String(pzemCurrent, 2);
      json += ",\"power\":" + String(pzemPower, 1);
      json += ",\"energy\":" + String(pzemEnergy, 2);
      json += ",\"frequency\":" + String(pzemFrequency, 1);
      json += ",\"pf\":" + String(pzemPF, 2);
    }
    json += "}";
    httpServer.send(200, "application/json", json);
  });
}

// ============================================================================
// ARDUINO SETUP & LOOP
// ============================================================================
void setup() {
  // 1. Initialize Hardware Pins
  pinMode(RELAY_1_PIN, OUTPUT);
  pinMode(RELAY_2_PIN, OUTPUT);
  pinMode(STATUS_LED_PIN, OUTPUT);

  // 2. Hardware Safety Reset: Default BOTH Relays to OFF (Active HIGH -> LOW)
  digitalWrite(RELAY_1_PIN, RELAY_OFF_LEVEL);
  digitalWrite(RELAY_2_PIN, RELAY_OFF_LEVEL);
  digitalWrite(STATUS_LED_PIN, LOW);

  // 3. Initialize USB Serial
  Serial.begin(115200);
  delay(200);

  Serial.println("\n==================================================");
  Serial.println(" SMART LAB - ESP32 DUAL RELAY & PZEM CONTROLLER");
  Serial.println("==================================================");
  Serial.println(" Relay 1 (Light 1 / Z2) : GPIO 22 (Active HIGH)");
  Serial.println(" Relay 2 (Light 2 / Z8) : GPIO 23 (Active HIGH)");
  Serial.println(" Status LED             : GPIO 2  (Diagnostic Pulse)");
  Serial.println(" PZEM UART              : RX=GPIO25, TX=GPIO33");
  Serial.println(" Initial Relay State    : BOTH RELAYS OFF (SAFE)");
  Serial.println("==================================================");

  // 4. Initialize Non-blocking SoftAP & WebServer
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASS);
  setupHttpEndpoints();
  httpServer.begin();
  Serial.printf("[WiFi] SoftAP Started: SSID '%s' | IP: %s\n", AP_SSID, WiFi.softAPIP().toString().c_str());

  printStatus();
}

void loop() {
  // 1. Poll PZEM Sensor (Non-blocking timer)
  updatePzemReadings();

  // 2. Handle HTTP Client Requests (Non-blocking)
  httpServer.handleClient();

  // 3. Handle USB Serial Commands
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (serialBuffer.length() > 0) {
        handleSerialCommand(serialBuffer);
        serialBuffer = "";
      }
    } else {
      if (serialBuffer.length() < 128) {
        serialBuffer += c;
      }
    }
  }
}