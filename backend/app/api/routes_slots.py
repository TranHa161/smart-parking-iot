from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from app.models.models import Slot, SlotStatus
from app.schemas.schemas import SlotResponse, SlotCreate
from app.services.parking_state import state_transaction, expire_holds, sync_slot, dispatch

router = APIRouter(prefix="/slots", tags=["Slots - Vị trí đỗ xe"])


@router.get("", response_model=list[SlotResponse])
async def get_all_slots():
    events = []
    async with state_transaction() as db:
        await expire_holds(db, events)
        slots = (await db.scalars(select(Slot).order_by(Slot.id))).all()
    await dispatch(events)
    return slots


@router.post("", response_model=SlotResponse)
async def create_slot(slot_in: SlotCreate):
    try:
        async with state_transaction() as db:
            slot = Slot(code=slot_in.code, sensor_id=slot_in.sensor_id)
            db.add(slot)
            await db.flush()
    except IntegrityError:
        raise HTTPException(409, "Mã slot đã tồn tại")
    return slot


@router.put("/{slot_id}/override")
async def override_slot_status(slot_id: int, new_status: SlotStatus):
    events = []
    async with state_transaction() as db:
        slot = await db.get(Slot, slot_id)
        if not slot:
            raise HTTPException(404, "Không tìm thấy slot")
        slot.physical_occupied = new_status == SlotStatus.OCCUPIED
        await sync_slot(db, slot, events)
        if slot.status != new_status:
            raise HTTPException(409, "Trạng thái không phù hợp với quyền giữ chỗ/lượt đỗ; không thể ghi đè")
    await dispatch(events)
    return {"id": slot.id, "status": slot.status.value}
