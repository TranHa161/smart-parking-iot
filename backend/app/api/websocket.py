from fastapi import WebSocket
from typing import List, Dict, Any
import json
import logging

logger = logging.getLogger("websocket")


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket client connected. Total clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket client disconnected. Remaining: {len(self.active_connections)}")

    async def broadcast(self, event_type: str, data: Any):
        """Bắn sự kiện real-time tới tất cả Web Khách và Web Bảo vệ đang kết nối"""
        message = json.dumps({
            "event": event_type,
            "data": data
        })
        for connection in list(self.active_connections):
            try:
                await connection.send_text(message)
            except Exception as e:
                logger.error(f"Lỗi khi gửi WebSocket message: {e}")
                self.disconnect(connection)


ws_manager = ConnectionManager()

