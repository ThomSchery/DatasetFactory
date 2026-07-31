"""durable_workflow

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-31
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine import Connection

revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_AFFECTED_TABLES = ("pipeline_runs", "stage_checkpoints", "ocr_observations")


def _require_migratable_workflow_data(connection: Connection) -> None:
    """Fail before DDL when pre-TK-004 rows cannot receive truthful provenance."""
    counts = {
        table: int(connection.execute(sa.text(f"SELECT count(*) FROM {table}")).scalar_one())
        for table in _AFFECTED_TABLES
    }
    if not any(counts.values()):
        return
    details = ", ".join(f"{table}={count}" for table, count in counts.items())
    raise RuntimeError(
        "pre-TK-004 workflow rows have no verifiable OCR provenance and must be "
        "removed or migrated explicitly before migration 0004; no schema changes "
        f"were made; {details}"
    )


def upgrade() -> None:
    connection = op.get_bind()
    _require_migratable_workflow_data(connection)

    run_columns = (
        sa.Column("current_stage", sa.String(length=40), nullable=True),
        sa.Column("current_frame_index", sa.Integer(), nullable=True),
        sa.Column("control_requested", sa.String(length=20), nullable=True),
        sa.Column("ocr_engine", sa.String(length=100), nullable=False),
        sa.Column("ocr_engine_version", sa.String(length=100), nullable=False),
        sa.Column("ocr_runtime_sha256", sa.String(length=64), nullable=False),
        sa.Column("ocr_model_sha256", sa.String(length=64), nullable=False),
        sa.Column("ocr_config_hash", sa.String(length=64), nullable=False),
        sa.Column("ocr_language", sa.String(length=40), nullable=False),
        sa.Column("ocr_page_segmentation_mode", sa.Integer(), nullable=False),
        sa.Column("experimental", sa.Boolean(), nullable=False),
        sa.Column("quality_gate", sa.String(length=20), nullable=False),
        sa.Column("warning", sa.Text(), nullable=False),
    )
    for column in run_columns:
        op.add_column("pipeline_runs", column)
    with op.batch_alter_table("pipeline_runs") as batch_op:
        batch_op.create_check_constraint(
            "ck_pipeline_control_requested",
            "control_requested IS NULL OR control_requested IN ('pause','cancel')",
        )
        batch_op.create_check_constraint(
            "ck_pipeline_quality_gate",
            "quality_gate IN ('passed','failed','unknown')",
        )
    op.create_index(
        "uq_pipeline_runs_single_running",
        "pipeline_runs",
        ["status"],
        unique=True,
        sqlite_where=sa.text("status = 'running'"),
    )

    checkpoint_columns = (
        sa.Column("ocr_engine", sa.String(length=100), nullable=False),
        sa.Column("ocr_engine_version", sa.String(length=100), nullable=False),
        sa.Column("ocr_runtime_sha256", sa.String(length=64), nullable=False),
        sa.Column("ocr_model_sha256", sa.String(length=64), nullable=False),
        sa.Column("ocr_config_hash", sa.String(length=64), nullable=False),
        sa.Column("ocr_language", sa.String(length=40), nullable=False),
        sa.Column("ocr_page_segmentation_mode", sa.Integer(), nullable=False),
        sa.Column("experimental", sa.Boolean(), nullable=False),
        sa.Column("quality_gate", sa.String(length=20), nullable=False),
        sa.Column("warning", sa.Text(), nullable=False),
    )
    for column in checkpoint_columns:
        op.add_column("stage_checkpoints", column)
    with op.batch_alter_table("stage_checkpoints") as batch_op:
        batch_op.create_check_constraint(
            "ck_checkpoint_quality_gate",
            "quality_gate IN ('passed','failed','unknown')",
        )

    observation_columns = (
        sa.Column("runtime_sha256", sa.String(length=64), nullable=False),
        sa.Column("model_sha256", sa.String(length=64), nullable=False),
        sa.Column("language", sa.String(length=40), nullable=False),
        sa.Column("page_segmentation_mode", sa.Integer(), nullable=False),
        sa.Column("experimental", sa.Boolean(), nullable=False),
        sa.Column("quality_gate", sa.String(length=20), nullable=False),
        sa.Column("warning", sa.Text(), nullable=False),
    )
    for column in observation_columns:
        op.add_column("ocr_observations", column)
    with op.batch_alter_table("ocr_observations") as batch_op:
        batch_op.create_check_constraint(
            "ck_ocr_quality_gate",
            "quality_gate IN ('passed','failed','unknown')",
        )


def downgrade() -> None:
    with op.batch_alter_table("ocr_observations") as batch_op:
        batch_op.drop_constraint("ck_ocr_quality_gate", type_="check")
        for column in (
            "warning",
            "quality_gate",
            "experimental",
            "page_segmentation_mode",
            "language",
            "model_sha256",
            "runtime_sha256",
        ):
            batch_op.drop_column(column)

    with op.batch_alter_table("stage_checkpoints") as batch_op:
        batch_op.drop_constraint("ck_checkpoint_quality_gate", type_="check")
        for column in (
            "warning",
            "quality_gate",
            "experimental",
            "ocr_page_segmentation_mode",
            "ocr_language",
            "ocr_config_hash",
            "ocr_model_sha256",
            "ocr_runtime_sha256",
            "ocr_engine_version",
            "ocr_engine",
        ):
            batch_op.drop_column(column)

    op.drop_index("uq_pipeline_runs_single_running", table_name="pipeline_runs")
    with op.batch_alter_table("pipeline_runs") as batch_op:
        batch_op.drop_constraint("ck_pipeline_quality_gate", type_="check")
        batch_op.drop_constraint("ck_pipeline_control_requested", type_="check")
        for column in (
            "warning",
            "quality_gate",
            "experimental",
            "ocr_page_segmentation_mode",
            "ocr_language",
            "ocr_config_hash",
            "ocr_model_sha256",
            "ocr_runtime_sha256",
            "ocr_engine_version",
            "ocr_engine",
            "control_requested",
            "current_frame_index",
            "current_stage",
        ):
            batch_op.drop_column(column)
