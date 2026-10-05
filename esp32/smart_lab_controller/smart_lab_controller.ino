/*
 ==============================================================================
 SMART LAB AUTOMATION SYSTEM - ESP32 FIRMWARE CONTROLLER
 ==============================================================================
 Target Hardware  : ESP32 DevKit V1 (ESP-WROOM-32)
 Function         : Controls physical relays, Xenbrix AC phase-cut dimmers, 
                    and polls PZEM-004T AC Energy Monitor.
 Communication    : WiFi HTTP REST API & Hardware Serial Command Processor.
 
 PROTOTYPE HARDWARE MAPPING:
 ------------------------------------------------------------------------------
  Relay 1 (Light 1)    : GPIO 22  (Active HIGH: HIGH = ON, LOW = OFF)
  Relay 2 (Light 2)    : GPIO 23  (Active HIGH: HIGH = ON, LOW = OFF)
  Xenbrix Dimmer ZVC   : GPIO 27  (Zero-Cross Detection Interrupt)
  Xenbrix Dimmer DAT   : GPIO 26  (Triac Gate Pulse Output)
  PZEM-004T UART RX    : GPIO 25  (ESP32 RX2 <- PZEM-004T TX)
  PZEM-004T UART TX    : GPIO 33  (ESP32 TX2 -> PZEM-004T RX)
 ------------------------------------------------------------------------------
 SAFETY NOTICE:
 This system interacts with 110V/230V AC Mains. Do NOT expose live mains wires.
 Always utilize properly rated PCB relays, optocouplers, safety fuses, and 
 an electrically isolated enclosure. Do NOT use breadboards for mains connections.
 ==============================================================================
*/

#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>

// ==============================================================================
// 1. PIN CONFIGURATION & CONSTANTS
// ==============================================================================
#define RELAY_1_PIN         22
#define RELAY_2_PIN         23

#define DIMMER_ZVC_PIN      27
#define DIMMER_DAT_PIN      26

#define PZEM_RX_PIN         25
#define PZEM_TX_PIN         33

// Active HIGH relay logic
#define RELAY_STATE_ON      HIGH
#define RELAY_STATE_OFF     LOW

// Network Configuration (Change to your Lab Wi-Fi credentials)
const char* WIFI_SSID     = "SmartLab_WiFi";
const char* WIFI_PASSWORD = "SmartLabSecurePassword";
const int   HTTP_PORT     = 80;

// ==============================================================================
// 2. STATE STORAGE & DATA STRUCTURES
// ==============================================================================
struct RelayOutput {
  uint8_t pin;
  bool state;
  const char* label;
};

// Expandable Relay table (can be expanded to 9+ outputs via I2C PCF8574 / MCP23017)
RelayOutput relays[] = {
  { RELAY_1_PIN, false, "Light 1 / Zone 1" },
  { RELAY_2_PIN, false, "Light 2 / Zone 2" }
};
const size_t NUM_RELAYS = sizeof(relays) / sizeof(relays[0]);

// Dimmer State (0 = OFF, 100 = Full Speed/Power)
volatile int dimmerSpeed = 0;  // 0 - 100%
volatile bool zeroCrossDetected = false;

// PZEM-004T Power Telemetry
struct EnergyData {
  float voltage;      // Volts (V)
  float current;      // Amperes (A)
  float power;        // Watts (W)
  float energy;       // Kilowatt-hours (kWh)
  float frequency;    // Hertz (Hz)
  float powerFactor;  // 0.00 to 1.00
  bool isValid;
};
EnergyData pzemData = { 230.0f, 0.0f, 0.0f, 0.0f, 50.0f, 1.0f, false };

// Web Server
WebServer server(HTTP_PORT);

// Hardware Serial for PZEM-004T v3.0 (Modbus-RTU Protocol)
HardwareSerial pzemSerial(2);

// ==============================================================================
// 3. ZERO CROSSING INTERRUPT FOR DIMMER
// ==============================================================================
void IRAM_ATTR onZeroCross() {
  if (dimmerSpeed <= 0) {
    digitalWrite(DIMMER_DAT_PIN, LOW);
    return;
  }
  if (dimmerSpeed >= 100) {
    digitalWrite(DIMMER_DAT_PIN, HIGH);
    return;
  }

  // Phase cut timing calculation for 50Hz (10ms half-cycle)
  // Firing delay: 10000us * (100 - dimmerSpeed) / 100
  int firingDelayMicros = (100 - dimmerSpeed) * 90; // Approx 90us per %
  delayMicroseconds(firingDelayMicros);
  digitalWrite(DIMMER_DAT_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(DIMMER_DAT_PIN, LOW);
}

// ==============================================================================
// 4. PZEM-004T V3.0 MODBUS-RTU READER
// ==============================================================================
// Modbus command: Read input registers 0x0000 to 0x0009 (10 registers)
const uint8_t pzemReadCommand[] = { 0x01, 0x04, 0x00, 0x00, 0x00, 0x0A, 0x70, 0x0D };

void readPzemSensor() {
  // Clear any residual bytes in UART buffer
  while (pzemSerial.available()) {
    pzemSerial.read();
  }

  pzemSerial.write(pzemReadCommand, sizeof(pzemReadCommand));
  delay(100);

  if (pzemSerial.available() >= 25) {
    uint8_t buffer[25];
    pzemSerial.readBytes(buffer, 25);

    // Validate Modbus header (Address 0x01, Function 0x04, Byte count 0x14)
    if (buffer[0] == 0x01 && buffer[1] == 0x04 && buffer[2] == 0x14) {
      uint16_t rawVoltage = (buffer[3] << 8) | buffer[4];
      pzemData.voltage = rawVoltage * 0.1f;

      uint32_t rawCurrent = (buffer[7] << 8) | buffer[8] | (buffer[5] << 24) | (buffer[6] << 16);
      pzemData.current = rawCurrent * 0.001f;

      uint32_t rawPower = (buffer[11] << 8) | buffer[12] | (buffer[9] << 24) | (buffer[10] << 16);
      pzemData.power = rawPower * 0.1f;

      uint32_t rawEnergy = (buffer[15] << 8) | buffer[16] | (buffer[13] << 24) | (buffer[14] << 16);
      pzemData.energy = rawEnergy * 1.0f; // Wh or kWh based on version

      uint16_t rawFreq = (buffer[17] << 8) | buffer[18];
      pzemData.frequency = rawFreq * 0.1f;

      uint16_t rawPF = (buffer[19] << 8) | buffer[20];
      pzemData.powerFactor = rawPF * 0.01f;

      pzemData.isValid = true;
      return;
    }
  }
  
  // If sensor is not replying (e.g. testing without AC connected), flag validity
  pzemData.isValid = false;
}

// ==============================================================================
// 5. RELAY HARDWARE CONTROL
// ==============================================================================
bool setRelay(size_t relayIndex, bool state) {
  if (relayIndex >= NUM_RELAYS) return false;
  relays[relayIndex].state = state;
  digitalWrite(relays[relayIndex].pin, state ? RELAY_STATE_ON : RELAY_STATE_OFF);
  Serial.printf("[ESP32] Relay %d (%s) -> %s\n", (int)relayIndex + 1, relays[relayIndex].label, state ? "ON" : "OFF");
  return true;
}

void setDimmerSpeed(int speed) {
  dimmerSpeed = max(0, min(100, speed));
  Serial.printf("[ESP32] Dimmer Speed set to %d%%\n", dimmerSpeed);
}

// ==============================================================================
// 6. REST API HANDLERS
// ==============================================================================
void handleGetStatus() {
  StaticJsonDocument<512> doc;
  doc["device"] = "ESP32_SMART_LAB_CONTROLLER";
  doc["version"] = "1.0.0";
  doc["uptime_ms"] = millis();

  JsonArray relayArr = doc.createNestedArray("relays");
  for (size_t i = 0; i < NUM_RELAYS; i++) {
    JsonObject r = relayArr.createNestedObject();
    r["id"] = i + 1;
    r["pin"] = relays[i].pin;
    r["label"] = relays[i].label;
    r["state"] = relays[i].state ? "ON" : "OFF";
  }

  JsonObject dimmerObj = doc.createNestedObject("dimmer");
  dimmerObj["channel"] = 1;
  dimmerObj["speed"] = dimmerSpeed;
  dimmerObj["zvc_pin"] = DIMMER_ZVC_PIN;
  dimmerObj["dat_pin"] = DIMMER_DAT_PIN;

  String output;
  serializeJson(doc, output);
  server.send(200, "application/json", output);
}

void handleRelayControl() {
  String uri = server.uri();
  bool turnOn = uri.endsWith("/on");
  int relayId = 1;

  if (uri.indexOf("/relay/2/") >= 0) {
    relayId = 2;
  }

  bool success = setRelay(relayId - 1, turnOn);
  StaticJsonDocument<256> doc;
  doc["success"] = success;
  doc["relay_id"] = relayId;
  doc["state"] = turnOn ? "ON" : "OFF";
  
  String output;
  serializeJson(doc, output);
  server.send(success ? 200 : 400, "application/json", output);
}

void handleDimmerSpeed() {
  if (!server.hasArg("plain")) {
    server.send(400, "application/json", "{\"error\":\"Missing JSON body\"}");
    return;
  }
  StaticJsonDocument<128> doc;
  DeserializationError err = deserializeJson(doc, server.arg("plain"));
  if (err || !doc.containsKey("speed")) {
    server.send(400, "application/json", "{\"error\":\"Invalid JSON or speed key missing\"}");
    return;
  }

  int speed = doc["speed"].as<int>();
  setDimmerSpeed(speed);

  StaticJsonDocument<128> res;
  res["success"] = true;
  res["speed"] = dimmerSpeed;
  String output;
  serializeJson(res, output);
  server.send(200, "application/json", output);
}

void handleGetEnergy() {
  readPzemSensor();

  StaticJsonDocument<256> doc;
  doc["success"] = true;
  doc["is_valid"] = pzemData.isValid;
  doc["voltage"] = pzemData.voltage;
  doc["current"] = pzemData.current;
  doc["power"] = pzemData.power;
  doc["energy"] = pzemData.energy;
  doc["frequency"] = pzemData.frequency;
  doc["power_factor"] = pzemData.powerFactor;

  String output;
  serializeJson(doc, output);
  server.send(200, "application/json", output);
}

// ==============================================================================
// 7. SERIAL COMMAND INTERPRETER (FOR USB CLI / DIRECT CONNECTION)
// ==============================================================================
void processSerialCommand(String cmd) {
  cmd.trim();
  cmd.toUpperCase();
  if (cmd.length() == 0) return;

  Serial.printf("[CMD RECEIVED]: %s\n", cmd.c_str());

  if (cmd == "LIGHT 1 ON") {
    setRelay(0, true);
  } else if (cmd == "LIGHT 1 OFF") {
    setRelay(0, false);
  } else if (cmd == "LIGHT 2 ON") {
    setRelay(1, true);
  } else if (cmd == "LIGHT 2 OFF") {
    setRelay(1, false);
  } else if (cmd.startsWith("FAN 1 SPEED ")) {
    int spd = cmd.substring(12).toInt();
    setDimmerSpeed(spd);
  } else if (cmd == "FAN 1 ON") {
    setDimmerSpeed(75);
  } else if (cmd == "FAN 1 OFF") {
    setDimmerSpeed(0);
  } else if (cmd == "STATUS") {
    Serial.printf("Relay 1: %s, Relay 2: %s, Dimmer: %d%%\n", 
                  relays[0].state ? "ON" : "OFF",
                  relays[1].state ? "ON" : "OFF",
                  dimmerSpeed);
  } else if (cmd == "ENERGY") {
    readPzemSensor();
    Serial.printf("V=%.1fV, I=%.2fA, P=%.1fW, E=%.2fkWh, F=%.1fHz, PF=%.2f\n",
                  pzemData.voltage, pzemData.current, pzemData.power,
                  pzemData.energy, pzemData.frequency, pzemData.powerFactor);
  } else {
    Serial.println("[ERROR]: Unknown command. Usage: LIGHT [1|2] [ON|OFF], FAN 1 SPEED [0-100], STATUS, ENERGY");
  }
}

// ==============================================================================
// 8. SETUP & MAIN LOOP
// ==============================================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("==================================================");
  Serial.println("  SMART LAB AUTOMATION - ESP32 FIRMWARE CONTROLLER");
  Serial.println("==================================================");

  // Initialize Relays as Outputs (Default OFF)
  for (size_t i = 0; i < NUM_RELAYS; i++) {
    pinMode(relays[i].pin, OUTPUT);
    digitalWrite(relays[i].pin, RELAY_STATE_OFF);
  }

  // Initialize Xenbrix Dimmer pins
  pinMode(DIMMER_DAT_PIN, OUTPUT);
  digitalWrite(DIMMER_DAT_PIN, LOW);
  pinMode(DIMMER_ZVC_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(DIMMER_ZVC_PIN), onZeroCross, RISING);

  // Initialize PZEM-004T Serial2
  pzemSerial.begin(9600, SERIAL_8N1, PZEM_RX_PIN, PZEM_TX_PIN);

  // Initialize WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 15) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[WiFi] Connected! IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("[WiFi] Warning: WiFi not connected. Standalone USB Serial control active.");
  }

  // Register Web Server Routes
  server.on("/api/status", HTTP_GET, handleGetStatus);
  server.on("/api/relay/1/on", HTTP_POST, handleRelayControl);
  server.on("/api/relay/1/off", HTTP_POST, handleRelayControl);
  server.on("/api/relay/2/on", HTTP_POST, handleRelayControl);
  server.on("/api/relay/2/off", HTTP_POST, handleRelayControl);
  server.on("/api/dimmer/1/speed", HTTP_POST, handleDimmerSpeed);
  server.on("/api/energy", HTTP_GET, handleGetEnergy);

  server.begin();
  Serial.println("[HTTP] REST API Server listening on port 80.");
  Serial.println("Ready.");
}

void loop() {
  // Handle HTTP REST client requests
  server.handleClient();

  // Handle USB Serial CLI commands
  if (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    processSerialCommand(line);
  }
}
