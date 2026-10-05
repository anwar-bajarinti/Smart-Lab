/*
 ==============================================================================
 SMART LAB AUTOMATION - CORE ESP32 DUAL RELAY CONTROLLER
 ==============================================================================
 Target Hardware : ESP32 DevKit V1 (ESP-WROOM-32)
 Purpose         : Direct real-time physical control of REAL AC Light 1 and Light 2
                   through isolated relay modules.
 
 CRITICAL HARDWARE PIN DEFINITIONS:
 ------------------------------------------------------------------------------
  Relay 1 (REAL LIGHT 1 / Zone Z2) : GPIO 22 (Active HIGH: HIGH = ON, LOW = OFF)
  Relay 2 (REAL LIGHT 2 / Zone Z8) : GPIO 23 (Active HIGH: HIGH = ON, LOW = OFF)
  Status LED                       : GPIO 2  (OPTIONAL Onboard LED only;
                                              NOT an appliance/light! Never use
                                              as a substitute for lights)
 ------------------------------------------------------------------------------
 SERIAL PROTOCOL (115200 Baud):
  Commands:
    "R1 ON"  or "RELAY 1 ON"   --> Turns Relay 1 ON  (GPIO 22 = HIGH -> Real Light 1 ON)
    "R1 OFF" or "RELAY 1 OFF"  --> Turns Relay 1 OFF (GPIO 22 = LOW  -> Real Light 1 OFF)
    "R2 ON"  or "RELAY 2 ON"   --> Turns Relay 2 ON  (GPIO 23 = HIGH -> Real Light 2 ON)
    "R2 OFF" or "RELAY 2 OFF"  --> Turns Relay 2 OFF (GPIO 23 = LOW  -> Real Light 2 OFF)
    "STATUS"                   --> Returns current state of GPIO 22 & GPIO 23
 
 OPTIONAL WIFI HTTP:
  If WiFi credentials are provided, also listens on Port 80 for HTTP GET/POST:
    GET /r1/on  | GET /r1/off
    GET /r2/on  | GET /r2/off
    GET /status
 ==============================================================================
*/

#include <WiFi.h>
#include <WebServer.h>

// Hardware Pin Definitions
#define RELAY_1_PIN      22  // Controls REAL LIGHT 1 through Relay 1
#define RELAY_2_PIN      23  // Controls REAL LIGHT 2 through Relay 2
#define STATUS_LED_PIN    2  // Optional ESP32 onboard status LED (NOT an appliance)

// Relay Active HIGH logic
#define RELAY_ON_LEVEL   HIGH
#define RELAY_OFF_LEVEL  LOW

// Optional WiFi Configuration (Leave empty if using USB Serial only)
const char* WIFI_SSID     = "Anwar";
const char* WIFI_PASSWORD = "00000000";

WebServer server(80);
bool relay1State = false;
bool relay2State = false;

// Blink status LED briefly (15ms) on command RX (does NOT stay on with lights)
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

void printStatus() {
  Serial.printf("[STATUS] Relay1(GPIO22):%s | Relay2(GPIO23):%s\n", relay1State ? "ON" : "OFF", relay2State ? "ON" : "OFF");
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
  } else {
    Serial.printf("[ERROR] Unknown command: '%s'\n", cmd.c_str());
    Serial.println("[HELP] Valid commands: R1 ON, R1 OFF, R2 ON, R2 OFF, STATUS");
  }
}

// HTTP Handlers
void handleHttpR1On()  { pulseStatusLed(); setRelay1(true);  server.send(200, "text/plain", "OK: R1 ON (GPIO 22)"); }
void handleHttpR1Off() { pulseStatusLed(); setRelay1(false); server.send(200, "text/plain", "OK: R1 OFF (GPIO 22)"); }
void handleHttpR2On()  { pulseStatusLed(); setRelay2(true);  server.send(200, "text/plain", "OK: R2 ON (GPIO 23)"); }
void handleHttpR2Off() { pulseStatusLed(); setRelay2(false); server.send(200, "text/plain", "OK: R2 OFF (GPIO 23)"); }
void handleHttpStatus() {
  char buf[96];
  snprintf(buf, sizeof(buf), "{\"relay1_gpio22\":\"%s\",\"relay2_gpio23\":\"%s\"}", relay1State ? "ON" : "OFF", relay2State ? "ON" : "OFF");
  server.send(200, "application/json", buf);
}

void setup() {
  Serial.begin(115200);
  delay(200);

  Serial.println("\n==================================================");
  Serial.println(" SMART LAB - ESP32 DUAL RELAY CONTROLLER READY");
  Serial.println(" Relay 1 (REAL LIGHT 1): GPIO 22 (Active HIGH)");
  Serial.println(" Relay 2 (REAL LIGHT 2): GPIO 23 (Active HIGH)");
  Serial.println(" Status LED            : GPIO 2  (Status only - NOT a light)");
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

  // Optional WiFi setup
  if (strlen(WIFI_SSID) > 0) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 10) {
      delay(500);
      Serial.print(".");
      attempts++;
    }
    Serial.println();
    if (WiFi.status() == WL_CONNECTED) {
      Serial.print("[WiFi] Connected! IP: ");
      Serial.println(WiFi.localIP());

      server.on("/r1/on", handleHttpR1On);
      server.on("/r1/off", handleHttpR1Off);
      server.on("/r2/on", handleHttpR2On);
      server.on("/r2/off", handleHttpR2Off);
      server.on("/status", handleHttpStatus);
      server.begin();
      Serial.println("[HTTP] Server listening on port 80");
    }
  }

  printStatus();
}

void loop() {
  // Check USB Serial input
  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    handleSerialCommand(input);
  }

  // Handle WiFi HTTP clients if connected
  if (WiFi.status() == WL_CONNECTED) {
    server.handleClient();
  }
}
