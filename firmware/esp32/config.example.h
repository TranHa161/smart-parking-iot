#ifndef CONFIG_EXAMPLE_H
#define CONFIG_EXAMPLE_H

// Điền thông tin thực tế và đổi tên file thành config.h
#define WIFI_SSID       "YOUR_WIFI_SSID"
#define WIFI_PASS       "YOUR_WIFI_PASSWORD"

#define MQTT_HOST       "spark-hub.duckdns.org"
#define MQTT_PORT       1883
#define MQTT_USER       "parking-gw"
#define MQTT_PASS       "YOUR_MQTT_PASSWORD"
#define MQTT_CLIENT_ID  "parking-gateway-1"

#define TOPIC_UP        "parking/gate/up"
#define TOPIC_DOWN      "parking/gate/down"
#define TOPIC_STATUS    "parking/gate/status"

#endif