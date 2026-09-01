"""active_profile

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-01
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | Sequence[str] | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # A named table-level FK is required here: SQLAlchemy's SQLite inspector
    # cannot recover ``ondelete`` from an unnamed, column-level REFERENCES
    # clause. Batch mode rebuilds this small table while preserving its rows.
    with op.batch_alter_table("projects", recreate="always") as batch_op:
        batch_op.add_column(sa.Column("active_profile_id", sa.String(36), nullable=True))
        batch_op.create_foreign_key(
            "fk_projects_active_profile_id",
            "game_profiles",
            ["active_profile_id"],
            ["id"],
            ondelete="SET NULL",
        )
    op.create_index(
        "ix_projects_active_profile_id",
        "projects",
        ["active_profile_id"],
    )
    op.execute(
        sa.text(
            "UPDATE projects SET active_profile_id = ("
            "SELECT game_profiles.id FROM game_profiles "
            "WHERE game_profiles.project_id = projects.id "
            "ORDER BY game_profiles.created_at DESC, game_profiles.id DESC LIMIT 1"
            ")"
        )
    )


def downgrade() -> None:
    op.drop_index("ix_projects_active_profile_id", table_name="projects")
    with op.batch_alter_table("projects", recreate="always") as batch_op:
        batch_op.drop_constraint("fk_projects_active_profile_id", type_="foreignkey")
        batch_op.drop_column("active_profile_id")
