"""region_ocr_config

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-22
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | Sequence[str] | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # NULL is an intentional compatibility state for regions created before
    # TK-011. Runtime resolution then uses the same profile-wide whitelist and
    # adapter default PSM as the old code, preserving recognition exactly.
    with op.batch_alter_table("hud_regions", recreate="always") as batch_op:
        batch_op.add_column(sa.Column("ocr_allowed_chars", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("ocr_page_segmentation_mode", sa.Integer(), nullable=True))
        batch_op.create_check_constraint(
            "ck_hud_region_ocr_psm",
            "ocr_page_segmentation_mode IS NULL OR "
            "ocr_page_segmentation_mode IN (3,4,6,7,8,10,11,12,13)",
        )
        batch_op.create_check_constraint(
            "ck_hud_region_ocr_config_complete",
            "(ocr_allowed_chars IS NULL AND ocr_page_segmentation_mode IS NULL) OR "
            "(ocr_allowed_chars IS NOT NULL AND length(ocr_allowed_chars) > 0 AND "
            "ocr_page_segmentation_mode IS NOT NULL)",
        )
    op.add_column(
        "pipeline_runs",
        sa.Column(
            "ocr_region_config_json",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
    )
    op.add_column(
        "stage_checkpoints",
        sa.Column(
            "ocr_region_config_json",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("stage_checkpoints", "ocr_region_config_json")
    op.drop_column("pipeline_runs", "ocr_region_config_json")
    with op.batch_alter_table("hud_regions", recreate="always") as batch_op:
        batch_op.drop_constraint("ck_hud_region_ocr_config_complete", type_="check")
        batch_op.drop_constraint("ck_hud_region_ocr_psm", type_="check")
        batch_op.drop_column("ocr_page_segmentation_mode")
        batch_op.drop_column("ocr_allowed_chars")
