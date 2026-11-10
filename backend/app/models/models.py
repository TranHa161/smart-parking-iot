from app.core.time import utc_now
import enum
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, ForeignKey, Enum, Index, text
from sqlalchemy.orm import relationship
from app.core.database import Base


class SlotStatus(str, enum.Enum):
    AVAILABLE = "AVAILABLE"    # Đèn XANH - Đang trống
    RESERVED = "RESERVED"      # Đèn VÀNG - Quyền giữ chỗ/lượt đỗ chưa kết thúc
    OCCUPIED = "OCCUPIED"      # Đèn ĐỎ - Có xe đang đỗ


class BookingStatus(str, enum.Enum):
    PENDING = "PENDING"        # Chờ khách tới quẹt QR trong 15p
    VERIFIED = "VERIFIED"      # Đã xác thực QR và cấp thẻ, chưa quẹt IN
    CHECKED_IN = "CHECKED_IN"  # Đã quẹt RFID IN
    EXPIRED = "EXPIRED"        # Quá 15p tự động hủy
    CANCELLED = "CANCELLED"    # Hủy chủ động


class PaymentStatus(str, enum.Enum):
    UNPAID = "UNPAID"
    PAID = "PAID"


class SessionStatus(str, enum.Enum):
    AUTHORIZED = "AUTHORIZED"
    PARKING = "PARKING"
    PAYMENT_PENDING = "PAYMENT_PENDING"
    PAID = "PAID"
    EXITED = "EXITED"
    CANCELLED = "CANCELLED"


class UserRole(str, enum.Enum):
    USER = "user"
    GUARD = "guard"
    ADMIN = "admin"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(120), unique=True, index=True, nullable=False)
    phone = Column(String(20), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default=UserRole.USER.value)
    created_at = Column(DateTime, default=utc_now)



class ParkingControl(Base):
    """One DB row serializes capacity/state transitions for this small parking lot."""
    __tablename__ = "parking_control"
    id = Column(Integer, primary_key=True)
    revision = Column(Integer, nullable=False, default=0)


class Slot(Base):
    __tablename__ = "slots"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, nullable=False)     # Vd: "A1", "A2", "Slot 1"
    status = Column(Enum(SlotStatus), default=SlotStatus.AVAILABLE, nullable=False)
    sensor_id = Column(String(50), nullable=True)             # ID cảm biến HC-SR04
    distance_cm = Column(Float, default=0.0)                  # Khoảng cách hiện tại từ HC-SR04
    physical_occupied = Column(Boolean, nullable=False, default=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    bookings = relationship("Booking", back_populates="slot")


class Booking(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)
    phone_number = Column(String(20), index=True, nullable=False)
    slot_id = Column(Integer, ForeignKey("slots.id"), nullable=False)
    qr_code_token = Column(String(100), unique=True, index=True, nullable=False)
    status = Column(Enum(BookingStatus), default=BookingStatus.PENDING, nullable=False)
    created_at = Column(DateTime, default=utc_now)
    expires_at = Column(DateTime, nullable=False)

    slot = relationship("Slot", back_populates="bookings")
    session = relationship("ParkingSession", back_populates="booking", uselist=False)


class RfidCard(Base):
    __tablename__ = "rfid_cards"

    id = Column(Integer, primary_key=True, index=True)
    card_uid = Column(String(50), unique=True, index=True, nullable=False)
    status = Column(String(20), default="ACTIVE")             # ACTIVE, ASSIGNED, IN_USE, BLOCKED
    is_temporary = Column(Boolean, default=True)               # Thẻ vãng lai hay thẻ đăng ký


class ParkingSession(Base):
    __tablename__ = "parking_sessions"
    __table_args__ = (
        Index("uq_active_card", "card_uid", unique=True,
              sqlite_where=text("time_out IS NULL"), postgresql_where=text("time_out IS NULL")),
        Index("uq_active_slot", "slot_id", unique=True,
              sqlite_where=text("time_out IS NULL"), postgresql_where=text("time_out IS NULL")),
        Index("uq_session_booking", "booking_id", unique=True),
    )

    id = Column(Integer, primary_key=True, index=True)
    card_uid = Column(String(50), index=True, nullable=False)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=True)
    slot_id = Column(Integer, ForeignKey("slots.id"), nullable=True)
    
    status = Column(Enum(SessionStatus, native_enum=False), nullable=False, default=SessionStatus.AUTHORIZED)
    authorized_until = Column(DateTime, nullable=True)
    time_in = Column(DateTime, nullable=True)
    exit_requested_at = Column(DateTime, nullable=True)
    paid_at = Column(DateTime, nullable=True)
    time_out = Column(DateTime, nullable=True)
    
    total_fee = Column(Integer, default=0)
    payment_status = Column(Enum(PaymentStatus), default=PaymentStatus.UNPAID, nullable=False)
    guard_confirmed = Column(Boolean, default=False)
    guard_note = Column(String(255), nullable=True)

    booking = relationship("Booking", back_populates="session")

