from app.core.time import utc_now
import asyncio
from datetime import timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import select, func

from app.models.models import (Booking, BookingStatus, Slot, SlotStatus, ParkingSession,
                               SessionStatus, RfidCard, PaymentStatus)
from app.services.booking_service import create_booking, verify_booking_and_assign_rfid
from app.services.gate_service import (assign_walk_in, process_rfid_swipe, confirm_payment,
                                      confirm_exit)
from app.services.scheduler import check_expired_bookings
from app.services.mqtt_service import mqtt_service


async def occupy(slot_id, occupied):
    await mqtt_service._handle_occupancy(f'parking/slot/{slot_id}/occupancy',
                                       {'occupied': occupied, 'distance_cm': 15 if occupied else 150})


async def assert_rejected(awaitable, status):
    with pytest.raises(HTTPException) as error:
        await awaitable
    assert error.value.status_code == status


async def test_booked_vehicle_full_flow(db):
    booking = await create_booking('0912345678', 1)
    assigned = await verify_booking_and_assign_rfid(booking['qr_code_token'], 'CARD1')
    sid = assigned['session_id']
    mqtt_service.publish_barrier_command.assert_not_called()
    async with db() as session:
        parking = await session.get(ParkingSession, sid)
        assert parking.time_in is None
        assert parking.status == SessionStatus.AUTHORIZED
        assert (await session.get(Booking, booking['id'])).status == BookingStatus.VERIFIED
    # Once verified, the original QR deadline no longer expires this authorization.
    async with db.begin() as session:
        (await session.get(Booking, booking['id'])).expires_at = utc_now() - timedelta(seconds=1)
    await check_expired_bookings()
    await process_rfid_swipe('IN', 'CARD1')
    duplicate = await process_rfid_swipe('IN', 'CARD1')
    assert duplicate['duplicate']
    assert mqtt_service.publish_barrier_command.call_count == 1
    async with db.begin() as session:
        parking = await session.get(ParkingSession, sid)
        assert parking.booking_id == booking['id']
        assert (await session.scalar(select(func.count()).select_from(ParkingSession))) == 1
        parking.time_in = utc_now() - timedelta(hours=1, seconds=1)
    await occupy(1, True)
    async with db() as session:
        assert (await session.get(Slot, 1)).status == SlotStatus.OCCUPIED
    await occupy(1, False)
    async with db() as session:
        assert (await session.get(Slot, 1)).status == SlotStatus.RESERVED
    quote = await process_rfid_swipe('OUT', 'CARD1')
    assert quote['total_fee'] == 20000
    repeated = await process_rfid_swipe('OUT', 'CARD1')
    assert repeated['exit_requested_at'] == quote['exit_requested_at']
    assert repeated['total_fee'] == quote['total_fee']
    async with db() as session:
        assert (await session.get(ParkingSession, sid)).time_out is None
    paid = await confirm_payment(sid, 'Đã thu tiền')
    assert paid['command_sent']
    assert (await confirm_payment(sid))['duplicate']
    assert mqtt_service.publish_barrier_command.call_count == 2
    async with db() as session:
        assert (await session.get(ParkingSession, sid)).time_out is None
        assert (await session.get(RfidCard, 1)).status == 'IN_USE'
    await confirm_exit(sid)
    assert (await confirm_exit(sid))['duplicate']
    async with db() as session:
        assert (await session.get(Slot, 1)).status == SlotStatus.AVAILABLE
        assert (await session.get(RfidCard, 1)).status == 'ACTIVE'
        assert (await session.get(ParkingSession, sid)).payment_status == PaymentStatus.PAID


async def test_expired_qr_releases_slot_even_before_scheduler(db):
    booking = await create_booking('0912345678', 1)
    async with db.begin() as session:
        (await session.get(Booking, booking['id'])).expires_at = utc_now() - timedelta(seconds=1)
    await assert_rejected(verify_booking_and_assign_rfid(booking['qr_code_token'], 'CARD1'), 410)
    await check_expired_bookings()
    async with db() as session:
        assert (await session.get(Slot, 1)).status == SlotStatus.AVAILABLE
        assert (await session.get(Booking, booking['id'])).status == BookingStatus.EXPIRED
    mqtt_service.publish_barrier_command.assert_not_called()


async def test_expiration_does_not_clear_physical_vehicle(db):
    booking = await create_booking('0912345678', 1)
    await occupy(1, True)
    async with db.begin() as session:
        (await session.get(Booking, booking['id'])).expires_at = utc_now() - timedelta(seconds=1)
    await check_expired_bookings()
    async with db() as session:
        assert (await session.get(Slot, 1)).status == SlotStatus.OCCUPIED
    await assert_rejected(create_booking('0912345678', 1), 409)


async def test_duplicate_qr_and_assigned_card_rejected(db):
    first = await create_booking('0912345678', 1)
    second = await create_booking('0912345679', 2)
    await verify_booking_and_assign_rfid(first['qr_code_token'], 'CARD1')
    await assert_rejected(verify_booking_and_assign_rfid(first['qr_code_token'], 'CARD2'), 409)
    await assert_rejected(verify_booking_and_assign_rfid(second['qr_code_token'], 'CARD1'), 409)
    mqtt_service.publish_barrier_command.assert_not_called()


@pytest.mark.parametrize('uid,status', [('UNKNOWN', 403), ('BLOCKED', 403), ('CARD1', 409)])
async def test_uncleared_cards_cannot_enter(db, uid, status):
    await assert_rejected(process_rfid_swipe('IN', uid), status)
    mqtt_service.publish_barrier_command.assert_not_called()
    async with db() as session:
        assert await session.scalar(select(func.count()).select_from(ParkingSession)) == 0
        assert await session.scalar(select(func.count()).select_from(RfidCard)) == 3


async def test_no_payment_or_exit_before_out_swipe(db):
    auth = await assign_walk_in('CARD1', 1)
    await assert_rejected(confirm_payment(auth['session_id']), 409)
    await assert_rejected(process_rfid_swipe('OUT', 'CARD1'), 409)
    await process_rfid_swipe('IN', 'CARD1')
    await assert_rejected(confirm_payment(auth['session_id']), 409)
    await assert_rejected(confirm_exit(auth['session_id']), 409)
    assert mqtt_service.publish_barrier_command.call_count == 1


async def test_authorization_timeout_releases_card_and_capacity(db):
    auth = await assign_walk_in('CARD1', 1)
    async with db.begin() as session:
        (await session.get(ParkingSession, auth['session_id'])).authorized_until = utc_now() - timedelta(seconds=1)
    # IN rejection must still commit the timeout, not resurrect the hold.
    await assert_rejected(process_rfid_swipe('IN', 'CARD1'), 409)
    async with db() as session:
        assert (await session.get(RfidCard, 1)).status == 'ACTIVE'
        assert (await session.get(Slot, 1)).status == SlotStatus.AVAILABLE
        assert (await session.get(ParkingSession, auth['session_id'])).status == SessionStatus.CANCELLED
    await assign_walk_in('CARD1', 1)


async def test_exit_does_not_turn_occupied_slot_green(db):
    auth = await assign_walk_in('CARD1', 1)
    await process_rfid_swipe('IN', 'CARD1')
    await occupy(1, True)
    await process_rfid_swipe('OUT', 'CARD1')
    await confirm_payment(auth['session_id'])
    await confirm_exit(auth['session_id'])
    async with db() as session:
        assert (await session.get(Slot, 1)).status == SlotStatus.OCCUPIED
    await occupy(1, False)
    async with db() as session:
        assert (await session.get(Slot, 1)).status == SlotStatus.AVAILABLE


async def test_concurrent_booking_only_one_wins(db):
    outcomes = await asyncio.gather(create_booking('0912345678', 1), create_booking('0912345679', 1), return_exceptions=True)
    assert sum(isinstance(r, dict) for r in outcomes) == 1
    assert sum(isinstance(r, HTTPException) and r.status_code == 409 for r in outcomes) == 1


async def test_walk_ins_compete_for_last_capacity_before_parking(db):
    await create_booking('0912345678', 2)
    outcomes = await asyncio.gather(assign_walk_in('CARD1'), assign_walk_in('CARD2'), return_exceptions=True)
    assert sum(isinstance(r, dict) for r in outcomes) == 1
    assert sum(isinstance(r, HTTPException) and r.status_code == 409 for r in outcomes) == 1
    mqtt_service.publish_barrier_command.assert_not_called()


async def test_concurrent_verify_and_payment_do_not_duplicate_commands(db):
    booking = await create_booking('0912345678', 1)
    results = await asyncio.gather(*[verify_booking_and_assign_rfid(booking['qr_code_token'], 'CARD1') for _ in range(2)], return_exceptions=True)
    assert sum(isinstance(r, dict) for r in results) == 1
    sid = next(r['session_id'] for r in results if isinstance(r, dict))
    await asyncio.gather(process_rfid_swipe('IN', 'CARD1'), process_rfid_swipe('IN', 'CARD1'))
    await process_rfid_swipe('OUT', 'CARD1')
    await asyncio.gather(confirm_payment(sid), confirm_payment(sid))
    assert mqtt_service.publish_barrier_command.call_count == 2


async def test_api_flow_and_validation(client):
    registered = await client.post('/api/gate/cards', json={'card_uid': ' new_card '})
    assert registered.status_code == 201
    assert registered.json()['card_uid'] == 'NEW_CARD'
    duplicate = await client.post('/api/gate/cards', json={'card_uid': 'NEW_CARD'})
    assert duplicate.status_code == 409
    booking = await client.post('/api/bookings', json={'phone_number': '0912345678'})
    assert booking.status_code == 200
    checked = await client.post('/api/bookings/verify', json={'qr_code_token': booking.json()['qr_code_token'], 'rfid_card_uid': 'NEW_CARD'})
    assert checked.status_code == 200
    sessions = await client.get('/api/gate/sessions')
    assert sessions.status_code == 200
    assert sessions.json()[0]['time_in'] is None
    assert (await client.post('/api/gate/rfid-swipe', json={'gate': 'bad', 'card_uid': 'CARD1'})).status_code == 422
    assert (await client.post('/api/bookings', json={'phone_number': 'bad'})).status_code == 422
    assert (await client.put('/api/slots/1/override?new_status=AVAILABLE')).status_code == 409


async def test_malformed_occupancy_does_not_release_hold(db):
    await assign_walk_in('CARD1', 1)
    with pytest.raises(ValueError):
        await mqtt_service._handle_occupancy('parking/slot/1/occupancy', {'occupied': 'false', 'distance_cm': 15})
    with pytest.raises(ValueError):
        await mqtt_service._handle_occupancy('parking/slot/1/occupancy', {'slot_id': 2, 'occupied': False, 'distance_cm': 15})
    async with db() as session:
        assert (await session.get(Slot, 1)).status == SlotStatus.RESERVED


async def test_esp32_stm32_gateway_text_protocol(db, monkeypatch):
    from unittest.mock import Mock
    from app.core.config import Settings

    down_mock = Mock(return_value=True)
    monkeypatch.setattr(mqtt_service, 'publish_gateway_down', down_mock)

    # 1. Đặt chỗ trước -> Slot 1 chuyển RESERVED -> khi STM32 gửi BOOT hoặc SLOTS:0,0 sẽ nhận RESERVE:1
    booking = await create_booking('0912345678', 1)
    await mqtt_service._handle_gateway_text('parking/gate/up', 'BOOT')
    down_mock.assert_called_with('RESERVE:1')

    # 2. Quẹt thẻ chưa được cấp quyền trên STM32 -> nhận DENY
    down_mock.reset_mock()
    await mqtt_service._handle_gateway_text('parking/gate/up', 'RFID:CARD1')
    down_mock.assert_called_once_with('DENY')

    # 3. Bảo vệ quét QR cấp thẻ CARD1 -> Khách quẹt RFID:CARD1 tại STM32 -> tự nhận diện cổng IN
    await verify_booking_and_assign_rfid(booking['qr_code_token'], 'CARD1')
    await mqtt_service._handle_gateway_text('parking/gate/up', 'RFID:CARD1')
    assert mqtt_service.publish_barrier_command.call_count == 1

    # 4. STM32 gửi SLOTS:2,0 -> Slot 1 chuyển OCCUPIED
    await mqtt_service._handle_gateway_text('parking/gate/up', 'SLOTS:2,0')
    async with db() as session:
        assert (await session.get(Slot, 1)).status == SlotStatus.OCCUPIED

    # 5. Khách quẹt RFID:CARD1 lần nữa trên STM32 -> tự nhận diện cổng OUT và phát FEE:<total_fee> xuống LCD
    down_mock.reset_mock()
    await mqtt_service._handle_gateway_text('parking/gate/up', 'RFID:CARD1')
    down_mock.assert_called_once_with('FEE:10000')

    # 6. Kiểm tra Settings tự chuẩn hóa DATABASE_URL và alias MQTT từ docker-compose.yml
    cfg = Settings(
        DATABASE_URL='postgresql://u:p@postgres:5432/parking',
        MQTT_HOST='mosquitto',
        MQTT_USER='parking_gw',
        SECRET_KEY='ignored-extra',
    )
    assert cfg.DATABASE_URL == 'postgresql+asyncpg://u:p@postgres:5432/parking'
    assert cfg.MQTT_BROKER_HOST == 'mosquitto'
    assert cfg.MQTT_USERNAME == 'parking_gw'


async def test_auth_register_login_and_me(client, db):
    reg = await client.post(
        '/api/auth/register',
        json={
            'name': 'Nguyen Van A',
            'email': 'nguyenvana@example.com',
            'phone': '0912345678',
            'password': 'password123',
        },
    )
    assert reg.status_code == 201
    reg_data = reg.json()
    assert reg_data['user']['email'] == 'nguyenvana@example.com'
    assert reg_data['user']['role'] == 'user'
    assert reg_data['access_token']

    dup = await client.post(
        '/api/auth/register',
        json={
            'name': 'Nguyen Van A',
            'email': 'nguyenvana@example.com',
            'phone': '0912345678',
            'password': 'password123',
        },
    )
    assert dup.status_code == 409

    login = await client.post(
        '/api/auth/login',
        json={'email': 'nguyenvana@example.com', 'password': 'password123'},
    )
    assert login.status_code == 200
    token = login.json()['access_token']

    bad_login = await client.post(
        '/api/auth/login',
        json={'email': 'nguyenvana@example.com', 'password': 'wrongpassword'},
    )
    assert bad_login.status_code == 401

    me = await client.get('/api/auth/me', headers={'Authorization': f'Bearer {token}'})
    assert me.status_code == 200
    assert me.json()['email'] == 'nguyenvana@example.com'

    # Khách hàng không được phép cấp tài khoản Bảo vệ
    forbidden = await client.post(
        '/api/auth/guards',
        headers={'Authorization': f'Bearer {token}'},
        json={
            'name': 'Bao Ve 2',
            'email': 'guard2@parking.com',
            'phone': '0912223334',
            'password': 'password123',
            'role': 'guard',
        },
    )
    assert forbidden.status_code == 403

    # Tạo tài khoản Admin trong DB test và dùng quyền Admin cấp tài khoản Bảo vệ
    from app.models.models import User, UserRole
    from app.services.auth_service import hash_password, create_access_token

    async with db() as s:
        admin_user = User(
            name='Admin Test',
            email='admin@parking.com',
            phone='0988888888',
            password_hash=hash_password('admin123'),
            role=UserRole.ADMIN.value,
        )
        s.add(admin_user)
        await s.commit()
        await s.refresh(admin_user)
        admin_token = create_access_token(admin_user)

    created_guard = await client.post(
        '/api/auth/guards',
        headers={'Authorization': f'Bearer {admin_token}'},
        json={
            'name': 'Bao Ve 2',
            'email': 'guard2@parking.com',
            'phone': '0912223334',
            'password': 'password123',
            'role': 'guard',
        },
    )
    assert created_guard.status_code == 201
    assert created_guard.json()['role'] == 'guard'

    all_users = await client.get(
        '/api/auth/users',
        headers={'Authorization': f'Bearer {admin_token}'},
    )
    assert all_users.status_code == 200
    assert len(all_users.json()) >= 3



