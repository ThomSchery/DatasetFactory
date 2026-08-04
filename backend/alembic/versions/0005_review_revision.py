"""review_revision

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-04
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | Sequence[str] | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "pipeline_runs",
        sa.Column("review_revision", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "pipeline_runs",
        sa.Column("recovery_skipped_frames", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column("exports", sa.Column("error_code", sa.String(length=100), nullable=True))
    op.create_index(
        "uq_exports_active_run",
        "exports",
        ["run_id"],
        unique=True,
        sqlite_where=sa.text("status IN ('queued','running')"),
    )


def downgrade() -> None:
    op.drop_index("uq_exports_active_run", table_name="exports")
    op.drop_column("exports", "error_code")
    op.drop_column("pipeline_runs", "recovery_skipped_frames")
    op.drop_column("pipeline_runs", "review_revision")
