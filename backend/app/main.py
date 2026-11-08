import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.core.config import settings
from app.core.database import engine, AsyncSessionLocal
from app.models.models import Slot, SlotStatus
from app.services.mqtt_service import mqtt_service
from app.services.scheduler import start_booking_expiration_scheduler
from app.api.websocket import ws_manager
from app.api import routes_slots, routes_booking, routes_gate

# Cấu hình logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("main")


async def init_default_data():
    """Khởi tạo 4 slot đỗ xe mặc định cho mô hình demo nếu CSDL còn trống"""
    async with AsyncSessionLocal() as session:
        stmt = select(Slot)
        res = await session.execute(stmt)
        slots = res.scalars().all()
        if not slots:
            logger.info("Chưa có slot đỗ nào. Đang khởi tạo 4 slot demo mặc định...")
            demo_slots = [
                Slot(code="Slot 1", sensor_id="HCSR04_01", status=SlotStatus.AVAILABLE),
                Slot(code="Slot 2", sensor_id="HCSR04_02", status=SlotStatus.AVAILABLE),
                Slot(code="Slot 3", sensor_id="HCSR04_03", status=SlotStatus.AVAILABLE),
                Slot(code="Slot 4", sensor_id="HCSR04_04", status=SlotStatus.AVAILABLE),
            ]
            session.add_all(demo_slots)
            await session.commit()
            logger.info("Đã khởi tạo thành công 4 slot: Slot 1, Slot 2, Slot 3, Slot 4.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- KHỞI ĐỘNG (STARTUP) ---
    logger.info("Đang khởi động Smart Parking IoT Backend...")
    
    # Apply schema changes explicitly with alembic before starting the app.
    from app.models.models import ParkingControl
    async with AsyncSessionLocal() as db:
        if not await db.get(ParkingControl, 1):
            raise RuntimeError("Run alembic upgrade head before starting the backend")

    # 2. Khởi tạo dữ liệu mẫu
    await init_default_data()

    # 3. Kết nối MQTT Broker
    loop = asyncio.get_running_loop()
    mqtt_service.set_event_loop(loop)
    mqtt_service.connect()

    # 4. Chạy Scheduler kiểm tra hủy lượt đặt sau 15 phút
    scheduler_task = asyncio.create_task(start_booking_expiration_scheduler(interval_seconds=5))

    try:
        yield
    finally:
        scheduler_task.cancel()
        with suppress(asyncio.CancelledError):
            await scheduler_task
        mqtt_service.disconnect()
        await engine.dispose()


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Hệ thống Bãi đỗ xe thông minh IoT - Đề tài môn IT4210 (ĐH Bách Khoa Hà Nội)",
    version="1.0.0",
    lifespan=lifespan
)

# Cấu hình CORS cho phép Web kết nối
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Đăng ký các API Routers
app.include_router(routes_slots.router, prefix=settings.API_V1_STR)
app.include_router(routes_booking.router, prefix=settings.API_V1_STR)
app.include_router(routes_gate.router, prefix=settings.API_V1_STR)


@app.get("/", tags=["Root"])
async def root():
    return {
        "project": settings.PROJECT_NAME,
        "status": "Running",
        "docs_url": "/docs",
        "mqtt_broker": f"{settings.MQTT_BROKER_HOST}:{settings.MQTT_BROKER_PORT}",
        "booking_timeout_minutes": settings.BOOKING_EXPIRATION_MINUTES
    }


@app.get("/api/health", tags=["Root"])
async def health_check():
    return {"status": "healthy"}


@app.websocket("/ws/parking")
async def websocket_endpoint(websocket: WebSocket):
    """Kênh WebSocket cập nhật thời gian thực cho Web Khách và Web Bảo vệ"""
    await ws_manager.connect(websocket)
    try:
        while True:
            # Lắng nghe ping/pong hoặc tin nhắn từ client nếu có
            data = await websocket.receive_text()
            logger.info(f"WebSocket nhận từ client: {data}")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)

