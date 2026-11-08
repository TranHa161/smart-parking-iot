from app.core.time import utc_now
"""All capacity/state writers acquire one DB row before reading.

Serializing transitions is intentional for this single-lot demo. UPDATE locks
work on SQLite as well as PostgreSQL. Side effects are sent after commit.
"""
from contextlib import asynccontextmanager
from sqlalchemy import select, update
from app.core.database import AsyncSessionLocal
from app.models.models import (Booking, BookingStatus, ParkingControl, ParkingSession,
                               RfidCard, SessionStatus, Slot, SlotStatus)
from app.api.websocket import ws_manager
from app.services.mqtt_service import mqtt_service


@asynccontextmanager
async def state_transaction():
    async with AsyncSessionLocal() as db:
        async with db.begin():
            result = await db.execute(update(ParkingControl).where(ParkingControl.id == 1)
                                      .values(revision=ParkingControl.revision + 1))
            if result.rowcount != 1:
                raise RuntimeError("Missing parking_control row; run alembic upgrade head")
            yield db


async def sync_slot(db, slot, events):
    await db.flush()
    held_session = await db.scalar(select(ParkingSession.id).where(
        ParkingSession.slot_id == slot.id, ParkingSession.time_out.is_(None)).limit(1))
    held_booking = await db.scalar(select(Booking.id).where(
        Booking.slot_id == slot.id,
        Booking.status.in_([BookingStatus.PENDING, BookingStatus.VERIFIED])).limit(1))
    slot.status = (SlotStatus.OCCUPIED if slot.physical_occupied else
                   SlotStatus.RESERVED if held_session or held_booking else SlotStatus.AVAILABLE)
    events.append(("SLOT_UPDATED", {"id": slot.id, "code": slot.code,
                   "status": slot.status.value, "distance_cm": slot.distance_cm}))


async def expire_holds(db, events, now=None):
    now = now or utc_now()
    bookings = (await db.scalars(select(Booking).where(
        Booking.status == BookingStatus.PENDING, Booking.expires_at <= now))).all()
    for booking in bookings:
        booking.status = BookingStatus.EXPIRED
        await sync_slot(db, await db.get(Slot, booking.slot_id), events)
        events.append(("BOOKING_EXPIRED", {"booking_id": booking.id, "slot_id": booking.slot_id}))
    authorizations = (await db.scalars(select(ParkingSession).where(
        ParkingSession.status == SessionStatus.AUTHORIZED,
        ParkingSession.authorized_until <= now))).all()
    for parking in authorizations:
        parking.status = SessionStatus.CANCELLED
        parking.time_out = now
        card = await db.scalar(select(RfidCard).where(RfidCard.card_uid == parking.card_uid))
        if card and card.status != "BLOCKED":
            card.status = "ACTIVE"
        if parking.booking_id:
            booking = await db.get(Booking, parking.booking_id)
            booking.status = BookingStatus.CANCELLED
        await sync_slot(db, await db.get(Slot, parking.slot_id), events)
        events.append(("ENTRY_EXPIRED", {"session_id": parking.id, "slot_id": parking.slot_id}))


async def dispatch(events):
    for kind, data in events:
        if kind == "SLOT_UPDATED":
            color = {"AVAILABLE": "GREEN", "RESERVED": "YELLOW", "OCCUPIED": "RED"}[data["status"]]
            mqtt_service.publish_led_command(data["id"], color)
        await ws_manager.broadcast(kind, data)
