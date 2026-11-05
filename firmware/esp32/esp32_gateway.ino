/**
 * Smart Parking - ESP32 Gateway (cau noi UART <-> MQTT)
 *
 *  STM32 (USART1)  <--UART 115200 8N1-->  ESP32 Serial2 (RX=16, TX=17)
 *  ESP32           <--Wi-Fi / MQTT----->  Mosquitto (server)
 *
 * ESP32 KHONG xu ly nghiep vu: chi chuyen nguyen dong text giua UART va MQTT.
 * Giao thuc cac dong: xem docs/UART_PROTOCOL.md trong project STM32.
 *
 *   STM32 -> server : topic  parking/gate/up      (RFID:..., SLOTS:..., BOOT)
 *   server -> STM32 : topic  parking/gate/down    (OPEN_GATE, DENY, FEE:..., RESERVE:n, CANCEL:n, SYNC)
 *   trang thai      : topic  parking/gate/status  ("online"/"offline", retained, co LWT)
 *
 * Thu vien can cai (Library Manager): "PubSubClient" cua Nick O'Leary.
 * Board: "ESP32 Dev Module". Serial Monitor: 115200 (chi de debug).
 */
#include <WiFi.h>
#include <PubSubClient.h>
#include "config.h"

// ======================= CAU HINH: SUA CHO PHU HOP =======================
const char*    WIFI_SSID = WIFI_SSID;
const char*    WIFI_PASS = WIFI_PASS;

const uint16_t MQTT_PORT = MQTT_PORT;
const char* MQTT_HOST = MQTT_HOST;
const char* MQTT_USER = MQTT_USER;
const char* MQTT_PASS = MQTT_PASS;
const char*    CLIENT_ID   = CLIENT_ID;

const char*    TOPIC_UP     = TOPIC_UP;
const char*    TOPIC_DOWN   = TOPIC_DOWN;
const char*    TOPIC_STATUS = TOPIC_STATUS;

#define UART_RX_PIN     16      // noi voi PA9  (TX STM32)
#define UART_TX_PIN     17      // noi voi PA10 (RX STM32)
#define UART_BAUD       115200
#define STATUS_LED      2       // LED tren board
// =========================================================================

#define LINE_MAX_LEN    63      // khop voi bo dem 64 byte ben STM32

WiFiClient   wifiClient;
PubSubClient mqtt(wifiClient);

static char     lineBuf[LINE_MAX_LEN + 1];
static uint8_t  lineLen = 0;
static uint32_t lastMqttAttempt = 0;

// ---------- Chuyen dong tu server xuong STM32 ----------
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  if (strcmp(topic, TOPIC_DOWN) != 0) return;

  char msg[LINE_MAX_LEN + 1];
  unsigned int n = (length > LINE_MAX_LEN) ? LINE_MAX_LEN : length;
  memcpy(msg, payload, n);
  msg[n] = '\0';

  // cat \r \n o cuoi, bo qua payload rong
  while (n > 0 && (msg[n - 1] == '\n' || msg[n - 1] == '\r')) msg[--n] = '\0';
  if (n == 0) return;

  Serial.printf("[DOWN] %s\n", msg);
  Serial2.print(msg);
  Serial2.print('\n');
}

// ---------- Chuyen dong tu STM32 len server ----------
void forwardLineToServer(const char* line) {
  if (mqtt.connected()) {
    mqtt.publish(TOPIC_UP, line);
    Serial.printf("[UP]   %s\n", line);
  } else {
    // Mat ket noi: bo dong nay. SLOTS duoc STM32 gui lai moi 1 s nen khong mat du lieu;
    // RFID bi bo -> STM32 se hien "SERVER TIMEOUT" sau 5 s.
    Serial.printf("[DROP] %s (MQTT offline)\n", line);
  }
}

void uartTask() {
  while (Serial2.available()) {
    char c = (char)Serial2.read();
    if (c == '\n' || c == '\r') {
      if (lineLen > 0) {
        lineBuf[lineLen] = '\0';
        forwardLineToServer(lineBuf);
        lineLen = 0;
      }
    } else if (lineLen < LINE_MAX_LEN) {
      lineBuf[lineLen++] = c;
    } else {
      lineLen = 0;            // dong qua dai: bo
    }
  }
}

// ---------- MQTT: ket noi lai khong chan ----------
void mqttTask() {
  if (WiFi.status() != WL_CONNECTED) return;

  if (!mqtt.connected()) {
    uint32_t now = millis();
    if (now - lastMqttAttempt < 3000) return;
    lastMqttAttempt = now;

    Serial.print("[MQTT] connecting... ");
    bool ok = mqtt.connect(CLIENT_ID,
                           MQTT_USER[0] ? MQTT_USER : nullptr,
                           MQTT_USER[0] ? MQTT_PASS : nullptr,
                           TOPIC_STATUS, 1, true, "offline");   // Last Will: offline
    if (ok) {
      Serial.println("OK");
      mqtt.publish(TOPIC_STATUS, "online", true);
      mqtt.subscribe(TOPIC_DOWN, 1);
      Serial2.print("SYNC\n");     // yeu cau STM32 gui lai SLOTS ngay
    } else {
      Serial.printf("fail rc=%d\n", mqtt.state());
    }
    return;
  }
  mqtt.loop();
}

// ---------- LED trang thai: nhay nhanh = chua len mang, sang = da ket noi MQTT ----------
void ledTask() {
  static uint32_t last = 0;
  static bool on = false;
  if (mqtt.connected()) {
    digitalWrite(STATUS_LED, HIGH);
    return;
  }
  uint32_t now = millis();
  uint32_t period = (WiFi.status() == WL_CONNECTED) ? 600 : 150;
  if (now - last >= period) {
    last = now;
    on = !on;
    digitalWrite(STATUS_LED, on);
  }
}

void setup() {
  pinMode(STATUS_LED, OUTPUT);
  Serial.begin(115200);
  Serial2.begin(UART_BAUD, SERIAL_8N1, UART_RX_PIN, UART_TX_PIN);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  mqtt.setKeepAlive(15);
  mqtt.setBufferSize(256);

  Serial.println("\n[GATEWAY] started");
}

// Đọc từ bàn phím Serial Monitor máy tính -> bắn thẳng xuống STM32 qua Serial2
void serialDebugTask() {
  static char sBuf[LINE_MAX_LEN + 1];
  static uint8_t sLen = 0;
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (sLen > 0) {
        sBuf[sLen] = '\0';
        Serial.printf("[PC -> STM32] %s\n", sBuf);
        Serial2.print(sBuf);
        Serial2.print('\n');
        sLen = 0;
      }
    } else if (sLen < LINE_MAX_LEN) {
      sBuf[sLen++] = c;
    }
  }
}

void loop() {
  uartTask();     // luon doc UART truoc de khong tran bo dem
  serialDebugTask();
  mqttTask();
  ledTask();
}
