from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.models import ParkingSession
from app.schemas.schemas import (GateRfidEvent, BarrierControlRequest, PaymentConfirmRequest,
                                 ParkingSessionResponse, CardCreate, WalkInCreate, ExitConfirmRequest)
from app.services.gate_service import (process_rfid_swipe, register_card, assign_walk_in,
                                      confirm_payment, confirm_exit)
from app.services.mqtt_service import mqtt_service
from app.api.websocket import ws_manager

router = APIRouter(prefix="/gate", tags=["Gate & Barrier - Cổng kiểm soát"])


@router.post("/cards", status_code=201)
async def create_card(payload: CardCreate):
    return await register_card(payload.card_uid)


@router.post("/walk-ins", status_code=201)
async def create_walk_in(payload: WalkInCreate):
    """Cấp thẻ vãng lai và giữ slot trước khi xe quẹt IN."""
    return await assign_walk_in(payload.card_uid, payload.slot_id)


@router.post("/rfid-swipe")
async def trigger_rfid_swipe(payload: GateRfidEvent):
    return await process_rfid_swipe(payload.gate, payload.card_uid)


@router.post("/barrier/override")
async def override_barrier(payload: BarrierControlRequest):
    sent = mqtt_service.publish_barrier_command(payload.gate, payload.action, payload.duration_seconds)
    await ws_manager.broadcast("BARRIER_OVERRIDE", {"gate": payload.gate, "action": payload.action,
                                                    "command_sent": sent})
    return {"success": True, "action": payload.action, "gate": payload.gate, "command_sent": sent}


@router.post("/payment/confirm")
async def confirm_payment_and_open_barrier(payload: PaymentConfirmRequest):
    return await confirm_payment(payload.session_id, payload.guard_note)


@router.post("/exit/confirm")
async def confirm_vehicle_passage(payload: ExitConfirmRequest):
    """Thiết bị/bảo vệ xác nhận xe đã qua cổng ra, hoàn trả thẻ và sức chứa."""
    return await confirm_exit(payload.session_id)


@router.get("/sessions", response_model=list[ParkingSessionResponse])
async def get_parking_sessions(limit: int = Query(50, ge=1, le=200), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ParkingSession).order_by(ParkingSession.id.desc()).limit(limit))
    return result.scalars().all()
