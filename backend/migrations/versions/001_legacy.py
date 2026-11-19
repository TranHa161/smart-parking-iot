"""Baseline of the original schema; also adopt an existing legacy database."""
from alembic import op
import sqlalchemy as sa

revision = "001_legacy"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    expected = {"slots", "bookings", "rfid_cards", "parking_sessions"}
    existing = set(sa.inspect(bind).get_table_names()) & expected
    if existing:
        if existing != expected:
            raise RuntimeError("Incomplete legacy database; restore/repair it before migrating")
        # Do not silently adopt a database that was already modified by hand.
        for table, column in [("slots", "physical_occupied"), ("parking_sessions", "status")]:
            if column in {c["name"] for c in sa.inspect(bind).get_columns(table)}:
                raise RuntimeError("Unversioned modified schema; inspect before adopting")
        return
    op.create_table("slots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(50), nullable=False, unique=True),
        sa.Column("status", sa.Enum("AVAILABLE", "RESERVED", "OCCUPIED", name="slotstatus"), nullable=False),
        sa.Column("sensor_id", sa.String(50)), sa.Column("distance_cm", sa.Float()),
        sa.Column("updated_at", sa.DateTime()))
    op.create_table("bookings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("phone_number", sa.String(20), nullable=False, index=True),
        sa.Column("slot_id", sa.Integer(), sa.ForeignKey("slots.id"), nullable=False),
        sa.Column("qr_code_token", sa.String(100), nullable=False, unique=True, index=True),
        sa.Column("status", sa.Enum("PENDING", "CHECKED_IN", "EXPIRED", "CANCELLED", name="bookingstatus"), nullable=False),
        sa.Column("created_at", sa.DateTime()), sa.Column("expires_at", sa.DateTime(), nullable=False))
    op.create_table("rfid_cards",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("card_uid", sa.String(50), nullable=False, unique=True, index=True),
        sa.Column("status", sa.String(20)), sa.Column("is_temporary", sa.Boolean()))
    op.create_table("parking_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("card_uid", sa.String(50), nullable=False, index=True),
        sa.Column("booking_id", sa.Integer(), sa.ForeignKey("bookings.id")),
        sa.Column("slot_id", sa.Integer(), sa.ForeignKey("slots.id")),
        sa.Column("time_in", sa.DateTime(), nullable=False), sa.Column("time_out", sa.DateTime()),
        sa.Column("total_fee", sa.Float()),
        sa.Column("payment_status", sa.Enum("UNPAID", "PAID", name="paymentstatus"), nullable=False),
        sa.Column("guard_confirmed", sa.Boolean()), sa.Column("guard_note", sa.String(255)))


def downgrade():
    raise RuntimeError("Automatic downgrade is disabled to protect parking history; restore a backup")
