from datetime import date, datetime, timedelta
from typing import Literal, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import require_admin
from app.core.time import utc_now
from app.models.models import (
    Booking,
    BookingStatus,
    GateEvent,
    ParkingSession,
    PaymentStatus,
    SessionStatus,
    Slot,
    SlotStatus,
    User,
)
from app.schemas.schemas import GateEventResponse

router = APIRouter(prefix="/reports", tags=["Reports - Báo cáo & Thống kê (Admin)"])


def _to_local(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt + timedelta(hours=settings.REPORT_TZ_OFFSET_HOURS)


def _local_day_bounds_utc(target_day: date) -> tuple[datetime, datetime]:
    offset = timedelta(hours=settings.REPORT_TZ_OFFSET_HOURS)
    start_local = datetime(target_day.year, target_day.month, target_day.day)
    end_local = start_local + timedelta(days=1)
    return start_local - offset, end_local - offset


@router.get("/summary")
async def get_report_summary(
    from_date: Optional[date] = Query(default=None, alias="from"),
    to_date: Optional[date] = Query(default=None, alias="to"),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """[Admin] Tổng hợp KPI doanh thu, công suất slot, tỷ lệ no-show và thời gian đỗ trung bình."""
    slots = (await db.scalars(select(Slot))).all()
    total_slots = len(slots)
    available_slots = sum(1 for s in slots if s.status == SlotStatus.AVAILABLE)
    occupied_slots = sum(1 for s in slots if s.status == SlotStatus.OCCUPIED)
    reserved_slots = sum(1 for s in slots if s.status == SlotStatus.RESERVED)

    sessions = (await db.scalars(select(ParkingSession))).all()
    bookings = (await db.scalars(select(Booking))).all()

    start_utc = None
    end_utc = None
    if from_date:
        start_utc, _ = _local_day_bounds_utc(from_date)
    if to_date:
        _, end_utc = _local_day_bounds_utc(to_date)

    def in_range(dt: Optional[datetime]) -> bool:
        if dt is None:
            return False
        if start_utc and dt < start_utc:
            return False
        if end_utc and dt >= end_utc:
            return False
        return True

    filtered_paid = [
        s
        for s in sessions
        if s.payment_status == PaymentStatus.PAID
        and (
            (start_utc is None and end_utc is None)
            or in_range(s.paid_at or s.time_out or s.time_in)
        )
    ]
    total_revenue = sum(int(s.total_fee or 0) for s in filtered_paid)

    today_local = _to_local(utc_now()).date()
    today_start_utc, today_end_utc = _local_day_bounds_utc(today_local)
    today_revenue = sum(
        int(s.total_fee or 0)
        for s in sessions
        if s.payment_status == PaymentStatus.PAID
        and (s.paid_at or s.time_out)
        and today_start_utc <= (s.paid_at or s.time_out) < today_end_utc
    )

    active_parking_count = sum(
        1
        for s in sessions
        if s.time_out is None
        and s.status in {SessionStatus.PARKING, SessionStatus.PAYMENT_PENDING}
    )

    durations_min = []
    for s in sessions:
        end_ref = s.exit_requested_at or s.time_out
        if s.time_in and end_ref and end_ref >= s.time_in:
            durations_min.append((end_ref - s.time_in).total_seconds() / 60.0)
    avg_parking_minutes = round(sum(durations_min) / len(durations_min), 1) if durations_min else 0.0

    filtered_bookings = [
        b
        for b in bookings
        if (start_utc is None and end_utc is None) or in_range(b.created_at)
    ]
    total_bookings = len(filtered_bookings)
    expired_bookings = sum(1 for b in filtered_bookings if b.status == BookingStatus.EXPIRED)
    checked_in_bookings = sum(1 for b in filtered_bookings if b.status == BookingStatus.CHECKED_IN)
    no_show_rate = round((expired_bookings / total_bookings) * 100.0, 1) if total_bookings else 0.0

    return {
        "total_revenue": total_revenue,
        "today_revenue": today_revenue,
        "paid_sessions_count": len(filtered_paid),
        "total_sessions_count": len(sessions),
        "active_parking_count": active_parking_count,
        "total_slots": total_slots,
        "available_slots": available_slots,
        "occupied_slots": occupied_slots,
        "reserved_slots": reserved_slots,
        "total_bookings": total_bookings,
        "checked_in_bookings": checked_in_bookings,
        "expired_bookings": expired_bookings,
        "no_show_rate": no_show_rate,
        "avg_parking_minutes": avg_parking_minutes,
        "hourly_rate": settings.HOURLY_RATE,
    }


@router.get("/revenue")
async def get_revenue_series(
    days: int = Query(default=7, ge=1, le=90),
    group: Literal["day", "week", "month"] = Query(default="day"),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """[Admin] Chuỗi doanh thu theo ngày/tuần/tháng (múi giờ Việt Nam UTC+7) để vẽ biểu đồ."""
    today_local = _to_local(utc_now()).date()
    start_day = today_local - timedelta(days=days - 1)
    start_utc, _ = _local_day_bounds_utc(start_day)

    sessions = (
        await db.scalars(
            select(ParkingSession).where(ParkingSession.payment_status == PaymentStatus.PAID)
        )
    ).all()

    if group == "day":
        buckets: dict[str, dict] = {}
        for i in range(days):
            d = start_day + timedelta(days=i)
            key = d.isoformat()
            buckets[key] = {
                "period": key,
                "label": d.strftime("%d/%m"),
                "revenue": 0,
                "sessions": 0,
            }
        for s in sessions:
            ts = s.paid_at or s.time_out or s.time_in
            if not ts or ts < start_utc:
                continue
            local_d = _to_local(ts).date().isoformat()
            if local_d in buckets:
                buckets[local_d]["revenue"] += int(s.total_fee or 0)
                buckets[local_d]["sessions"] += 1
        return list(buckets.values())

    grouped: dict[str, dict] = {}
    for s in sessions:
        ts = s.paid_at or s.time_out or s.time_in
        if not ts or ts < start_utc:
            continue
        local_dt = _to_local(ts)
        if group == "week":
            iso_year, iso_week, _ = local_dt.isocalendar()
            key = f"{iso_year}-W{iso_week:02d}"
            label = f"Tuần {iso_week}/{iso_year}"
        else:
            key = local_dt.strftime("%Y-%m")
            label = local_dt.strftime("%m/%Y")
        if key not in grouped:
            grouped[key] = {"period": key, "label": label, "revenue": 0, "sessions": 0}
        grouped[key]["revenue"] += int(s.total_fee or 0)
        grouped[key]["sessions"] += 1
    return [grouped[k] for k in sorted(grouped.keys())]


@router.get("/traffic")
async def get_hourly_traffic(
    days: int = Query(default=7, ge=1, le=90),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """[Admin] Phân bố lượt xe vào theo khung giờ trong ngày (00h..23h giờ VN)."""
    today_local = _to_local(utc_now()).date()
    start_day = today_local - timedelta(days=days - 1)
    start_utc, _ = _local_day_bounds_utc(start_day)

    sessions = (
        await db.scalars(select(ParkingSession).where(ParkingSession.time_in.is_not(None)))
    ).all()

    hours = {
        h: {"hour": h, "label": f"{h:02d}:00", "entries": 0}
        for h in range(24)
    }
    for s in sessions:
        if s.time_in and s.time_in >= start_utc:
            local_h = _to_local(s.time_in).hour
            hours[local_h]["entries"] += 1
    return list(hours.values())


@router.get("/sessions")
async def get_report_sessions(
    limit: int = Query(default=50, ge=1, le=200),
    status: Optional[SessionStatus] = Query(default=None),
    card_uid: Optional[str] = Query(default=None),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """[Admin] Lịch sử các phiên gửi xe kèm thông tin người cấp thẻ, người thu tiền và biển số."""
    users = {u.id: u.name for u in (await db.scalars(select(User))).all()}
    slots = {s.id: s.code for s in (await db.scalars(select(Slot))).all()}
    bookings = {b.id: b for b in (await db.scalars(select(Booking))).all()}

    query = select(ParkingSession).order_by(ParkingSession.id.desc()).limit(limit)
    if status is not None:
        query = query.where(ParkingSession.status == status)
    if card_uid:
        query = query.where(ParkingSession.card_uid == card_uid.strip().upper())

    rows = (await db.scalars(query)).all()
    items = []
    for s in rows:
        b = bookings.get(s.booking_id) if s.booking_id else None
        items.append(
            {
                "id": s.id,
                "card_uid": s.card_uid,
                "booking_id": s.booking_id,
                "slot_id": s.slot_id,
                "slot_code": slots.get(s.slot_id, f"Slot {s.slot_id}" if s.slot_id else "-"),
                "phone_number": b.phone_number if b else None,
                "license_plate": b.license_plate if b else None,
                "status": s.status.value if hasattr(s.status, "value") else str(s.status),
                "time_in": s.time_in.isoformat() if s.time_in else None,
                "exit_requested_at": s.exit_requested_at.isoformat() if s.exit_requested_at else None,
                "paid_at": s.paid_at.isoformat() if s.paid_at else None,
                "time_out": s.time_out.isoformat() if s.time_out else None,
                "total_fee": s.total_fee,
                "payment_status": (
                    s.payment_status.value
                    if hasattr(s.payment_status, "value")
                    else str(s.payment_status)
                ),
                "guard_confirmed": s.guard_confirmed,
                "guard_note": s.guard_note,
                "issued_by": s.issued_by,
                "issued_by_name": users.get(s.issued_by),
                "confirmed_by": s.confirmed_by,
                "confirmed_by_name": users.get(s.confirmed_by),
            }
        )
    return items


@router.get("/gate-events", response_model=list[GateEventResponse])
async def get_gate_events(
    limit: int = Query(default=50, ge=1, le=200),
    event_type: Optional[str] = Query(default=None),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """[Admin] Nhật ký thao tác cổng (bao gồm các lần override barrier và thẻ bị từ chối)."""
    users = {u.id: u.name for u in (await db.scalars(select(User))).all()}
    query = select(GateEvent).order_by(GateEvent.id.desc()).limit(limit)
    if event_type:
        query = query.where(GateEvent.event_type == event_type)
    events = (await db.scalars(query)).all()
    return [
        GateEventResponse(
            id=ev.id,
            created_at=ev.created_at,
            actor_id=ev.actor_id,
            actor_name=users.get(ev.actor_id) if ev.actor_id else "Thiết bị / Tự động",
            source=ev.source,
            event_type=ev.event_type,
            gate=ev.gate,
            card_uid=ev.card_uid,
            session_id=ev.session_id,
            detail=ev.detail,
        )
        for ev in events
    ]
