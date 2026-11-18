from pydantic import BaseModel, Field, ConfigDict, StrictBool
from datetime import datetime
from typing import Optional, Literal, Annotated
from pydantic import StringConstraints
from app.models.models import SlotStatus, BookingStatus, PaymentStatus, SessionStatus

CardUid = Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, min_length=1, max_length=50)]


# ---------------- SLOTS ----------------
class SlotBase(BaseModel):
    code: str
    sensor_id: Optional[str] = None


class SlotCreate(SlotBase):
    pass


class SlotResponse(SlotBase):
    id: int
    status: SlotStatus
    distance_cm: float
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ---------------- BOOKINGS ----------------
class BookingCreate(BaseModel):
    phone_number: Optional[str] = Field(None, pattern=r"^\+?[0-9]{9,15}$",
                                        description="Bỏ trống để dùng SĐT trong hồ sơ tài khoản")
    slot_id: Optional[int] = Field(None, gt=0, description="Bỏ trống để tự chọn slot")
    license_plate: Optional[Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True,
                                                             max_length=20)]] = None


class BookingResponse(BaseModel):
    id: int
    phone_number: str
    slot_id: int
    slot_code: Optional[str] = None
    user_id: Optional[int] = None
    license_plate: Optional[str] = None
    qr_code_token: Optional[str] = None
    qr_code_base64: Optional[str] = None
    status: BookingStatus
    session_status: Optional[SessionStatus] = None
    total_fee: Optional[int] = None
    time_in: Optional[datetime] = None
    time_out: Optional[datetime] = None
    created_at: datetime
    expires_at: datetime
    remaining_seconds: int

    model_config = ConfigDict(from_attributes=True)


class BookingVerifyRequest(BaseModel):
    qr_code_token: str = Field(..., description="Mã token quét từ QR code của khách")
    rfid_card_uid: CardUid


class CardCreate(BaseModel):
    card_uid: CardUid


class WalkInCreate(BaseModel):
    card_uid: CardUid
    slot_id: Optional[int] = Field(None, gt=0)


class ExitConfirmRequest(BaseModel):
    session_id: int = Field(gt=0)


# ---------------- GATE & RFID ----------------
class GateRfidEvent(BaseModel):
    gate: Literal["IN", "OUT"]
    card_uid: CardUid


class BarrierControlRequest(BaseModel):
    action: Literal["OPEN", "CLOSE"] = "OPEN"
    gate: Literal["IN", "OUT"] = "IN"
    duration_seconds: int = Field(5, ge=1, le=30)
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=255)] = Field(
        ..., description="Lý do mở cổng thủ công (bắt buộc, được ghi vào nhật ký)")


# ---------------- PARKING SESSIONS & PAYMENT ----------------
class ParkingSessionResponse(BaseModel):
    id: int
    card_uid: str
    booking_id: Optional[int] = None
    slot_id: Optional[int] = None
    status: SessionStatus
    authorized_until: Optional[datetime] = None
    time_in: Optional[datetime] = None
    exit_requested_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    time_out: Optional[datetime] = None
    total_fee: int
    payment_status: PaymentStatus
    guard_confirmed: bool
    issued_by: Optional[int] = None
    confirmed_by: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class PaymentConfirmRequest(BaseModel):
    session_id: int = Field(gt=0)
    guard_note: Optional[str] = Field("Thanh toán tiền mặt tại quầy", max_length=255)



class OccupancyEvent(BaseModel):
    slot_id: Optional[int] = Field(None, gt=0)
    occupied: StrictBool
    distance_cm: float = Field(ge=0, allow_inf_nan=False)


# ---------------- AUTHENTICATION ----------------
class UserRegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., min_length=3, max_length=120)
    phone: str = Field(..., min_length=9, max_length=20)
    password: str = Field(..., min_length=6, max_length=128)


class AdminCreateUserRequest(BaseModel):
    """Admin chỉ cấp tài khoản bảo vệ; admin được tạo qua biến môi trường, khách tự đăng ký."""
    name: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., min_length=3, max_length=120)
    phone: str = Field(..., min_length=9, max_length=20)
    password: str = Field(..., min_length=6, max_length=128)
    role: Literal["guard"] = "guard"


class UserStatusUpdate(BaseModel):
    is_active: bool


class PasswordResetRequest(BaseModel):
    new_password: str = Field(..., min_length=6, max_length=128)


class PasswordChangeRequest(BaseModel):
    old_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=6, max_length=128)


class UserLoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=120)
    password: str = Field(..., min_length=1, max_length=128)


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    phone: str
    role: Literal["user", "guard", "admin"]
    is_active: bool = True
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse



# ---------------- GATE EVENTS (nhật ký) ----------------
class GateEventResponse(BaseModel):
    id: int
    created_at: datetime
    actor_id: Optional[int] = None
    actor_name: Optional[str] = None
    source: str
    event_type: str
    gate: Optional[str] = None
    card_uid: Optional[str] = None
    session_id: Optional[int] = None
    detail: Optional[str] = None
