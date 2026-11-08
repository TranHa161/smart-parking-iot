from fastapi import APIRouter
from app.schemas.schemas import BookingCreate, BookingResponse, BookingVerifyRequest
from app.services.booking_service import create_booking, get_booking, verify_booking_and_assign_rfid

router = APIRouter(prefix="/bookings", tags=["Bookings - Đặt chỗ"])


@router.post("", response_model=BookingResponse)
async def book_slot(payload: BookingCreate):
    return await create_booking(payload.phone_number, payload.slot_id)


@router.get("/{booking_id}", response_model=BookingResponse)
async def get_booking_details(booking_id: int):
    return await get_booking(booking_id)


@router.post("/verify")
async def verify_qr_and_assign_card(payload: BookingVerifyRequest):
    """Xác thực QR và cấp thẻ; khách cần quẹt RFID IN để mở cổng."""
    return await verify_booking_and_assign_rfid(payload.qr_code_token, payload.rfid_card_uid)
