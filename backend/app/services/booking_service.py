from app.core.time import utc_now
import base64
import io
import secrets
from datetime import timedelta
import qrcode
from fastapi import HTTPException
from sqlalchemy import select
from app.core.config import settings
from app.models.models import (Booking, BookingStatus, GateEventType, ParkingSession, RfidCard,
                               Slot, SlotStatus)
from app.services.audit import log_gate_event
from app.services.parking_state import state_transaction, expire_holds, sync_slot, dispatch


def generate_qr_base64(data: str) -> str:
    buffered = io.BytesIO()
    qrcode.make(data).save(buffered, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffered.getvalue()).decode("ascii")


def booking_response(booking, slot):
    remaining = max(0, int((booking.expires_at - utc_now()).total_seconds()))
    pending = booking.status == BookingStatus.PENDING
    return {"id": booking.id, "phone_number": booking.phone_number,
            "slot_id": booking.slot_id, "slot_code": slot.code,
            "user_id": booking.user_id, "license_plate": booking.license_plate,
            "qr_code_token": booking.qr_code_token,
            # Ảnh QR chỉ cần khi vé còn chờ quét
            "qr_code_base64": generate_qr_base64(booking.qr_code_token) if pending else None,
            "status": booking.status, "created_at": booking.created_at,
            "expires_at": booking.expires_at,
            "remaining_seconds": remaining if booking.status == BookingStatus.PENDING else 0}


async def claim_available_slot(db, slot_id=None):
    query = select(Slot).where(Slot.status == SlotStatus.AVAILABLE, Slot.physical_occupied.is_(False))
    if slot_id is not None:
        if not await db.get(Slot, slot_id):
            raise HTTPException(404, "Không tìm thấy slot")
        query = query.where(Slot.id == slot_id)
    slot = await db.scalar(query.order_by(Slot.id).limit(1))
    if not slot:
        raise HTTPException(409, "Không còn slot trống phù hợp")
    slot.status = SlotStatus.RESERVED
    return slot


async def get_assignable_card(db, uid):
    uid = uid.strip().upper()
    card = await db.scalar(select(RfidCard).where(RfidCard.card_uid == uid))
    if not card:
        raise HTTPException(404, "Thẻ chưa được đăng ký")
    if card.status != "ACTIVE":
        raise HTTPException(409, "Thẻ đã được cấp, đang sử dụng hoặc bị khóa")
    active = await db.scalar(select(ParkingSession.id).where(
        ParkingSession.card_uid == uid, ParkingSession.time_out.is_(None)).limit(1))
    if active:
        raise HTTPException(409, "Thẻ đã có lượt hoạt động")
    return card


async def _user_has_active_booking(db, user_id: int) -> bool:
    open_booking = await db.scalar(select(Booking.id).where(
        Booking.user_id == user_id,
        Booking.status.in_([BookingStatus.PENDING, BookingStatus.VERIFIED])).limit(1))
    if open_booking:
        return True
    parked = await db.scalar(select(ParkingSession.id).join(Booking, ParkingSession.booking_id == Booking.id)
                             .where(Booking.user_id == user_id, ParkingSession.time_out.is_(None)).limit(1))
    return parked is not None


async def create_booking(phone_number: str, slot_id: int | None = None, user_id: int | None = None,
                         license_plate: str | None = None):
    events = []
    async with state_transaction() as db:
        await expire_holds(db, events)
        if user_id is not None and await _user_has_active_booking(db, user_id):
            raise HTTPException(409, "Bạn đang có một lượt đặt chỗ hoặc lượt gửi xe chưa kết thúc")
        slot = await claim_available_slot(db, slot_id)
        booking = Booking(phone_number=phone_number, slot_id=slot.id, user_id=user_id,
                          license_plate=license_plate or None,
                          qr_code_token=secrets.token_urlsafe(32), status=BookingStatus.PENDING,
                          expires_at=utc_now() + timedelta(minutes=settings.BOOKING_EXPIRATION_MINUTES))
        db.add(booking)
        await sync_slot(db, slot, events)
        result = booking_response(booking, slot)
    await dispatch(events)
    return result


async def get_booking(booking_id, viewer_id: int | None = None, viewer_is_staff: bool = True):
    """Khách chỉ xem được vé của mình; bảo vệ/admin xem được mọi vé."""
    events = []
    async with state_transaction() as db:
        await expire_holds(db, events)
        booking = await db.get(Booking, booking_id)
        if not booking or (not viewer_is_staff and booking.user_id != viewer_id):
            raise HTTPException(404, "Không tìm thấy lượt đặt")
        result = booking_response(booking, await db.get(Slot, booking.slot_id))
    await dispatch(events)
    return result


async def list_user_bookings(user_id: int, limit: int = 20):
    events = []
    async with state_transaction() as db:
        await expire_holds(db, events)
        rows = (await db.execute(select(Booking, Slot).join(Slot, Booking.slot_id == Slot.id)
                                 .where(Booking.user_id == user_id)
                                 .order_by(Booking.id.desc()).limit(limit))).all()
        result = [booking_response(b, s) for b, s in rows]
    await dispatch(events)
    return result


async def cancel_booking(booking_id: int, user_id: int, is_staff: bool = False):
    events = []
    async with state_transaction() as db:
        await expire_holds(db, events)
        booking = await db.get(Booking, booking_id)
        if not booking or (not is_staff and booking.user_id != user_id):
            raise HTTPException(404, "Không tìm thấy lượt đặt")
        if booking.status != BookingStatus.PENDING:
            raise HTTPException(409, "Chỉ hủy được lượt đặt đang chờ quét QR")
        booking.status = BookingStatus.CANCELLED
        slot = await db.get(Slot, booking.slot_id)
        await sync_slot(db, slot, events)
        log_gate_event(db, GateEventType.BOOKING_CANCELLED, actor_id=user_id,
                       detail=f"Hủy lượt đặt #{booking.id} ({slot.code})")
        events.append(("BOOKING_CANCELLED", {"booking_id": booking.id, "slot_id": booking.slot_id}))
        result = booking_response(booking, slot)
    await dispatch(events)
    return result


async def verify_booking_and_assign_rfid(qr_code_token: str, rfid_card_uid: str, actor_id: int | None = None):
    events = []
    error = None
    result = None
    async with state_transaction() as db:
        await expire_holds(db, events)
        booking = await db.scalar(select(Booking).where(Booking.qr_code_token == qr_code_token))
        if not booking:
            error = HTTPException(404, "Mã QR không hợp lệ")
        elif booking.status == BookingStatus.EXPIRED:
            error = HTTPException(410, "Mã QR đã hết hạn")
        elif booking.status != BookingStatus.PENDING:
            error = HTTPException(409, "QR đã được sử dụng hoặc lượt đặt đã hủy")
        else:
            card = await get_assignable_card(db, rfid_card_uid)
            slot = await db.get(Slot, booking.slot_id)
            if slot.physical_occupied:
                raise HTTPException(409, "Slot đang có xe; bảo vệ cần kiểm tra")
            booking.status = BookingStatus.VERIFIED
            card.status = "ASSIGNED"
            parking = ParkingSession(card_uid=card.card_uid, booking_id=booking.id, slot_id=booking.slot_id,
                                     issued_by=actor_id,
                                     authorized_until=utc_now() + timedelta(minutes=settings.ENTRY_AUTHORIZATION_MINUTES))
            db.add(parking)
            await db.flush()
            log_gate_event(db, GateEventType.CARD_ISSUED, actor_id=actor_id, card_uid=card.card_uid,
                           session_id=parking.id, detail=f"QR lượt đặt #{booking.id} -> {slot.code}")
            result = {"success": True, "booking_id": booking.id, "slot_id": booking.slot_id,
                      "session_id": parking.id, "message": "Đã cấp thẻ. Hãy quẹt RFID tại cổng vào."}
            events.append(("BOOKING_VERIFIED", result))
    # Rejected expired QR still commits expiration and releases the slot.
    await dispatch(events)
    if error:
        raise error
    return result
