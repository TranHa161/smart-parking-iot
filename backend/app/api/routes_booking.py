from fastapi import APIRouter, Depends, HTTPException
from app.core.security import get_current_user, is_staff, require_staff, require_user
from app.models.models import User
from app.schemas.schemas import BookingCreate, BookingResponse, BookingVerifyRequest
from app.services.booking_service import (
    cancel_booking,
    create_booking,
    get_booking,
    list_user_bookings,
    verify_booking_and_assign_rfid,
)

router = APIRouter(prefix="/bookings", tags=["Bookings - Đặt chỗ"])


@router.post("", response_model=BookingResponse)
async def book_slot(payload: BookingCreate, user: User = Depends(require_user)):
    phone = (payload.phone_number or user.phone or "").strip()
    if not phone:
        raise HTTPException(status_code=422, detail="Vui lòng cung cấp số điện thoại đặt chỗ")
    return await create_booking(
        phone_number=phone,
        slot_id=payload.slot_id,
        user_id=user.id,
        license_plate=payload.license_plate,
    )


@router.get("/me", response_model=list[BookingResponse])
async def get_my_bookings(user: User = Depends(require_user)):
    """[User] Danh sách vé đang hiệu lực và lịch sử đặt chỗ của khách đang đăng nhập."""
    return await list_user_bookings(user.id)


@router.post("/verify")
async def verify_qr_and_assign_card(
    payload: BookingVerifyRequest,
    actor: User = Depends(require_staff),
):
    """[Guard/Admin] Xác thực QR và cấp thẻ; khách cần quẹt RFID IN để mở cổng."""
    return await verify_booking_and_assign_rfid(
        payload.qr_code_token,
        payload.rfid_card_uid,
        actor_id=actor.id,
    )


@router.post("/{booking_id}/cancel", response_model=BookingResponse)
async def cancel_my_booking(
    booking_id: int,
    user: User = Depends(get_current_user),
):
    """[User/Staff] Hủy lượt đặt đang chờ quét QR (PENDING) và giải phóng slot."""
    return await cancel_booking(booking_id, user_id=user.id, is_staff=is_staff(user))


@router.get("/{booking_id}", response_model=BookingResponse)
async def get_booking_details(
    booking_id: int,
    user: User = Depends(get_current_user),
):
    """Chỉ chủ vé hoặc nhân viên (guard/admin) mới xem được thông tin chi tiết và QR."""
    return await get_booking(booking_id, viewer_id=user.id, viewer_is_staff=is_staff(user))
