#include <HX711.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <EEPROM.h>
#include "config.h"

#define FLOW_RATE_DELAY_MS  60000
#define DT                  4
#define SCK                 16
#define NOISE_THRESHOLD     2

HX711 scale;

// SEC-9: ISRG Root X1 — root CA used by Vercel (Let's Encrypt chain)
static const char ROOT_CA[] PROGMEM =
    "-----BEGIN CERTIFICATE-----\n"
    "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\n"
    "-----END CERTIFICATE-----\n";

float calibration_factor = 458;
const int max_catheter_bag_volume = 800;
float offset = 411;
int catheter_bag_volume = 0;
int urine_output = 0;
float urine_flow_rate = 0;
float lastKnownFlowRate = 0;
int starting_catheter_bag_volume = 0;

int eeprom_start_address = 0;
bool wasNotEmpty = true;
static unsigned long lastDataSend = 0;
static unsigned long lastFlowRateCalcTime = 0;   // BUG-9: tracks when flow was last calculated
int previous_bag_volume = 0;

void connectToWiFi();
void loadEEPROMData();
void calculateUrineFlowRate(int current_bag_volume);
void checkWiFiConnection();
void sendDataToServer(int urine_output, float urine_flow_rate, int catheter_bag_volume, int remaining_volume);
void resetEEPROM();
void saveEEPROMData();
void saveToEEPROM(int address, int value);
int  readEEPROM(int address);

void setup() {
    Serial.begin(9600);
    scale.begin(DT, SCK);
    scale.set_scale(calibration_factor);
    EEPROM.begin(512);
    loadEEPROMData();
    connectToWiFi();
    lastFlowRateCalcTime = millis();
}

void loop() {
    checkWiFiConnection();
    int current_bag_volume = scale.get_units(10) - offset;
    if (current_bag_volume < 0) current_bag_volume = 0;

    if (millis() - lastFlowRateCalcTime >= FLOW_RATE_DELAY_MS) {
        calculateUrineFlowRate(current_bag_volume);
        lastFlowRateCalcTime = millis();
    }

    urine_output = current_bag_volume - starting_catheter_bag_volume;
    if (urine_output < 0) urine_output = 0;

    catheter_bag_volume = current_bag_volume;
    int remaining_volume = max_catheter_bag_volume - catheter_bag_volume;
    if (remaining_volume <= 0) remaining_volume = 0;

    if (catheter_bag_volume == 0 && wasNotEmpty) {
        Serial.println("Catheter bag empty — resetting EEPROM.");
        wasNotEmpty = false;
        resetEEPROM();
        loadEEPROMData();
    } else if (catheter_bag_volume > 0) {
        wasNotEmpty = true;
    }

    if (millis() - lastDataSend >= 1000) {
        sendDataToServer(urine_output, urine_flow_rate, catheter_bag_volume, remaining_volume);
        lastDataSend = millis();
    }

    // Persist EEPROM state every hour (does NOT reset urine_output — BUG-7 fix)
    static unsigned long lastEepromSave = 0;
    if (millis() - lastEepromSave >= 3600000) {
        saveEEPROMData();
        lastEepromSave = millis();
    }
}

// BUG-9: flow rate now uses the interval between consecutive calculations,
// not the total elapsed time since the last significant volume change.
void calculateUrineFlowRate(int current_bag_volume) {
    float volume_change    = current_bag_volume - previous_bag_volume;
    float elapsedMinutes   = FLOW_RATE_DELAY_MS / 60000.0;  // constant 1-minute interval

    if (abs(volume_change) >= NOISE_THRESHOLD) {
        urine_flow_rate   = volume_change / elapsedMinutes;
        if (urine_flow_rate < 0) urine_flow_rate = 0;
        lastKnownFlowRate = urine_flow_rate;
    } else {
        urine_flow_rate = lastKnownFlowRate;
    }

    previous_bag_volume = current_bag_volume;
}

void connectToWiFi() {
    WiFi.begin(ssid, password);
    Serial.print("Connecting to WiFi");
    while (WiFi.status() != WL_CONNECTED) {
        Serial.print(".");
        delay(1000);
    }
    Serial.println("\nWiFi Connected!");
}

void checkWiFiConnection() {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("WiFi disconnected — reconnecting.");
        connectToWiFi();
    }
}

// SEC-8 + SEC-9: sends X-Api-Key and X-Device-Id; uses WiFiClientSecure with CA cert.
void sendDataToServer(int urine_output, float urine_flow_rate, int catheter_bag_volume, int remaining_volume) {
    WiFiClientSecure client;
    client.setCACert(ROOT_CA);  // SEC-9: validate server certificate

    HTTPClient http;
    http.begin(client, serverURL);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Api-Key",   apiKey);    // SEC-8 / SEC-1: authenticate request
    http.addHeader("X-Device-Id", deviceId);  // SEC-8: identify source device

    String payload = "{";
    payload += "\"urine_output\":"        + String(urine_output)          + ",";
    payload += "\"urine_flow_rate\":"     + String(urine_flow_rate, 2)    + ",";
    payload += "\"catheter_bag_volume\":" + String(catheter_bag_volume)   + ",";
    payload += "\"remaining_volume\":"    + String(remaining_volume);
    payload += "}";

    int code = http.POST(payload);
    Serial.println("Data sent: "    + payload);
    Serial.println("Response code: " + String(code));
    http.end();
}

void resetEEPROM() {
    catheter_bag_volume          = 0;
    urine_output                 = 0;
    starting_catheter_bag_volume = 0;
    for (int i = 0; i < 12; i++) EEPROM.write(eeprom_start_address + i, 0);
    EEPROM.commit();
    Serial.println("EEPROM reset.");
}

// BUG-7: only persists state — no longer resets urine_output as a side effect.
void saveEEPROMData() {
    starting_catheter_bag_volume = catheter_bag_volume;
    saveToEEPROM(eeprom_start_address,     catheter_bag_volume);
    saveToEEPROM(eeprom_start_address + 4, urine_output);
    saveToEEPROM(eeprom_start_address + 8, starting_catheter_bag_volume);
}

void loadEEPROMData() {
    catheter_bag_volume          = readEEPROM(eeprom_start_address);
    urine_output                 = readEEPROM(eeprom_start_address + 4);
    starting_catheter_bag_volume = readEEPROM(eeprom_start_address + 8);
}

void saveToEEPROM(int address, int value) {
    if (readEEPROM(address) != value) {
        EEPROM.write(address,     (value >> 8) & 0xFF);
        EEPROM.write(address + 1,  value       & 0xFF);
        EEPROM.commit();
    }
}

int readEEPROM(int address) {
    return ((int)EEPROM.read(address) << 8) + EEPROM.read(address + 1);
}
