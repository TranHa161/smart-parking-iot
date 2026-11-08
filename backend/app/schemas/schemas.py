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
    phone_number: str = Field(..., pattern=r"^\+?[0-9]{9,15}$", description="Số điện thoại của khách đặt")
    slot_id: Optional[int] = Field(None, gt=0, description="Bỏ trống để tự chọn slot")


class BookingResponse(BaseModel):
    id: int
    phone_number: str
    slot_id: int
    slot_code: Optional[str] = None
    qr_code_token: str
    qr_code_base64: Optional[str] = None
    status: BookingStatus
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

    model_config = ConfigDict(from_attributes=True)


class PaymentConfirmRequest(BaseModel):
    session_id: int = Field(gt=0)
    guard_note: Optional[str] = Field("Thanh toán tiền mặt tại quầy", max_length=255)



class OccupancyEvent(BaseModel):
    slot_id: Optional[int] = Field(None, gt=0)
    occupied: StrictBool
    distance_cm: float = Field(ge=0, allow_inf_nan=False)
