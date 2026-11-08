from app.core.time import utc_now
import base64
import io
import secrets
from datetime import timedelta
import qrcode
from fastapi import HTTPException
from sqlalchemy import select
from app.core.config import settings
from app.models.models import Booking, BookingStatus, ParkingSession, RfidCard, Slot, SlotStatus
from app.services.parking_state import state_transaction, expire_holds, sync_slot, dispatch


def generate_qr_base64(data: str) -> str:
    buffered = io.BytesIO()
    qrcode.make(data).save(buffered, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffered.getvalue()).decode("ascii")


def booking_response(booking, slot):
    remaining = max(0, int((booking.expires_at - utc_now()).total_seconds()))
    return {"id": booking.id, "phone_number": booking.phone_number,
            "slot_id": booking.slot_id, "slot_code": slot.code,
            "qr_code_token": booking.qr_code_token,
            "qr_code_base64": generate_qr_base64(booking.qr_code_token),
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


async def create_booking(phone_number: str, slot_id: int | None = None):
    events = []
    async with state_transaction() as db:
        await expire_holds(db, events)
        slot = await claim_available_slot(db, slot_id)
        booking = Booking(phone_number=phone_number, slot_id=slot.id,
                          qr_code_token=secrets.token_urlsafe(32), status=BookingStatus.PENDING,
                          expires_at=utc_now() + timedelta(minutes=settings.BOOKING_EXPIRATION_MINUTES))
        db.add(booking)
        await sync_slot(db, slot, events)
        result = booking_response(booking, slot)
    await dispatch(events)
    return result


async def get_booking(booking_id):
    events = []
    async with state_transaction() as db:
        await expire_holds(db, events)
        booking = await db.get(Booking, booking_id)
        if not booking:
            raise HTTPException(404, "Không tìm thấy lượt đặt")
        result = booking_response(booking, await db.get(Slot, booking.slot_id))
    await dispatch(events)
    return result


async def verify_booking_and_assign_rfid(qr_code_token: str, rfid_card_uid: str):
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
                                     authorized_until=utc_now() + timedelta(minutes=settings.ENTRY_AUTHORIZATION_MINUTES))
            db.add(parking)
            await db.flush()
            result = {"success": True, "booking_id": booking.id, "slot_id": booking.slot_id,
                      "session_id": parking.id, "message": "Đã cấp thẻ. Hãy quẹt RFID tại cổng vào."}
            events.append(("BOOKING_VERIFIED", result))
    # Rejected expired QR still commits expiration and releases the slot.
    await dispatch(events)
    if error:
        raise error
    return result
