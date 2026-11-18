import glob
import json
import logging
import asyncio
import os
import re
import select
import threading
from typing import Optional
import paho.mqtt.client as mqtt
from app.core.config import settings

logger = logging.getLogger("mqtt")

_SLOTS_RE = re.compile(r"SLOTS:([0-2](?:\s*,\s*[0-2])+)")
_RFID_RE = re.compile(r"(?:RFID:|UID:\s*)([0-9A-Fa-f]{4,32})")
_SENSOR_CM_RE = re.compile(r"\[SENSOR\]\s*Xac nhan Slot\s*(\d+):.*?\(Khoang cach:\s*(\d+)\s*cm\)")


class MQTTService:
    def __init__(self):
        self.client: Optional[mqtt.Client] = None
        self.is_connected = False
        self.gateway_online = False
        self.gateway_last_seen = None
        self.last_scanned_uid: Optional[str] = None
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self._serial_stop = False
        self._serial_thread: Optional[threading.Thread] = None
        self._serial_fds: dict[str, int] = {}
        self._serial_lock = threading.Lock()

    def set_event_loop(self, loop: asyncio.AbstractEventLoop):
        self.loop = loop

    def connect(self):
        try:
            # Hỗ trợ cả Paho MQTT v1 và v2
            try:
                self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
            except AttributeError:
                self.client = mqtt.Client()

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
        self._start_usb_serial_bridge()

    def disconnect(self):
        self._serial_stop = True
        with self._serial_lock:
            for port, fd in list(self._serial_fds.items()):
                try:
                    os.close(fd)
                except OSError:
                    pass
            self._serial_fds.clear()
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
            logger.info("Đã ngắt kết nối MQTT Broker.")

    def _start_usb_serial_bridge(self):
        """Tự động đọc/ghi trực tiếp cổng USB Serial của ESP32/STM32 nếu cắm vào máy tính."""
        if self._serial_thread and self._serial_thread.is_alive():
            return
        self._serial_stop = False
        self._serial_thread = threading.Thread(target=self._usb_serial_loop, daemon=True)
        self._serial_thread.start()

    @staticmethod
    def _discover_serial_ports() -> list[str]:
        patterns = (
            "/dev/cu.usbserial*",
            "/dev/cu.wchusbserial*",
            "/dev/cu.SLAB_USBtoUART*",
            "/dev/cu.usbmodem*",
            "/dev/ttyUSB*",
            "/dev/ttyACM*",
        )
        found: list[str] = []
        for pat in patterns:
            found.extend(glob.glob(pat))
        return sorted(set(found))

    @staticmethod
    def _open_serial_115200(port: str) -> Optional[int]:
        try:
            import termios
            fd = os.open(port, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
            attrs = termios.tcgetattr(fd)
            attrs[0] = 0
            attrs[1] = 0
            attrs[2] = termios.CS8 | termios.CREAD | termios.CLOCAL
            attrs[3] = 0
            attrs[4] = termios.B115200
            attrs[5] = termios.B115200
            termios.tcsetattr(fd, termios.TCSANOW, attrs)
            return fd
        except Exception:
            return None

    def _usb_serial_loop(self):
        buffers: dict[str, str] = {}
        last_scan = 0.0
        import time

        while not self._serial_stop:
            now = time.monotonic()
            if now - last_scan >= 2.5:
                last_scan = now
                for port in self._discover_serial_ports():
                    with self._serial_lock:
                        already = port in self._serial_fds
                    if not already:
                        fd = self._open_serial_115200(port)
                        if fd is not None:
                            with self._serial_lock:
                                self._serial_fds[port] = fd
                            buffers[port] = ""
                            logger.info("🔌 [USB Serial] Đã kết nối trực tiếp mạch phần cứng tại %s (115200)", port)
                            if self.loop:
                                asyncio.run_coroutine_threadsafe(
                                    self._handle_gateway_text("parking/gate/status", "online"),
                                    self.loop,
                                )

            with self._serial_lock:
                items = list(self._serial_fds.items())

            if not items:
                time.sleep(1.5)
                continue

            fds = [fd for _, fd in items]
            fd_to_port = {fd: port for port, fd in items}
            try:
                readable, _, _ = select.select(fds, [], [], 0.3)
            except Exception:
                time.sleep(0.5)
                continue

            for fd in readable:
                port = fd_to_port.get(fd, "")
                try:
                    chunk = os.read(fd, 512)
                    if not chunk:
                        raise OSError("EOF")
                except BlockingIOError:
                    continue
                except OSError:
                    logger.warning("🔌 [USB Serial] Mất kết nối cổng %s", port)
                    with self._serial_lock:
                        self._serial_fds.pop(port, None)
                    buffers.pop(port, None)
                    try:
                        os.close(fd)
                    except OSError:
                        pass
                    continue

                buf = buffers.get(port, "") + chunk.decode("utf-8", errors="ignore")
                while "\n" in buf or "\r" in buf:
                    sep_idx = min(
                        [i for i in (buf.find("\n"), buf.find("\r")) if i != -1]
                    )
                    line = buf[:sep_idx].strip()
                    buf = buf[sep_idx + 1 :]
                    if line:
                        self._process_serial_line(line)
                buffers[port] = buf[-256:]

    def _process_serial_line(self, line: str):
        if not self.loop:
            return
        # Bỏ qua các dòng echo hướng xuống từ máy tính hoặc server
        if line.startswith("[DOWN]") or line.startswith("[PC -> STM32]") or line.startswith("[RX <- ESP32]"):
            return

        m_slots = _SLOTS_RE.search(line)
        if m_slots:
            cmd = f"SLOTS:{m_slots.group(1).replace(' ', '')}"
            fut = asyncio.run_coroutine_threadsafe(
                self._handle_gateway_text("parking/gate/up", cmd), self.loop
            )
            fut.add_done_callback(self._report_result)
            return

        m_rfid = _RFID_RE.search(line)
        if m_rfid and ("RFID:" in line or "[RFID]" in line):
            cmd = f"RFID:{m_rfid.group(1).upper()}"
            logger.info("🔌 [USB Serial] Nhận quẹt thẻ từ mạch: %s", cmd)
            fut = asyncio.run_coroutine_threadsafe(
                self._handle_gateway_text("parking/gate/up", cmd), self.loop
            )
            fut.add_done_callback(self._report_result)
            return

        m_cm = _SENSOR_CM_RE.search(line)
        if m_cm:
            slot_idx = int(m_cm.group(1))
            cm_val = float(m_cm.group(2))
            fut = asyncio.run_coroutine_threadsafe(
                self._update_slot_distance_only(slot_idx, cm_val), self.loop
            )
            fut.add_done_callback(self._report_result)
            return

        if line == "BOOT" or line.endswith(" BOOT"):
            fut = asyncio.run_coroutine_threadsafe(
                self._handle_gateway_text("parking/gate/up", "BOOT"), self.loop
            )
            fut.add_done_callback(self._report_result)

    async def _update_slot_distance_only(self, slot_idx: int, cm_val: float):
        from sqlalchemy import select
        from app.services.parking_state import state_transaction, dispatch
        from app.models.models import Slot

        events = []
        async with state_transaction() as db:
            ordered = (await db.scalars(select(Slot).order_by(Slot.id))).all()
            if 1 <= slot_idx <= len(ordered):
                slot = ordered[slot_idx - 1]
                slot.distance_cm = cm_val
                events.append(
                    (
                        "SLOT_UPDATED",
                        {
                            "id": slot.id,
                            "code": slot.code,
                            "status": slot.status.value,
                            "distance_cm": slot.distance_cm,
                        },
                    )
                )
        await dispatch(events)

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
        from app.core.time import utc_now
        from app.api.websocket import ws_manager

        if topic == "parking/gate/status":
            logger.info("Trạng thái ESP32 Gateway: %s", line)
            online = line.strip().lower() == "online"
            self.gateway_online = online
            self.gateway_last_seen = utc_now()
            await ws_manager.broadcast(
                "GATEWAY_STATUS",
                {"online": self.gateway_online, "last_seen": self.gateway_last_seen.isoformat()},
            )
            if online:
                await self._sync_reserved_slots_to_gateway()
            return

        self.gateway_online = True
        self.gateway_last_seen = utc_now()

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
        reserved_indices = []
        async with state_transaction() as db:
            await expire_holds(db, events)
            slots = (await db.scalars(select(Slot).order_by(Slot.id))).all()
            for idx, slot in enumerate(slots, start=1):
                if slot.status == SlotStatus.RESERVED and not slot.physical_occupied:
                    reserved_indices.append(idx)
        await dispatch(events)
        for idx in reserved_indices:
            self.publish_gateway_down(f"RESERVE:{idx}")

    async def _handle_gateway_slots(self, raw_values: str):
        """Cập nhật trạng thái cảm biến từ bản tin SLOTS:s1,s2,s3 (0=AVAILABLE, 1=RESERVED, 2=OCCUPIED)."""
        from sqlalchemy import select
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
            ordered_slots = (await db.scalars(select(Slot).order_by(Slot.id))).all()
            by_code = {s.code.lower(): s for s in ordered_slots if s.code}
            by_sensor = {s.sensor_id.upper(): s for s in ordered_slots if s.sensor_id}
            for idx, code in enumerate(codes, start=1):
                slot = (
                    by_sensor.get(f"HCSR04_{idx:02d}")
                    or by_code.get(f"slot {idx}")
                    or by_code.get(f"a{idx}")
                    or (ordered_slots[idx - 1] if idx <= len(ordered_slots) else None)
                )
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
                        fixup_commands.append(f"RESERVE:{idx}")
                    elif slot.status == SlotStatus.AVAILABLE and code == 1:
                        fixup_commands.append(f"CANCEL:{idx}")
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

        self.last_scanned_uid = card_uid
        await ws_manager.broadcast("RFID_SCANNED", {"card_uid": card_uid})

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
        """Gửi dòng lệnh text xuống ESP32/STM32 qua cả MQTT (parking/gate/down) và USB Serial."""
        topic = "parking/gate/down"
        sent = False
        if self.client and self.is_connected:
            info = self.client.publish(topic, command, qos=1)
            logger.info("Đã phát MQTT tới [%s]: %s", topic, command)
            sent = info.rc == mqtt.MQTT_ERR_SUCCESS

        with self._serial_lock:
            serial_items = list(self._serial_fds.items())
        for port, fd in serial_items:
            try:
                os.write(fd, f"{command}\n".encode("utf-8"))
                logger.info("🔌 [USB Serial -> %s]: %s", port, command)
                sent = True
            except OSError:
                pass

        if not sent:
            logger.info("[Offline Mode] Lệnh xuống Gateway [%s]: %s", topic, command)
        return sent

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

