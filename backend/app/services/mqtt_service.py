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
            # 1. Topic JSON (Simulator / API chuẩn)
            client.subscribe("parking/slot/+/occupancy")
            client.subscribe("parking/gate/rfid_read")
            # 2. Topic Text (Cầu nối UART <-> MQTT của ESP32 + STM32F401RE)
            client.subscribe("parking/gate/up")
            client.subscribe("parking/gate/status")
        else:
            logger.error(f"Kết nối MQTT Broker thất bại, mã lỗi rc={rc}")

    def _on_disconnect(self, client, userdata, disconnect_flags, reason_code, properties=None):
        self.is_connected = False
        logger.warning(f"Bị mất kết nối với MQTT Broker (reason={reason_code})")

    def _on_message(self, client, userdata, msg):
        if not self.loop:
            return
        try:
            text = msg.payload.decode("utf-8").strip()
            if msg.topic in ("parking/gate/up", "parking/gate/status"):
                if not text:
                    return
                coroutine = self._handle_gateway_text(msg.topic, text)
            else:
                payload = json.loads(text)
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

    async def _handle_gateway_text(self, topic: str, line: str):
        """Xử lý giao thức dòng lệnh từ ESP32 Gateway (parking/gate/up, parking/gate/status)."""
        if topic == "parking/gate/status":
            logger.info("Trạng thái ESP32 Gateway: %s", line)
            if line.lower() == "online":
                await self._sync_reserved_slots_to_gateway()
            return

        if line == "BOOT":
            logger.info("STM32 khởi động (BOOT) -> đồng bộ trạng thái giữ chỗ xuống mạch")
            await self._sync_reserved_slots_to_gateway()
        elif line.startswith("SLOTS:"):
            await self._handle_gateway_slots(line[6:])
        elif line.startswith("RFID:"):
            await self._handle_gateway_rfid(line[5:])
        else:
            logger.warning("Bỏ qua dòng lệnh không xác định trên %s: %s", topic, line)

    async def _sync_reserved_slots_to_gateway(self):
        from sqlalchemy import select
        from app.services.parking_state import state_transaction, expire_holds, dispatch
        from app.models.models import Slot, SlotStatus

        events = []
        reserved_ids = []
        async with state_transaction() as db:
            await expire_holds(db, events)
            slots = (await db.scalars(select(Slot).order_by(Slot.id))).all()
            for slot in slots:
                if slot.status == SlotStatus.RESERVED and not slot.physical_occupied:
                    reserved_ids.append(slot.id)
        await dispatch(events)
        for sid in reserved_ids:
            self.publish_gateway_down(f"RESERVE:{sid}")

    async def _handle_gateway_slots(self, raw_values: str):
        """Cập nhật trạng thái cảm biến từ bản tin SLOTS:s1,s2,s3 (0=AVAILABLE, 1=RESERVED, 2=OCCUPIED)."""
        from app.services.parking_state import state_transaction, expire_holds, sync_slot, dispatch
        from app.models.models import Slot, SlotStatus

        parts = [p.strip() for p in raw_values.split(",") if p.strip()]
        if not parts:
            raise ValueError("Empty SLOTS payload")
        codes = [int(p) for p in parts]
        if any(c not in (0, 1, 2) for c in codes):
            raise ValueError("SLOTS status code must be 0, 1, or 2")

        events = []
        fixup_commands = []
        async with state_transaction() as db:
            await expire_holds(db, events)
            for idx, code in enumerate(codes, start=1):
                slot = await db.get(Slot, idx)
                if not slot:
                    continue
                occupied = (code == 2)
                if slot.physical_occupied != occupied:
                    slot.physical_occupied = occupied
                    slot.distance_cm = 10.0 if occupied else 100.0
                    await sync_slot(db, slot, events)
                elif not occupied:
                    # Đồng bộ lại cờ giữ chỗ trên STM32 nếu lệch với DB
                    if slot.status == SlotStatus.RESERVED and code == 0:
                        fixup_commands.append(f"RESERVE:{slot.id}")
                    elif slot.status == SlotStatus.AVAILABLE and code == 1:
                        fixup_commands.append(f"CANCEL:{slot.id}")
        await dispatch(events)
        for cmd in fixup_commands:
            self.publish_gateway_down(cmd)

    async def _handle_gateway_rfid(self, raw_uid: str):
        """Xử lý bản tin RFID:<UID> từ 1 đầu đọc RC522 trên STM32, tự suy luận IN/OUT theo trạng thái phiên."""
        from fastapi import HTTPException
        from sqlalchemy import select
        from app.services import parking_state
        from app.models.models import ParkingSession, SessionStatus
        from app.services.gate_service import process_rfid_swipe
        from app.api.websocket import ws_manager

        card_uid = raw_uid.strip().upper()
        if not card_uid:
            raise ValueError("Empty RFID UID")

        async with parking_state.AsyncSessionLocal() as db:
            active_session = await db.scalar(
                select(ParkingSession).where(
                    ParkingSession.card_uid == card_uid,
                    ParkingSession.time_out.is_(None),
                )
            )
            if active_session and active_session.status in {
                SessionStatus.PARKING,
                SessionStatus.PAYMENT_PENDING,
            }:
                gate = "OUT"
            else:
                gate = "IN"

        try:
            result = await process_rfid_swipe(gate, card_uid)
        except HTTPException as exc:
            logger.warning("Từ chối thẻ %s tại cổng %s: %s", card_uid, gate, exc.detail)
            self.publish_gateway_down("DENY")
            await ws_manager.broadcast(
                "GATE_DENIED",
                {"card_uid": card_uid, "gate": gate, "reason": exc.detail},
            )
            return

        if gate == "OUT" and result.get("total_fee") is not None:
            self.publish_gateway_down(f"FEE:{result['total_fee']}")

    def publish_gateway_down(self, command: str) -> bool:
        """Gửi dòng lệnh text xuống ESP32/STM32 qua topic parking/gate/down."""
        topic = "parking/gate/down"
        if self.client and self.is_connected:
            info = self.client.publish(topic, command, qos=1)
            logger.info("Đã phát MQTT tới [%s]: %s", topic, command)
            return info.rc == mqtt.MQTT_ERR_SUCCESS
        logger.info("[Offline Mode] Lệnh xuống Gateway [%s]: %s", topic, command)
        return False

    def publish_barrier_command(self, gate: str = "IN", action: str = "OPEN", duration_seconds: int = 5):
        """Gửi lệnh mở/đóng động cơ Servo Barrier (hỗ trợ cả JSON Simulator và Text Gateway)"""
        topic = "parking/gate/barrier_cmd"
        payload = json.dumps({
            "gate": gate,
            "action": action,
            "duration_seconds": duration_seconds
        })
        if action == "OPEN":
            self.publish_gateway_down("OPEN_GATE")
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
        if color == "YELLOW":
            self.publish_gateway_down(f"RESERVE:{slot_id}")
        elif color == "GREEN":
            self.publish_gateway_down(f"CANCEL:{slot_id}")
        if self.client and self.is_connected:
            info = self.client.publish(topic, payload, qos=1)
            logger.info(f"Đã phát MQTT tới [{topic}]: {payload}")
            return info.rc == mqtt.MQTT_ERR_SUCCESS
        else:
            logger.info(f"[Offline Mode] Lệnh đổi đèn LED slot {slot_id} sang {color}")


mqtt_service = MQTTService()

