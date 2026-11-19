"""3-role RBAC hardening + data needed for admin reports.

- users.is_active: admin khóa/mở khóa tài khoản thay vì xóa (giữ lịch sử thu tiền)
- bookings.user_id, bookings.license_plate: gắn vé với tài khoản khách
- parking_sessions.issued_by, confirmed_by: guard nào cấp thẻ / thu tiền
- gate_events: nhật ký thao tác tại cổng (bao gồm override barrier)
"""
from alembic import op
import sqlalchemy as sa

revision = "003_roles_reports"
down_revision = "002_entry_flow"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # Bảng users có thể đã được app cũ tạo bằng create_all trước khi chạy 002.
    user_cols = {c["name"] for c in insp.get_columns("users")}
    if "is_active" not in user_cols:
        with op.batch_alter_table("users") as batch:
            batch.add_column(sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()))

    with op.batch_alter_table("bookings") as batch:
        batch.add_column(sa.Column("user_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("license_plate", sa.String(20), nullable=True))
        batch.create_foreign_key("fk_bookings_user_id", "users", ["user_id"], ["id"])
        batch.create_index("ix_bookings_user_id", ["user_id"])

    with op.batch_alter_table("parking_sessions") as batch:
        batch.add_column(sa.Column("issued_by", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("confirmed_by", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_sessions_issued_by", "users", ["issued_by"], ["id"])
        batch.create_foreign_key("fk_sessions_confirmed_by", "users", ["confirmed_by"], ["id"])
        batch.create_index("ix_sessions_paid_at", ["paid_at"])
        batch.create_index("ix_sessions_time_in", ["time_in"])

    op.create_table(
        "gate_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("source", sa.String(10), nullable=False, server_default="WEB"),
        sa.Column("event_type", sa.String(30), nullable=False),
        sa.Column("gate", sa.String(5), nullable=True),
        sa.Column("card_uid", sa.String(50), nullable=True),
        sa.Column("session_id", sa.Integer(), nullable=True),
        sa.Column("detail", sa.String(255), nullable=True),
    )
    op.create_index("ix_gate_events_id", "gate_events", ["id"])
    op.create_index("ix_gate_events_created_at", "gate_events", ["created_at"])
    op.create_index("ix_gate_events_event_type", "gate_events", ["event_type"])


def downgrade():
    op.drop_table("gate_events")
    with op.batch_alter_table("parking_sessions") as batch:
        batch.drop_index("ix_sessions_time_in")
        batch.drop_index("ix_sessions_paid_at")
        batch.drop_constraint("fk_sessions_confirmed_by", type_="foreignkey")
        batch.drop_constraint("fk_sessions_issued_by", type_="foreignkey")
        batch.drop_column("confirmed_by")
        batch.drop_column("issued_by")
    with op.batch_alter_table("bookings") as batch:
        batch.drop_index("ix_bookings_user_id")
        batch.drop_constraint("fk_bookings_user_id", type_="foreignkey")
        batch.drop_column("license_plate")
        batch.drop_column("user_id")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("is_active")
