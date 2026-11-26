"""region_text_layout

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-26
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | Sequence[str] | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# A region used to store Tesseract's page segmentation mode. It now stores how the text
# sits in the region, in no engine's words; each OCR adapter turns that into whatever its
# engine understands. Modes without a layout of their own take the nearest one.
_LAYOUT_BY_MODE = (
    (3, "auto"),
    (4, "block"),
    (6, "block"),
    (7, "line"),
    (8, "word"),
    (10, "word"),
    (11, "sparse"),
    (12, "sparse"),
    (13, "line"),
)
# Going back, a layout returns to the mode that best stands for it.
_MODE_BY_LAYOUT = (
    ("auto", 3),
    ("line", 7),
    ("word", 8),
    ("block", 6),
    ("sparse", 11),
)


def upgrade() -> None:
    """Replace the region's engine mode with an engine-neutral text layout.

    `NULL` stays `NULL`: a region without its own OCR configuration still inherits
    the profile's, and the adapter reads the missing layout as `auto`. Runs keep the
    mode they actually used — that lives in their provenance and is not rewritten.
    """
    with op.batch_alter_table("hud_regions", recreate="always") as batch_op:
        batch_op.add_column(sa.Column("ocr_text_layout", sa.String(16), nullable=True))
    connection = op.get_bind()
    for mode, layout in _LAYOUT_BY_MODE:
        connection.execute(
            sa.text(
                "UPDATE hud_regions SET ocr_text_layout=:layout "
                "WHERE ocr_page_segmentation_mode=:mode"
            ),
            {"layout": layout, "mode": mode},
        )
    with op.batch_alter_table("hud_regions", recreate="always") as batch_op:
        batch_op.drop_constraint("ck_hud_region_ocr_config_complete", type_="check")
        batch_op.drop_constraint("ck_hud_region_ocr_psm", type_="check")
        batch_op.drop_column("ocr_page_segmentation_mode")
        batch_op.create_check_constraint(
            "ck_hud_region_ocr_layout",
            "ocr_text_layout IS NULL OR ocr_text_layout IN ('auto','line','word','block','sparse')",
        )
        batch_op.create_check_constraint(
            "ck_hud_region_ocr_config_complete",
            "(ocr_allowed_chars IS NULL AND ocr_text_layout IS NULL) OR "
            "(ocr_allowed_chars IS NOT NULL AND length(ocr_allowed_chars) > 0 AND "
            "ocr_text_layout IS NOT NULL)",
        )


def downgrade() -> None:
    with op.batch_alter_table("hud_regions", recreate="always") as batch_op:
        batch_op.add_column(sa.Column("ocr_page_segmentation_mode", sa.Integer(), nullable=True))
    connection = op.get_bind()
    for layout, mode in _MODE_BY_LAYOUT:
        connection.execute(
            sa.text(
                "UPDATE hud_regions SET ocr_page_segmentation_mode=:mode "
                "WHERE ocr_text_layout=:layout"
            ),
            {"layout": layout, "mode": mode},
        )
    with op.batch_alter_table("hud_regions", recreate="always") as batch_op:
        batch_op.drop_constraint("ck_hud_region_ocr_config_complete", type_="check")
        batch_op.drop_constraint("ck_hud_region_ocr_layout", type_="check")
        batch_op.drop_column("ocr_text_layout")
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
