from app.core.time import utc_now
import math
from datetime import timedelta
from fastapi import HTTPException
from sqlalchemy import select
from app.core.config import settings
from app.models.models import (Booking, BookingStatus, RfidCard, ParkingSession,
                               PaymentStatus, SessionStatus, Slot)
from app.services.booking_service import claim_available_slot, get_assignable_card
from app.services.parking_state import state_transaction, expire_holds, sync_slot, dispatch
from app.services.mqtt_service import mqtt_service


async def register_card(card_uid):
    card_uid = card_uid.strip().upper()
    async with state_transaction() as db:
        existing = await db.scalar(select(RfidCard).where(RfidCard.card_uid == card_uid))
        if existing:
            raise HTTPException(409, "Thẻ đã được đăng ký")
        db.add(RfidCard(card_uid=card_uid, status="ACTIVE"))
    return {"card_uid": card_uid, "status": "ACTIVE"}


async def assign_walk_in(card_uid, slot_id=None):
    events = []
    async with state_transaction() as db:
        await expire_holds(db, events)
        card = await get_assignable_card(db, card_uid)
        slot = await claim_available_slot(db, slot_id)
        card.status = "ASSIGNED"
        parking = ParkingSession(card_uid=card.card_uid, slot_id=slot.id,
                                 authorized_until=utc_now() + timedelta(minutes=settings.ENTRY_AUTHORIZATION_MINUTES))
        db.add(parking)
        await sync_slot(db, slot, events)
        result = {"success": True, "session_id": parking.id, "slot_id": slot.id,
                  "card_uid": card.card_uid, "authorized_until": parking.authorized_until.isoformat()}
    await dispatch(events)
    return result


async def process_rfid_swipe(gate: str, card_uid: str):
    if gate not in {"IN", "OUT"}:
        raise HTTPException(422, "Cổng phải là IN hoặc OUT")
    card_uid = card_uid.strip().upper()
    events = []
    open_gate = False
    error = None
    result = None
    async with state_transaction() as db:
        await expire_holds(db, events)
        card = await db.scalar(select(RfidCard).where(RfidCard.card_uid == card_uid))
        if not card or card.status == "BLOCKED":
            error = HTTPException(403, "Thẻ chưa đăng ký hoặc bị khóa")
        else:
            parking = await db.scalar(select(ParkingSession).where(
                ParkingSession.card_uid == card_uid, ParkingSession.time_out.is_(None)))
            if not parking:
                error = HTTPException(409, "Thẻ chưa được cấp quyền vào hoặc không có lượt hoạt động")
            elif gate == "IN":
                if parking.status != SessionStatus.AUTHORIZED:
                    # No new session or command on repeated IN swipes.
                    result = {"success": True, "duplicate": True, "session_id": parking.id,
                              "status": parking.status.value, "command_sent": False}
                elif card.status != "ASSIGNED":
                    error = HTTPException(409, "Thẻ không ở trạng thái được cấp")
                else:
                    slot = await db.get(Slot, parking.slot_id)
                    if slot.physical_occupied:
                        error = HTTPException(409, "Slot được cấp đang có xe; bảo vệ cần kiểm tra")
                    else:
                        parking.status = SessionStatus.PARKING
                        parking.time_in = utc_now()
                        parking.authorized_until = None
                        card.status = "IN_USE"
                        if parking.booking_id:
                            booking = await db.get(Booking, parking.booking_id)
                            booking.status = BookingStatus.CHECKED_IN
                        open_gate = True
                        result = {"success": True, "duplicate": False, "gate": gate,
                                  "card_uid": card_uid, "session_id": parking.id,
                                  "status": parking.status.value, "time_in": parking.time_in.isoformat()}
                        events.append(("GATE_EVENT", result))
            elif parking.status in {SessionStatus.PARKING, SessionStatus.PAYMENT_PENDING}:
                if parking.status == SessionStatus.PARKING:
                    now = utc_now()
                    hours = max(1, math.ceil((now - parking.time_in).total_seconds() / 3600))
                    parking.total_fee = hours * settings.HOURLY_RATE
                    parking.exit_requested_at = now
                    parking.status = SessionStatus.PAYMENT_PENDING
                result = {"success": True, "session_id": parking.id, "card_uid": card_uid,
                          "status": parking.status.value, "total_fee": parking.total_fee,
                          "time_in": parking.time_in.isoformat(),
                          "exit_requested_at": parking.exit_requested_at.isoformat()}
                events.append(("PAYMENT_REQUIRED", result))
            elif parking.status == SessionStatus.PAID:
                result = {"success": True, "duplicate": True, "session_id": parking.id,
                          "status": parking.status.value, "command_sent": False}
            else:
                error = HTTPException(409, "Xe chưa quẹt thẻ vào")
    await dispatch(events)
    if error:
        raise error
    if open_gate:
        result["command_sent"] = mqtt_service.publish_barrier_command(gate="IN", action="OPEN", duration_seconds=5)
    return result


async def confirm_payment(session_id, guard_note=None):
    events = []
    async with state_transaction() as db:
        parking = await db.get(ParkingSession, session_id)
        if not parking:
            raise HTTPException(404, "Không tìm thấy lượt gửi xe")
        if parking.status in {SessionStatus.PAID, SessionStatus.EXITED}:
            return {"success": True, "duplicate": True, "session_id": parking.id,
                    "total_fee": parking.total_fee, "command_sent": False}
        if (parking.status != SessionStatus.PAYMENT_PENDING or
                not parking.exit_requested_at or parking.total_fee <= 0):
            raise HTTPException(409, "Chưa có yêu cầu ra và phí hợp lệ để xác nhận")
        parking.status = SessionStatus.PAID
        parking.payment_status = PaymentStatus.PAID
        parking.paid_at = utc_now()
        parking.guard_confirmed = True
        parking.guard_note = guard_note
        result = {"success": True, "duplicate": False, "session_id": parking.id,
                  "total_fee": parking.total_fee, "status": parking.status.value}
        events.append(("PAYMENT_CONFIRMED", result.copy()))
    await dispatch(events)
    result["command_sent"] = mqtt_service.publish_barrier_command(gate="OUT", action="OPEN", duration_seconds=5)
    return result


async def confirm_exit(session_id):
    """Called by the device/guard after passage, separate from payment."""
    events = []
    async with state_transaction() as db:
        parking = await db.get(ParkingSession, session_id)
        if not parking:
            raise HTTPException(404, "Không tìm thấy lượt gửi xe")
        if parking.status == SessionStatus.EXITED:
            return {"success": True, "duplicate": True, "session_id": parking.id}
        if parking.status != SessionStatus.PAID:
            raise HTTPException(409, "Chỉ xác nhận xe ra sau khi đã thanh toán")
        parking.status = SessionStatus.EXITED
        parking.time_out = utc_now()
        card = await db.scalar(select(RfidCard).where(RfidCard.card_uid == parking.card_uid))
        if card and card.status != "BLOCKED":
            card.status = "ACTIVE"
        await sync_slot(db, await db.get(Slot, parking.slot_id), events)
        result = {"success": True, "duplicate": False, "session_id": parking.id}
        events.append(("VEHICLE_EXITED", result))
    await dispatch(events)
    return result
