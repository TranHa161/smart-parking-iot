from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import require_staff
from app.models.models import ParkingSession, RfidCard, SessionStatus, User
from app.schemas.schemas import (
    GateRfidEvent,
    BarrierControlRequest,
    PaymentConfirmRequest,
    ParkingSessionResponse,
    CardCreate,
    WalkInCreate,
    ExitConfirmRequest,
)
from app.services.gate_service import (
    process_rfid_swipe,
    register_card,
    assign_walk_in,
    confirm_payment,
    confirm_exit,
    override_barrier as override_barrier_service,
)
from app.services.mqtt_service import mqtt_service

router = APIRouter(prefix="/gate", tags=["Gate & Barrier - Cổng kiểm soát"])


@router.get("/status")
async def get_gateway_status(_actor: User = Depends(require_staff)):
    """[Guard/Admin] Trạng thái kết nối MQTT Broker và mạch ESP32 Gateway."""
    return {
        "mqtt_connected": mqtt_service.is_connected,
        "gateway_online": mqtt_service.gateway_online,
        "gateway_last_seen": (
            mqtt_service.gateway_last_seen.isoformat()
            if mqtt_service.gateway_last_seen
            else None
        ),
    }


@router.get("/cards")
async def list_cards(
    _actor: User = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    """[Guard/Admin] Danh sách thẻ RFID trong kho."""
    cards = (await db.scalars(select(RfidCard).order_by(RfidCard.id.asc()))).all()
    return [
        {"id": c.id, "card_uid": c.card_uid, "status": c.status, "is_temporary": c.is_temporary}
        for c in cards
    ]


@router.post("/cards", status_code=201)
async def create_card(payload: CardCreate, actor: User = Depends(require_staff)):
    return await register_card(payload.card_uid, actor_id=actor.id)


@router.post("/walk-ins", status_code=201)
async def create_walk_in(payload: WalkInCreate, actor: User = Depends(require_staff)):
    """[Guard/Admin] Cấp thẻ vãng lai và giữ slot trước khi xe quẹt IN."""
    return await assign_walk_in(payload.card_uid, payload.slot_id, actor_id=actor.id)


@router.post("/rfid-swipe")
async def trigger_rfid_swipe(payload: GateRfidEvent, actor: User = Depends(require_staff)):
    """[Guard/Admin] Giả lập/kích hoạt quẹt thẻ RFID từ giao diện trạm bảo vệ."""
    return await process_rfid_swipe(
        payload.gate,
        payload.card_uid,
        actor_id=actor.id,
        source="WEB",
    )


@router.post("/barrier/override")
async def override_barrier(payload: BarrierControlRequest, actor: User = Depends(require_staff)):
    """[Guard/Admin] Mở/đóng barrier khẩn cấp — bắt buộc kèm lý do và ghi nhật ký."""
    return await override_barrier_service(
        gate=payload.gate,
        action=payload.action,
        duration_seconds=payload.duration_seconds,
        reason=payload.reason,
        actor_id=actor.id,
    )


@router.post("/payment/confirm")
async def confirm_payment_and_open_barrier(
    payload: PaymentConfirmRequest,
    actor: User = Depends(require_staff),
):
    return await confirm_payment(payload.session_id, payload.guard_note, actor_id=actor.id)


@router.post("/exit/confirm")
async def confirm_vehicle_passage(
    payload: ExitConfirmRequest,
    actor: User = Depends(require_staff),
):
    """[Guard/Admin] Xác nhận xe đã qua cổng ra, hoàn trả thẻ và sức chứa."""
    return await confirm_exit(payload.session_id, actor_id=actor.id, source="WEB")


@router.get("/sessions", response_model=list[ParkingSessionResponse])
async def get_parking_sessions(
    limit: int = Query(50, ge=1, le=200),
    status: Optional[SessionStatus] = Query(default=None),
    _actor: User = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    query = select(ParkingSession).order_by(ParkingSession.id.desc()).limit(limit)
    if status is not None:
        query = query.where(ParkingSession.status == status)
    result = await db.execute(query)
    return result.scalars().all()
