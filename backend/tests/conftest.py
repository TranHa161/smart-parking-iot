import os
import tempfile
from pathlib import Path
from uuid import uuid4
from unittest.mock import AsyncMock, Mock

# Never use the user's .env database in tests.
os.environ['DATABASE_URL'] = 'sqlite+aiosqlite:///' + str(Path(tempfile.gettempdir()) / 'parking-test-import.db')

import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text
from app.core.database import Base, get_db
from app.models.models import ParkingControl, Slot, RfidCard
from app.services import parking_state
from app.services.mqtt_service import mqtt_service
from app.api.websocket import ws_manager


@pytest_asyncio.fixture
async def db(tmp_path, monkeypatch):
    pg_url = os.environ.get('PARKING_TEST_POSTGRES_URL')
    schema = 'parking_test_' + uuid4().hex
    engine = (create_async_engine(pg_url, connect_args={'server_settings': {'search_path': schema}})
              if pg_url else create_async_engine(f'sqlite+aiosqlite:///{tmp_path}/test.db'))
    factory = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
    async with engine.begin() as conn:
        if pg_url:
            await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
        await conn.run_sync(Base.metadata.create_all)
    async with factory.begin() as session:
        session.add(ParkingControl(id=1, revision=0))
        session.add_all([Slot(code='A1'), Slot(code='A2')])
        session.add_all([RfidCard(card_uid='CARD1'), RfidCard(card_uid='CARD2'),
                         RfidCard(card_uid='BLOCKED', status='BLOCKED')])
    monkeypatch.setattr(parking_state, 'AsyncSessionLocal', factory)
    monkeypatch.setattr(mqtt_service, 'publish_barrier_command', Mock(return_value=True))
    monkeypatch.setattr(mqtt_service, 'publish_led_command', Mock())
    monkeypatch.setattr(ws_manager, 'broadcast', AsyncMock())
    yield factory
    if pg_url:
        async with engine.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
    await engine.dispose()


@pytest_asyncio.fixture
async def client(db):
    import httpx
    from app.main import app

    async def override_db():
        async with db() as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        yield client
    app.dependency_overrides.clear()
