"""Separate authorization, RFID entry, payment and actual exit."""
from alembic import op
import sqlalchemy as sa

revision = "002_entry_flow"
down_revision = "001_legacy"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    # Legacy QR/IN could create duplicate sessions and has no actual-exit signal.
    # Do not guess which active record represents a real vehicle.
    active = bind.execute(sa.text("SELECT COUNT(*) FROM parking_sessions WHERE time_out IS NULL OR payment_status = 'UNPAID'")).scalar()
    if active:
        raise RuntimeError("Legacy active/unpaid sessions exist. Back up and reconcile them in the old version before upgrading; no sessions were auto-closed.")
    duplicate = bind.execute(sa.text("SELECT booking_id FROM parking_sessions WHERE booking_id IS NOT NULL GROUP BY booking_id HAVING COUNT(*) > 1")).first()
    if duplicate:
        raise RuntimeError("Duplicate legacy booking sessions; reconcile before upgrading")
    if bind.dialect.name == "postgresql":
        # A committed enum addition is required before later use on PostgreSQL.
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE bookingstatus ADD VALUE IF NOT EXISTS 'VERIFIED'")
    op.create_table("parking_control", sa.Column("id", sa.Integer(), primary_key=True),
                    sa.Column("revision", sa.Integer(), nullable=False))
    op.execute("INSERT INTO parking_control (id, revision) VALUES (1, 0)")
    op.add_column("slots", sa.Column("physical_occupied", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.execute("UPDATE slots SET physical_occupied = true WHERE status = 'OCCUPIED'")
    with op.batch_alter_table("parking_sessions") as batch:
        batch.add_column(sa.Column("status", sa.String(30), nullable=False, server_default="EXITED"))
        batch.add_column(sa.Column("authorized_until", sa.DateTime()))
        batch.add_column(sa.Column("exit_requested_at", sa.DateTime()))
        batch.add_column(sa.Column("paid_at", sa.DateTime()))
        batch.alter_column("time_in", existing_type=sa.DateTime(), nullable=True)
        batch.alter_column("total_fee", existing_type=sa.Float(), type_=sa.Integer(),
                           postgresql_using="total_fee::integer")
    op.execute("UPDATE parking_sessions SET paid_at = time_out, exit_requested_at = time_out")
    op.create_index("uq_active_card", "parking_sessions", ["card_uid"], unique=True,
                    sqlite_where=sa.text("time_out IS NULL"), postgresql_where=sa.text("time_out IS NULL"))
    op.create_index("uq_active_slot", "parking_sessions", ["slot_id"], unique=True,
                    sqlite_where=sa.text("time_out IS NULL"), postgresql_where=sa.text("time_out IS NULL"))
    op.create_index("uq_session_booking", "parking_sessions", ["booking_id"], unique=True)
    # Repair legacy expired/cancelled holds, without altering occupied slots.
    op.execute("UPDATE slots SET status = 'AVAILABLE' WHERE status = 'RESERVED' AND NOT EXISTS (SELECT 1 FROM bookings WHERE bookings.slot_id = slots.id AND bookings.status = 'PENDING')")
    if not sa.inspect(bind).has_table("users"):
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("email", sa.String(120), nullable=False, unique=True),
            sa.Column("phone", sa.String(20), nullable=False),
            sa.Column("password_hash", sa.String(255), nullable=False),
            sa.Column("role", sa.String(20), nullable=False, server_default="user"),
            sa.Column("created_at", sa.DateTime()),
        )
        op.create_index("ix_users_email", "users", ["email"], unique=True)



def downgrade():
    raise RuntimeError("Automatic downgrade would lose authorization/payment data; restore a backup")
