import json
import logging
import asyncio
from typing import Optional
import paho.mqtt.client as mqtt
from app.core.config import settings

logger = logging.getLogger("mqtt")


class MQTTService:
    def __init__(self):
        self.client: Optional[mqtt.Client] = None
        self.is_connected = False
        self.loop: Optional[asyncio.AbstractEventLoop] = None

    def set_event_loop(self, loop: asyncio.AbstractEventLoop):
        self.loop = loop

    def connect(self):
        try:
            # Hỗ trợ cả Paho MQTT v1 và v2
            try:
                self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="fastapi_backend")
            except AttributeError:
                self.client = mqtt.Client(client_id="fastapi_backend")

            if settings.MQTT_USERNAME:
                self.client.username_pw_set(settings.MQTT_USERNAME, settings.MQTT_PASSWORD)

            self.client.on_connect = self._on_connect
            self.client.on_disconnect = self._on_disconnect
            self.client.on_message = self._on_message

            logger.info(f"Đang kết nối tới MQTT Broker tại {settings.MQTT_BROKER_HOST}:{settings.MQTT_BROKER_PORT}...")
            self.client.connect_async(
                settings.MQTT_BROKER_HOST,
                settings.MQTT_BROKER_PORT,
                settings.MQTT_KEEP_ALIVE
            )
            self.client.loop_start()
        except Exception as e:
            logger.warning(f"Không thể kết nối MQTT Broker lúc này: {e}. Hệ thống vẫn chạy ở chế độ offline/giả lập.")

    def disconnect(self):
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
            logger.info("Đã ngắt kết nối MQTT Broker.")

    def _on_connect(self, client, userdata, flags, rc, properties=None):
        if rc == 0:
            self.is_connected = True
            logger.info("✅ Đã kết nối thành công tới MQTT Broker!")
            # Lắng nghe các topic từ STM32/ESP
            client.subscribe("parking/slot/+/occupancy")
            client.subscribe("parking/gate/rfid_read")
        else:
            logger.error(f"Kết nối MQTT Broker thất bại, mã lỗi rc={rc}")

    def _on_disconnect(self, client, userdata, disconnect_flags, reason_code, properties=None):
        self.is_connected = False
        logger.warning(f"Bị mất kết nối với MQTT Broker (reason={reason_code})")

    def _on_message(self, client, userdata, msg):
        if not self.loop:
            return
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("Payload must be an object")
            if msg.topic.startswith("parking/slot/") and msg.topic.endswith("/occupancy"):
                coroutine = self._handle_occupancy(msg.topic, payload)
            elif msg.topic == "parking/gate/rfid_read":
                coroutine = self._handle_rfid(payload)
            else:
                return
            future = asyncio.run_coroutine_threadsafe(coroutine, self.loop)
            future.add_done_callback(self._report_result)
        except (UnicodeDecodeError, ValueError):
            logger.warning("MQTT payload không hợp lệ trên topic %s", msg.topic)

    @staticmethod
    def _report_result(future):
        try:
            future.result()
        except Exception:
            logger.exception("Không thể xử lý sự kiện MQTT")

    async def _handle_occupancy(self, topic: str, payload: dict):
        from app.schemas.schemas import OccupancyEvent
        from app.services.parking_state import state_transaction, sync_slot, dispatch
        from app.models.models import Slot

        event = OccupancyEvent.model_validate(payload)
        slot_id = int(topic.split("/")[2])
        if event.slot_id is not None and event.slot_id != slot_id:
            raise ValueError("slot_id does not match topic")
        events = []
        async with state_transaction() as db:
            slot = await db.get(Slot, slot_id)
            if not slot:
                raise ValueError("Unknown slot")
            slot.physical_occupied = event.occupied
            slot.distance_cm = event.distance_cm
            await sync_slot(db, slot, events)
        await dispatch(events)

    async def _handle_rfid(self, payload: dict):
        from app.schemas.schemas import GateRfidEvent
        from app.services.gate_service import process_rfid_swipe
        event = GateRfidEvent.model_validate(payload)
        await process_rfid_swipe(event.gate, event.card_uid)

    def publish_barrier_command(self, gate: str = "IN", action: str = "OPEN", duration_seconds: int = 5):
        """Gửi lệnh mở/đóng động cơ Servo Barrier"""
        topic = "parking/gate/barrier_cmd"
        payload = json.dumps({
            "gate": gate,
            "action": action,
            "duration_seconds": duration_seconds
        })
        if self.client and self.is_connected:
            info = self.client.publish(topic, payload, qos=1)
            logger.info(f"Đã phát MQTT tới [{topic}]: {payload}")
            return info.rc == mqtt.MQTT_ERR_SUCCESS
        else:
            logger.info(f"[Offline Mode] Lệnh Barrier được tạo: {payload}")
            return False

    def publish_led_command(self, slot_id: int, color: str):
        """Gửi lệnh đổi màu đèn LED slot (GREEN, YELLOW, RED)"""
        topic = f"parking/slot/{slot_id}/led_cmd"
        payload = json.dumps({
            "slot_id": slot_id,
            "color": color
        })
        if self.client and self.is_connected:
            info = self.client.publish(topic, payload, qos=1)
            logger.info(f"Đã phát MQTT tới [{topic}]: {payload}")
            return info.rc == mqtt.MQTT_ERR_SUCCESS
        else:
            logger.info(f"[Offline Mode] Lệnh đổi đèn LED slot {slot_id} sang {color}")


mqtt_service = MQTTService()

