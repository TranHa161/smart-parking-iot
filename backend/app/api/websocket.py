from fastapi import WebSocket
from typing import Any
import json
import logging

logger = logging.getLogger("websocket")

# Sự kiện được phát cho mọi trình duyệt (trang khách). Dữ liệu được lọc bỏ trường nhạy cảm.
PUBLIC_EVENTS = {
    "SLOT_UPDATED", "BOOKING_EXPIRED", "BOOKING_CANCELLED", "BOOKING_VERIFIED",
    "ENTRY_EXPIRED", "VEHICLE_EXITED", "GATE_EVENT", "RFID_SCANNED",
}
SENSITIVE_KEYS = {"phone_number", "total_fee", "reason", "actor_id", "license_plate"}


def _public_view(data: Any) -> Any:
    if isinstance(data, dict):
        return {k: v for k, v in data.items() if k not in SENSITIVE_KEYS}
    return data


class ConnectionManager:
    """Hai nhóm kết nối: public (/ws/parking) và staff (/ws/staff, đã xác thực guard/admin)."""

    def __init__(self):
        self.public: list[WebSocket] = []
        self.staff: list[WebSocket] = []

    @property
    def active_connections(self) -> list[WebSocket]:
        return self.public + self.staff

    async def connect(self, websocket: WebSocket, staff: bool = False):
        await websocket.accept()
        (self.staff if staff else self.public).append(websocket)
        logger.info("WebSocket %s connected. public=%d staff=%d",
                    "staff" if staff else "public", len(self.public), len(self.staff))

    def disconnect(self, websocket: WebSocket):
        for group in (self.public, self.staff):
            if websocket in group:
                group.remove(websocket)

    async def _send(self, group: list[WebSocket], message: str):
        for connection in list(group):
            try:
                await connection.send_text(message)
            except Exception as e:
                logger.error(f"Lỗi khi gửi WebSocket message: {e}")
                self.disconnect(connection)

    async def broadcast(self, event_type: str, data: Any):
        await self._send(self.staff, json.dumps({"event": event_type, "data": data}, default=str))
        if event_type in PUBLIC_EVENTS:
            await self._send(self.public, json.dumps({"event": event_type, "data": _public_view(data)},
                                                     default=str))


ws_manager = ConnectionManager()
