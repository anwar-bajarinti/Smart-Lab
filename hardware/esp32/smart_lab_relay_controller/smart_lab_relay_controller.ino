#include <Arduino.h>
#include <PZEM004Tv30.h>

// ==============================================================================
// SMART LAB AUTOMATION — ESP32 DUAL RELAY & PZEM-004T CONTROLLER
// ==============================================================================
// Confirmed Hardware Mapping:
// - GPIO22 -> Relay 1 IN -> Light 1 (Zone Z1) (Active HIGH)
// - GPIO23 -> Relay 2 IN -> Light 2 (Zone Z9) (Active HIGH)
// - GPIO25 -> ESP32 RX <- PZEM TX (UART2)
// - GPIO33 -> ESP32 TX -> PZEM RX (UART2)
// ==============================================================================

#define RELAY1_PIN  22  // Light 1 (Active HIGH)
#define RELAY2_PIN  23  // Light 2 (Active HIGH)
#define STATUS_LED   2  // Onboard LED

#define PZEM_RX_PIN 25  // ESP32 RX <- PZEM TX
#define PZEM_TX_PIN 33  // ESP32 TX -> PZEM RX

// Active HIGH relay logic
#define RELAY_ON    HIGH
#define RELAY_OFF   LOW

HardwareSerial pzemSerial(2);
PZEM004Tv30 pzem(pzemSerial, PZEM_RX_PIN, PZEM_TX_PIN);

bool relay1State = false;
bool relay2State = false;

// Cached PZEM metrics
float pzemVoltage   = 0.0f;
float pzemCurrent   = 0.0f;
float pzemPower     = 0.0f;
float pzemEnergy    = 0.0f;
float pzemFrequency = 0.0f;
float pzemPF        = 0.0f;
bool  pzemValid     = false;

unsigned long lastRead = 0;
String serialBuf = "";

void setRelay1(bool state) {
  relay1State = state;
  digitalWrite(RELAY1_PIN, state ? RELAY_ON : RELAY_OFF);
  Serial.printf("[ACK] Relay 1 / Light 1 (GPIO 22) -> %s\n", state ? "ON" : "OFF");
}

void setRelay2(bool state) {
  relay2State = state;
  digitalWrite(RELAY2_PIN, state ? RELAY_ON : RELAY_OFF);
  Serial.printf("[ACK] Relay 2 / Light 2 (GPIO 23) -> %s\n", state ? "ON" : "OFF");
}

void readPzemSensor() {
  float v = pzem.voltage();
  float c = pzem.current();
  float p = pzem.power();
  float e = pzem.energy();
  float f = pzem.frequency();
  float pf = pzem.pf();

  // Validate plausible AC mains metrics to filter any serial alignment glitches
  if (!isnan(v) && v >= 80.0f && v <= 300.0f && (isnan(f) || (f >= 40.0f && f <= 70.0f))) {
    pzemVoltage   = v;
    pzemCurrent   = (isnan(c) || c < 0.0f) ? 0.0f : c;
    pzemPower     = (isnan(p) || p < 0.0f) ? 0.0f : p;
    pzemEnergy    = (isnan(e) || e < 0.0f) ? 0.0f : e;
    pzemFrequency = (isnan(f) || f < 40.0f || f > 70.0f) ? 50.0f : f;
    pzemPF        = (isnan(pf) || pf < 0.0f || pf > 1.0f) ? 1.0f : pf;
    pzemValid     = true;

    // Human-readable format
    Serial.println("\n--- ACTUAL PZEM DATA ---");
    Serial.printf("Voltage:   %.2f V\n", pzemVoltage);
    Serial.printf("Current:   %.3f A\n", pzemCurrent);
    Serial.printf("Power:     %.2f W\n", pzemPower);
    Serial.printf("Energy:    %.3f kWh\n", pzemEnergy);
    Serial.printf("Frequency: %.2f Hz\n", pzemFrequency);
    Serial.printf("Power PF:  %.2f\n", pzemPF);

    // Machine-readable JSON line for Python bridge
    Serial.printf("PZEM:{\"voltage\":%.1f,\"current\":%.3f,\"power\":%.1f,\"energy\":%.3f,\"frequency\":%.1f,\"pf\":%.2f,\"valid\":true}\n",
                  pzemVoltage, pzemCurrent, pzemPower, pzemEnergy, pzemFrequency, pzemPF);
  } else {
    pzemValid = false;
    Serial.println("\n--- ACTUAL PZEM DATA ---");
    Serial.println("PZEM NOT RESPONDING");
    Serial.println("PZEM:{\"voltage\":null,\"current\":null,\"power\":null,\"energy\":null,\"frequency\":null,\"pf\":null,\"valid\":false}");
  }
}

void parseCommand(String cmd) {
  cmd.trim();
  if (cmd.length() == 0) return;

  // Single-character commands
  if (cmd == "1") { setRelay1(true);  readPzemSensor(); return; }
  if (cmd == "0") { setRelay1(false); readPzemSensor(); return; }
  if (cmd == "2") { setRelay2(true);  readPzemSensor(); return; }
  if (cmd == "3") { setRelay2(false); readPzemSensor(); return; }
  if (cmd == "A" || cmd == "a") { setRelay1(true);  setRelay2(true);  readPzemSensor(); return; }
  if (cmd == "B" || cmd == "b") { setRelay1(false); setRelay2(false); readPzemSensor(); return; }

  // Word-based commands
  String upper = cmd;
  upper.toUpperCase();
  if (upper == "R1 ON" || upper == "RELAY 1 ON" || upper == "LIGHT 1 ON") {
    setRelay1(true);
    readPzemSensor();
  } else if (upper == "R1 OFF" || upper == "RELAY 1 OFF" || upper == "LIGHT 1 OFF") {
    setRelay1(false);
    readPzemSensor();
  } else if (upper == "R2 ON" || upper == "RELAY 2 ON" || upper == "LIGHT 2 ON") {
    setRelay2(true);
    readPzemSensor();
  } else if (upper == "R2 OFF" || upper == "RELAY 2 OFF" || upper == "LIGHT 2 OFF") {
    setRelay2(false);
    readPzemSensor();
  } else if (upper == "STATUS") {
    Serial.printf("[STATUS] Relay1(GPIO22):%s | Relay2(GPIO23):%s | PZEM:%s\n",
                  relay1State ? "ON" : "OFF",
                  relay2State ? "ON" : "OFF",
                  pzemValid ? "ONLINE" : "NO_DATA");
  } else if (upper == "PZEM" || upper == "ENERGY") {
    readPzemSensor();
  } else if (upper == "PING") {
    Serial.println("[ACK] PONG");
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(RELAY1_PIN, OUTPUT);
  pinMode(RELAY2_PIN, OUTPUT);
  pinMode(STATUS_LED, OUTPUT);

  // Default state: Relays OFF (Active HIGH -> LOW)
  digitalWrite(RELAY1_PIN, RELAY_OFF);
  digitalWrite(RELAY2_PIN, RELAY_OFF);
  digitalWrite(STATUS_LED, LOW);

  // Initialize PZEM UART on GPIO25 (RX) & GPIO33 (TX)
  pzemSerial.begin(9600, SERIAL_8N1, PZEM_RX_PIN, PZEM_TX_PIN);

  Serial.println("\n==================================================");
  Serial.println(" SMART LAB - ESP32 DUAL RELAY & PZEM-004T CONTROLLER");
  Serial.println("==================================================");
  Serial.println(" Relay 1 (Light 1 / Z1) : GPIO 22 (Active HIGH)");
  Serial.println(" Relay 2 (Light 2 / Z9) : GPIO 23 (Active HIGH)");
  Serial.printf(" PZEM UART              : RX=GPIO%d, TX=GPIO%d\n", PZEM_RX_PIN, PZEM_TX_PIN);
  Serial.println(" Commands               : 1=R1 ON, 0=R1 OFF, 2=R2 ON, 3=R2 OFF, A=Both ON, B=Both OFF");
  Serial.println("==================================================");

  // Initial read
  readPzemSensor();
}

void loop() {
  // Read Serial Commands
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (serialBuf.length() > 0) {
        parseCommand(serialBuf);
        serialBuf = "";
      }
    } else {
      // Immediate single-char command handling if buffer is empty
      if (serialBuf.length() == 0 && (c == '0' || c == '1' || c == '2' || c == '3' || c == 'A' || c == 'B' || c == 'a' || c == 'b')) {
        String singleCmd = String(c);
        parseCommand(singleCmd);
      } else {
        if (serialBuf.length() < 64) {
          serialBuf += c;
        }
      }
    }
  }

  // Periodic PZEM Sensor Read (Every 1500ms)
  if (millis() - lastRead >= 1500) {
    lastRead = millis();
    readPzemSensor();
  }
}
