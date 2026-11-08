import asyncio
import logging
from app.services.parking_state import state_transaction, expire_holds, dispatch

logger = logging.getLogger("scheduler")


async def check_expired_bookings():
    events = []
    async with state_transaction() as db:
        await expire_holds(db, events)
    await dispatch(events)


async def start_booking_expiration_scheduler(interval_seconds: int = 5):
    while True:
        try:
            await check_expired_bookings()
        except Exception:
            logger.exception("Không thể xử lý hết hạn")
        await asyncio.sleep(interval_seconds)
