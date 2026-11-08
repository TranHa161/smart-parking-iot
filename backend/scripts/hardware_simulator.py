#!/usr/bin/env python3
"""
hardware_simulator.py
Mô phỏng Kit vi điều khiển STM32F401RE, Cảm biến siêu âm HC-SR04, Đầu đọc RC522 và Động cơ Servo SG90.
Cho phép kiểm thử toàn bộ Backend FastAPI mà không cần cắm bất kỳ phần cứng thật nào!
"""

import sys
import json
import time
import threading
import paho.mqtt.client as mqtt

# Cấu hình MQTT Broker (Có thể dùng 'localhost' hoặc broker công cộng 'broker.emqx.io' / 'test.mosquitto.org')
MQTT_HOST = "localhost"
MQTT_PORT = 1883

# Trạng thái giả lập của mô hình
slots_state = {
    1: {"color": "GREEN", "occupied": False},
    2: {"color": "GREEN", "occupied": False},
    3: {"color": "GREEN", "occupied": False},
    4: {"color": "GREEN", "occupied": False},
}
barrier_state = "CLOSED"


def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print("\n" + "="*60)
        print("✅ [MÔ PHỎNG PHẦN CỨNG] Đã kết nối MQTT Broker thành công!")
        print(f"   Đang giả lập: Kit STM32F401RE + 4 Cảm biến HC-SR04 + Đèn LED + SG90")
        print("="*60)
        # Đăng ký nhận lệnh từ Backend gửi xuống
        client.subscribe("parking/gate/barrier_cmd")
        client.subscribe("parking/slot/+/led_cmd")
    else:
        print(f"❌ Kết nối MQTT thất bại với mã lỗi rc={rc}")


def on_message(client, userdata, msg):
    global barrier_state
    topic = msg.topic
    payload = json.loads(msg.payload.decode("utf-8"))

    # 1. Lệnh điều khiển Barrier từ Backend
    if "barrier_cmd" in topic:
        action = payload.get("action", "OPEN")
        gate = payload.get("gate", "IN")
        duration = payload.get("duration_seconds", 5)
        print(f"\n📥 [NHẬN TỪ CLOUD] LỆNH ĐIỀU KHIỂN CƠ CẤU CHẤP HÀNH:")
        print(f"   ==> [SERVO SG90 - Cổng {gate}]: Quay góc 90° để {action} BARRIER 🚧")
        barrier_state = "OPEN"

        # Giả lập tự động đóng lại sau `duration` giây
        def auto_close():
            time.sleep(duration)
            print(f"\n   ==> [SERVO SG90 - Cổng {gate}]: Xe đã qua. Barrier tự động ĐÓNG LẠI ⬇️")
            barrier_state = "CLOSED"

        threading.Thread(target=auto_close, daemon=True).start()

    # 2. Lệnh đổi màu đèn LED tại Slot
    elif "led_cmd" in topic:
        slot_id = payload.get("slot_id")
        color = payload.get("color", "GREEN")
        if slot_id in slots_state:
            slots_state[slot_id]["color"] = color
        
        icons = {"GREEN": "🟢 (XANH - Trống)", "YELLOW": "🟡 (VÀNG - Đang giữ chỗ)", "RED": "🔴 (ĐỎ - Có xe)"}
        print(f"\n📥 [NHẬN TỪ CLOUD] ĐỔI MÀU ĐÈN LED:")
        print(f"   ==> Slot {slot_id}: Đèn chuyển sang {icons.get(color, color)}")


def print_dashboard():
    print("\n" + "-"*50)
    print("🚗 [TRẠNG THÁI HIỆN TẠI CỦA BÃI ĐỖ XE - PHẦN CỨNG MÔ PHỎNG]")
    for sid, data in slots_state.items():
        occ = "ĐANG ĐỖ" if data["occupied"] else "TRỐNG"
        print(f"  Slot {sid}: Đèn {data['color']:<6} | Cảm biến HC-SR04: {occ}")
    print(f"  Barrier cổng vào/ra: [{barrier_state}]")
    print("-"*50)


def main():
    try:
        try:
            client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="hardware_simulator")
        except AttributeError:
            client = mqtt.Client(client_id="hardware_simulator")

        client.on_connect = on_connect
        client.on_message = on_message

        print(f"Đang kết nối tới MQTT Broker tại {MQTT_HOST}:{MQTT_PORT}...")
        client.connect(MQTT_HOST, MQTT_PORT, 60)
        client.loop_start()
    except Exception as e:
        print(f"❌ Không thể kết nối tới MQTT Broker: {e}")
        print("💡 Gợi ý: Hãy bật Mosquitto bằng Docker hoặc đổi MQTT_HOST sang 'broker.emqx.io' trong file này.")
        sys.exit(1)

    time.sleep(1)

    menu = """
===================== BẢNG ĐIỀU KHIỂN GIẢ LẬP =====================
[1] Giả lập: Khách quẹt thẻ RFID tại cổng VÀO (gate="IN", UID="TEST_CARD_01")
[2] Giả lập: Xe đỗ vào Slot 1 (HC-SR04 phát hiện khoảng cách 15cm)
[3] Giả lập: Xe rời khỏi Slot 1 (HC-SR04 phát hiện khoảng cách 150cm)
[4] Giả lập: Khách quẹt thẻ RFID tại cổng RA (gate="OUT", UID="TEST_CARD_01")
[5] Giả lập: Xe đỗ vào Slot 2
[6] Giả lập: Xe rời khỏi Slot 2
[d] Xem trạng thái trực quan hiện tại
[q] Thoát chương trình
==================================================================
Nhập lựa chọn của bạn: """

    while True:
        try:
            choice = input(menu).strip().lower()
            if choice == "1":
                payload = json.dumps({"gate": "IN", "card_uid": "TEST_CARD_01", "timestamp": int(time.time())})
                client.publish("parking/gate/rfid_read", payload)
                print("\n📤 [STM32 ĐÃ GỬI] Quẹt thẻ RFID 'TEST_CARD_01' tại cổng VÀO.")

            elif choice == "2":
                slots_state[1]["occupied"] = True
                payload = json.dumps({"slot_id": 1, "occupied": True, "distance_cm": 15.0})
                client.publish("parking/slot/1/occupancy", payload)
                print("\n📤 [HC-SR04 ĐÃ GỬI] Xe đã đỗ vào Slot 1 (Khoảng cách 15cm).")

            elif choice == "3":
                slots_state[1]["occupied"] = False
                payload = json.dumps({"slot_id": 1, "occupied": False, "distance_cm": 150.0})
                client.publish("parking/slot/1/occupancy", payload)
                print("\n📤 [HC-SR04 ĐÃ GỬI] Xe đã rời khỏi Slot 1.")

            elif choice == "4":
                payload = json.dumps({"gate": "OUT", "card_uid": "TEST_CARD_01", "timestamp": int(time.time())})
                client.publish("parking/gate/rfid_read", payload)
                print("\n📤 [STM32 ĐÃ GỬI] Quẹt thẻ RFID 'TEST_CARD_01' tại cổng RA (Yêu cầu tính tiền).")

            elif choice == "5":
                slots_state[2]["occupied"] = True
                payload = json.dumps({"slot_id": 2, "occupied": True, "distance_cm": 18.0})
                client.publish("parking/slot/2/occupancy", payload)
                print("\n📤 [HC-SR04 ĐÃ GỬI] Xe đã đỗ vào Slot 2.")

            elif choice == "6":
                slots_state[2]["occupied"] = False
                payload = json.dumps({"slot_id": 2, "occupied": False, "distance_cm": 160.0})
                client.publish("parking/slot/2/occupancy", payload)
                print("\n📤 [HC-SR04 ĐÃ GỬI] Xe đã rời khỏi Slot 2.")

            elif choice == "d":
                print_dashboard()

            elif choice == "q":
                print("Đang thoát...")
                client.loop_stop()
                client.disconnect()
                break
        except KeyboardInterrupt:
            break


if __name__ == "__main__":
    main()

