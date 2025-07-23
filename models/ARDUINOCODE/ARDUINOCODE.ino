#include <HX711.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <EEPROM.h>

#define FLOW_RATE_DELAY_MS 60000  
#define DT 4
#define SCK 16
#define NOISE_THRESHOLD 2 

HX711 scale;

const char* ssid = "Pldt"; 
const char* password = "Ladoysot567890!";
const char* serverURL = "https://192.168.1.4:5001/predict-post";  

unsigned long lastFlowRateCalculationTime = 0; 
float calibration_factor = 458;
const int max_catheter_bag_volume = 800;
float offset = 411;
int catheter_bag_volume = 0;
int urine_output = 0;
float urine_flow_rate = 0;
unsigned long startTime = 0;
float lastKnownFlowRate = 0;  
int starting_catheter_bag_volume = 0;

int eeprom_start_address = 0;
bool wasNotEmpty = true;
static unsigned long lastDataSend = 0;
unsigned long last_update_time = 0;
int previous_bag_volume = 0; 

void connectToWiFi();
void loadEEPROMData();
void calculateUrineFlowRate(int current_bag_volume);
void checkWiFiConnection();
void sendDataToServer(int urine_output, float urine_flow_rate, int catheter_bag_volume, int remaining_volume);
void resetEEPROM();
void saveEEPROMData();
void saveToEEPROM(int address, int value);
int readEEPROM(int address);

void setup() {
    Serial.begin(9600);
    scale.begin(DT, SCK);
    scale.set_scale(calibration_factor);
    EEPROM.begin(512);
    loadEEPROMData();  
    connectToWiFi();
    startTime = millis();
}

void loop() {
    checkWiFiConnection();
    int current_bag_volume = scale.get_units(10) - offset;
    if (current_bag_volume < 0) current_bag_volume = 0;

    if (millis() - lastFlowRateCalculationTime >= FLOW_RATE_DELAY_MS) {
        calculateUrineFlowRate(current_bag_volume);  
        lastFlowRateCalculationTime = millis();
    }

    urine_output = current_bag_volume - starting_catheter_bag_volume;
    if (urine_output < 0) urine_output = 0;

    catheter_bag_volume = current_bag_volume;
    int remaining_volume = max_catheter_bag_volume - catheter_bag_volume;
    if (remaining_volume <= 0) remaining_volume = 0;

    if (catheter_bag_volume == 0 && wasNotEmpty) {
        Serial.println("Catheter bag empty! Resetting EEPROM...");
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

    if (millis() - last_update_time >= 3600000) { 
        saveEEPROMData();
        last_update_time = millis();
    }
}

void calculateUrineFlowRate(int current_bag_volume) {
    float volume_change = current_bag_volume - previous_bag_volume;

    if (abs(volume_change) >= NOISE_THRESHOLD) {
        unsigned long totalElapsedTime = millis() - startTime;
        float elapsedTimeMinutes = totalElapsedTime / 60000.0;

        if (elapsedTimeMinutes > 0) {
            urine_flow_rate = volume_change / elapsedTimeMinutes;
            if (urine_flow_rate < 0) {
                urine_flow_rate = 0;
            }
        }

        lastKnownFlowRate = urine_flow_rate;
        previous_bag_volume = current_bag_volume;
        startTime = millis();
    } else {
        urine_flow_rate = lastKnownFlowRate;
    }
}

void connectToWiFi() {
    WiFi.begin(ssid, password);
    Serial.print("Connecting to WiFi");
    while (WiFi.status() != WL_CONNECTED) {
        Serial.print("...");
        delay(1000);
    }
    Serial.println("\nWiFi Connected!");
}

void checkWiFiConnection() {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("WiFi Disconnected! Reconnecting...");
        connectToWiFi();
    }
}

void sendDataToServer(int urine_output, float urine_flow_rate, int catheter_bag_volume, int remaining_volume) {
    HTTPClient http;
    http.begin(serverURL);
    http.addHeader("Content-Type", "application/json");

    String jsonPayload = "{";
    jsonPayload += "\"urine_output\":" + String(urine_output) + ",";  
    jsonPayload += "\"urine_flow_rate\":" + String(urine_flow_rate, 2) + ",";  
    jsonPayload += "\"catheter_bag_volume\":" + String(catheter_bag_volume) + ",";  
    jsonPayload += "\"remaining_volume\":" + String(remaining_volume);  
    jsonPayload += "}";

    int httpResponseCode = http.POST(jsonPayload);
    Serial.println("Data Sent: " + jsonPayload);
    Serial.println("Response Code: " + String(httpResponseCode));

    http.end();
}

void resetEEPROM() {
    Serial.println("Resetting EEPROM...");
    catheter_bag_volume = 0;
    urine_output = 0;
    starting_catheter_bag_volume = 0;

    for (int i = 0; i < 12; i++) {
        EEPROM.write(eeprom_start_address + i, 0);  
    }
    EEPROM.commit();
    
    Serial.println("EEPROM Reset: All data cleared.");
}

void saveEEPROMData() {
    urine_output = 0;  
    starting_catheter_bag_volume = catheter_bag_volume;  

    saveToEEPROM(eeprom_start_address, catheter_bag_volume);
    saveToEEPROM(eeprom_start_address + 4, urine_output);
    saveToEEPROM(eeprom_start_address + 8, starting_catheter_bag_volume);
}

void loadEEPROMData() {
    catheter_bag_volume = readEEPROM(eeprom_start_address);
    urine_output = readEEPROM(eeprom_start_address + 4);
    starting_catheter_bag_volume = readEEPROM(eeprom_start_address + 8);
}

void saveToEEPROM(int address, int value) {
    int storedValue = readEEPROM(address);  
    if (storedValue != value) {  
        EEPROM.write(address, (value >> 8) & 0xFF);
        EEPROM.write(address + 1, value & 0xFF);
        EEPROM.commit();
    }
}

int readEEPROM(int address) {
    int highByte = EEPROM.read(address);
    int lowByte = EEPROM.read(address + 1);
    return (highByte << 8) + lowByte;
}
