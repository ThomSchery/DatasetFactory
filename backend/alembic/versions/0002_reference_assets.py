"""reference_assets

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "reference_assets",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("relpath", sa.Text(), nullable=False),
        sa.Column("content_type", sa.String(length=40), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("size_bytes > 0", name="ck_reference_asset_size"),
        sa.CheckConstraint(
            "content_type IN ('image/png','image/jpeg')",
            name="ck_reference_asset_content_type",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("relpath", name="uq_reference_assets_relpath"),
    )
    with op.batch_alter_table("game_profiles") as batch_op:
        batch_op.create_foreign_key(
            "fk_game_profiles_reference_asset_id",
            "reference_assets",
            ["reference_asset_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        batch_op.create_index(
            "ix_game_profiles_reference_asset_id", ["reference_asset_id"], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table("game_profiles") as batch_op:
        batch_op.drop_index("ix_game_profiles_reference_asset_id")
        batch_op.drop_constraint("fk_game_profiles_reference_asset_id", type_="foreignkey")
    op.drop_table("reference_assets")
