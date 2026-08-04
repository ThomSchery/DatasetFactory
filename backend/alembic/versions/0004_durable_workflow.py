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

from backend.app.access.store.migrations import SchemaUpgradeBlockedError

revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_AFFECTED_TABLES = ("pipeline_runs", "stage_checkpoints", "ocr_observations")

# Backfilling provenance would fabricate the very hashes TK-004 exists to guarantee
# (CONTEXT NFR-09: a new project has no legacy data), so the migration refuses instead.
# This is the removal path, ordered so every foreign key is satisfied on the way down:
# annotations -> observations -> samples -> frames, then checkpoints and exports
# before the runs they point at.
_CLEANUP_STATEMENTS = (
    "DELETE FROM annotations;",
    "DELETE FROM ocr_observations;",
    "DELETE FROM region_samples;",
    "DELETE FROM frames;",
    "DELETE FROM stage_checkpoints;",
    "DELETE FROM exports;",
    "DELETE FROM pipeline_runs;",
)


def _require_migratable_workflow_data(connection: Connection) -> None:
    """Fail before DDL when pre-TK-004 rows cannot receive truthful provenance."""
    counts = {
        table: int(connection.execute(sa.text(f"SELECT count(*) FROM {table}")).scalar_one())
        for table in _AFFECTED_TABLES
    }
    if not any(counts.values()):
        return
    details = ", ".join(f"{table}={count}" for table, count in counts.items())
    cleanup = "\n".join(("PRAGMA foreign_keys=ON;", "BEGIN;", *_CLEANUP_STATEMENTS, "COMMIT;"))
    raise SchemaUpgradeBlockedError(
        "pre-TK-004 workflow rows have no verifiable OCR provenance and must be "
        "removed before migration 0004; no schema changes were made; "
        f"{details}\n"
        "Back the project up, then remove the legacy workflow data in this order "
        f"(foreign keys require it):\n{cleanup}"
    )


def upgrade() -> None:
    connection = op.get_bind()
    _require_migratable_workflow_data(connection)

    run_columns = (
        sa.Column("current_stage", sa.String(length=40), nullable=True),
        sa.Column("current_frame_index", sa.Integer(), nullable=True),
        sa.Column("control_requested", sa.String(length=20), nullable=True),
        sa.Column("workflow_slot", sa.Integer(), nullable=True),
        sa.Column("resume_token", sa.String(length=36), nullable=True),
        sa.Column("resume_owner", sa.String(length=36), nullable=True),
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
            "ck_pipeline_workflow_slot",
            "(workflow_slot IS NULL AND status != 'running' AND "
            "resume_token IS NULL AND resume_owner IS NULL) OR "
            "(workflow_slot = 1 AND ((status = 'running' AND "
            "resume_token IS NULL AND resume_owner IS NULL) OR "
            "(status IN ('paused','failed','cancelled') AND "
            "resume_token IS NOT NULL AND resume_owner IS NOT NULL)))",
        )
        batch_op.create_check_constraint(
            "ck_pipeline_quality_gate",
            "quality_gate IN ('passed','failed','unknown')",
        )
    op.create_index(
        "uq_pipeline_runs_global_workflow_slot",
        "pipeline_runs",
        ["workflow_slot"],
        unique=True,
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

    op.drop_index("uq_pipeline_runs_global_workflow_slot", table_name="pipeline_runs")
    with op.batch_alter_table("pipeline_runs") as batch_op:
        batch_op.drop_constraint("ck_pipeline_quality_gate", type_="check")
        batch_op.drop_constraint("ck_pipeline_workflow_slot", type_="check")
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
            "resume_owner",
            "resume_token",
            "workflow_slot",
            "control_requested",
            "current_frame_index",
            "current_stage",
        ):
            batch_op.drop_column(column)
