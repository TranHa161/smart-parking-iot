import os
from pathlib import Path
import sqlite3
import subprocess
import sys

BACKEND = Path(__file__).resolve().parents[1]


def migrate(path, revision='head'):
    env = dict(os.environ, DATABASE_URL=f'sqlite+aiosqlite:///{path}')
    return subprocess.run([sys.executable, '-m', 'alembic', 'upgrade', revision],
                          cwd=BACKEND, env=env, capture_output=True, text=True)


def test_fresh_migration_and_rerun(tmp_path):
    path = tmp_path / 'fresh.db'
    result = migrate(path)
    assert result.returncode == 0, result.stderr
    assert migrate(path).returncode == 0
    with sqlite3.connect(path) as db:
        assert db.execute('SELECT revision FROM parking_control').fetchone() == (0,)
        assert db.execute('SELECT version_num FROM alembic_version').fetchone() == ('002_entry_flow',)
        assert 'authorized_until' in {row[1] for row in db.execute('PRAGMA table_info(parking_sessions)')}
    smoke = subprocess.run([sys.executable, str(BACKEND / 'tests/smoke_migrated.py')],
                           cwd=BACKEND, env=dict(os.environ, DATABASE_URL=f'sqlite+aiosqlite:///{path}'),
                           capture_output=True, text=True)
    assert smoke.returncode == 0, smoke.stderr
    assert 'Migrated API flow OK' in smoke.stdout


def seed_legacy(path, active=False):
    result = migrate(path, '001_legacy')
    assert result.returncode == 0, result.stderr
    with sqlite3.connect(path) as db:
        db.execute("INSERT INTO slots (id,code,status,distance_cm) VALUES (1,'A1','RESERVED',150)")
        db.execute("INSERT INTO bookings (id,phone_number,slot_id,qr_code_token,status,created_at,expires_at) VALUES (1,'0912345678',1,'legacy-token','EXPIRED','2026-10-01','2026-10-01')")
        db.execute("INSERT INTO parking_sessions (id,card_uid,time_in,time_out,total_fee,payment_status,guard_confirmed) VALUES (1,'OLD_CARD','2026-10-01',?,10000,?,1)",
                   (None if active else '2026-10-02', 'UNPAID' if active else 'PAID'))
        # Simulate the pre-Alembic app database.
        db.execute('DROP TABLE alembic_version')


def test_adopts_legacy_and_preserves_paid_history(tmp_path):
    path = tmp_path / 'legacy.db'
    seed_legacy(path)
    result = migrate(path)
    assert result.returncode == 0, result.stderr
    with sqlite3.connect(path) as db:
        assert db.execute('SELECT card_uid,total_fee,status FROM parking_sessions').fetchone() == ('OLD_CARD', 10000, 'EXITED')
        assert db.execute('SELECT status FROM slots').fetchone() == ('AVAILABLE',)


def test_legacy_active_sessions_are_not_silently_changed(tmp_path):
    path = tmp_path / 'active.db'
    seed_legacy(path, active=True)
    result = migrate(path)
    assert result.returncode != 0
    assert 'Legacy active/unpaid sessions exist' in result.stderr
    with sqlite3.connect(path) as db:
        assert db.execute('SELECT time_out,payment_status FROM parking_sessions').fetchone() == (None, 'UNPAID')
        assert 'status' not in {row[1] for row in db.execute('PRAGMA table_info(parking_sessions)')}
