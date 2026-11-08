"""Run against an isolated, migrated database supplied through DATABASE_URL."""
import asyncio
from pathlib import Path
import sys
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import httpx
from app.main import app
from app.services.mqtt_service import mqtt_service


async def main():
    mqtt_service.connect = Mock()
    mqtt_service.disconnect = Mock()
    mqtt_service.publish_barrier_command = Mock(return_value=True)
    mqtt_service.publish_led_command = Mock()
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
            response = await client.post('/api/gate/cards', json={'card_uid': 'SMOKE_CARD'})
            assert response.status_code == 201, response.text
            response = await client.post('/api/bookings', json={'phone_number': '0912345678'})
            assert response.status_code == 200, response.text
            token = response.json()['qr_code_token']
            response = await client.post('/api/bookings/verify', json={'qr_code_token': token, 'rfid_card_uid': 'SMOKE_CARD'})
            assert response.status_code == 200, response.text
            sid = response.json()['session_id']
            mqtt_service.publish_barrier_command.assert_not_called()
            for gate in ['IN', 'IN', 'OUT', 'OUT']:
                response = await client.post('/api/gate/rfid-swipe', json={'gate': gate, 'card_uid': 'SMOKE_CARD'})
                assert response.status_code == 200, response.text
            for _ in range(2):
                response = await client.post('/api/gate/payment/confirm', json={'session_id': sid})
                assert response.status_code == 200, response.text
            response = await client.post('/api/gate/exit/confirm', json={'session_id': sid})
            assert response.status_code == 200, response.text
            assert mqtt_service.publish_barrier_command.call_count == 2
    print('Migrated API flow OK')


if __name__ == '__main__':
    asyncio.run(main())
