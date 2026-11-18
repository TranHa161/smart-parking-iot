import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.core.config import settings
from app.core.database import engine, AsyncSessionLocal
from app.core.security import hash_password, is_staff, user_from_token
from app.models.models import Slot, SlotStatus, User, UserRole
from app.services.mqtt_service import mqtt_service
from app.services.scheduler import start_booking_expiration_scheduler
from app.api.websocket import ws_manager
from app.api import routes_slots, routes_booking, routes_gate, routes_auth, routes_reports

# Cấu hình logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("main")


async def init_default_data():
    """Khởi tạo các slot đỗ xe (mặc định 3 slot khớp STM32) và tài khoản khởi tạo nếu chưa có."""
    async with AsyncSessionLocal() as session:
        stmt = select(Slot)
        res = await session.execute(stmt)
        slots = res.scalars().all()
        if not slots:
            count = settings.SLOT_COUNT
            logger.info("Chưa có slot đỗ nào. Đang khởi tạo %d slot mặc định...", count)
            demo_slots = [
                Slot(
                    code=f"Slot {i}",
                    sensor_id=f"HCSR04_{i:02d}",
                    status=SlotStatus.AVAILABLE,
                )
                for i in range(1, count + 1)
            ]
            session.add_all(demo_slots)
            await session.commit()
            logger.info("Đã khởi tạo thành công %d slot.", count)

        admin_pwd = settings.SEED_ADMIN_PASSWORD or "123456"
        default_accounts = [
            (
                "Quản trị viên hệ thống",
                settings.SEED_ADMIN_EMAIL.strip().lower(),
                "0988888888",
                admin_pwd,
                UserRole.ADMIN.value,
            ),
        ]
        if settings.SEED_DEMO_USERS:
            default_accounts.extend(
                [
                    ("Bảo vệ trực cổng", "guard@parking.com", "0911111111", "123456", UserRole.GUARD.value),
                    ("Khách hàng", "user@parking.com", "0900000000", "123456", UserRole.USER.value),
                ]
            )

        added_users = False
        for name, email, phone, pwd, role in default_accounts:
            exists = await session.scalar(select(User).where(User.email == email))
            if not exists:
                session.add(
                    User(
                        name=name,
                        email=email,
                        phone=phone,
                        password_hash=hash_password(pwd),
                        role=role,
                        is_active=True,
                    )
                )
                added_users = True
            elif exists.role != role and role in {UserRole.ADMIN.value, UserRole.GUARD.value}:
                exists.role = role
                added_users = True
        if added_users:
            await session.commit()
            logger.info("Đã khởi tạo tài khoản mặc định trong DB.")


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
app.include_router(routes_auth.router, prefix=settings.API_V1_STR)
app.include_router(routes_slots.router, prefix=settings.API_V1_STR)
app.include_router(routes_booking.router, prefix=settings.API_V1_STR)
app.include_router(routes_gate.router, prefix=settings.API_V1_STR)
app.include_router(routes_reports.router, prefix=settings.API_V1_STR)


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
    """Kênh WebSocket công khai cập nhật trạng thái slot thời gian thực (đã lọc dữ liệu nhạy cảm)."""
    await ws_manager.connect(websocket, staff=False)
    try:
        while True:
            data = await websocket.receive_text()
            logger.info(f"WebSocket public nhận từ client: {data}")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)


@app.websocket("/ws/staff")
async def staff_websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(default=""),
):
    """Kênh WebSocket nội bộ cho Bảo vệ & Admin (nhận đủ sự kiện quẹt thẻ, thu phí, override)."""
    if not token:
        await websocket.accept()
        await websocket.close(code=1008)
        return
    async with AsyncSessionLocal() as db:
        try:
            user = await user_from_token(db, token)
        except HTTPException:
            await websocket.accept()
            await websocket.close(code=1008)
            return
        if not is_staff(user):
            await websocket.accept()
            await websocket.close(code=1008)
            return

    await ws_manager.connect(websocket, staff=True)
    try:
        while True:
            data = await websocket.receive_text()
            logger.info(f"WebSocket staff nhận từ client ({user.email}): {data}")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
