"""region_ocr_config

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-22
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from typing import Any

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
        sa.Column("ocr_region_config_json", sa.Text(), nullable=True),
    )
    op.add_column(
        "stage_checkpoints",
        sa.Column("ocr_region_config_json", sa.Text(), nullable=True),
    )
    _materialize_legacy_region_snapshots()
    with op.batch_alter_table("stage_checkpoints", recreate="always") as batch_op:
        batch_op.alter_column("ocr_config_hash", existing_type=sa.String(64), nullable=True)
        batch_op.alter_column(
            "ocr_page_segmentation_mode", existing_type=sa.Integer(), nullable=True
        )
        batch_op.alter_column("ocr_region_config_json", existing_type=sa.Text(), nullable=False)
    with op.batch_alter_table("pipeline_runs", recreate="always") as batch_op:
        batch_op.alter_column("ocr_config_hash", existing_type=sa.String(64), nullable=True)
        batch_op.alter_column(
            "ocr_page_segmentation_mode", existing_type=sa.Integer(), nullable=True
        )
        batch_op.alter_column("ocr_region_config_json", existing_type=sa.Text(), nullable=False)


def downgrade() -> None:
    _restore_legacy_run_level_configuration()
    with op.batch_alter_table("stage_checkpoints", recreate="always") as batch_op:
        batch_op.alter_column("ocr_config_hash", existing_type=sa.String(64), nullable=False)
        batch_op.alter_column(
            "ocr_page_segmentation_mode", existing_type=sa.Integer(), nullable=False
        )
    with op.batch_alter_table("pipeline_runs", recreate="always") as batch_op:
        batch_op.alter_column("ocr_config_hash", existing_type=sa.String(64), nullable=False)
        batch_op.alter_column(
            "ocr_page_segmentation_mode", existing_type=sa.Integer(), nullable=False
        )
    op.drop_column("stage_checkpoints", "ocr_region_config_json")
    op.drop_column("pipeline_runs", "ocr_region_config_json")
    with op.batch_alter_table("hud_regions", recreate="always") as batch_op:
        batch_op.drop_constraint("ck_hud_region_ocr_config_complete", type_="check")
        batch_op.drop_constraint("ck_hud_region_ocr_psm", type_="check")
        batch_op.drop_column("ocr_page_segmentation_mode")
        batch_op.drop_column("ocr_allowed_chars")


def _materialize_legacy_region_snapshots() -> None:
    """Pin 0006 runs to the exact profile-wide OCR configuration they saved."""
    connection = op.get_bind()
    runs = connection.execute(
        sa.text(
            "SELECT id,profile_id,ocr_engine,ocr_engine_version,ocr_runtime_sha256,"
            "ocr_model_sha256,ocr_config_hash,ocr_language,ocr_page_segmentation_mode,"
            "experimental,quality_gate FROM pipeline_runs ORDER BY created_at,id"
        )
    ).mappings()
    for run in runs:
        allowed_chars = "".join(
            connection.execute(
                sa.text(
                    "SELECT name FROM categories "
                    "WHERE profile_id=:profile_id AND kind='character' ORDER BY ordinal"
                ),
                {"profile_id": run["profile_id"]},
            ).scalars()
        )
        provenance = {
            "engine_id": run["ocr_engine"],
            "engine_version": run["ocr_engine_version"],
            "runtime_sha256": run["ocr_runtime_sha256"],
            "model_sha256": run["ocr_model_sha256"],
            "config_hash": run["ocr_config_hash"],
            "experimental": bool(run["experimental"]),
            "quality_gate": run["quality_gate"],
            "language": run["ocr_language"],
            "page_segmentation_mode": run["ocr_page_segmentation_mode"],
        }
        regions = connection.execute(
            sa.text(
                "SELECT id,name FROM hud_regions WHERE profile_id=:profile_id "
                "ORDER BY created_at,id"
            ),
            {"profile_id": run["profile_id"]},
        ).mappings()
        snapshots = [
            {
                "region_id": region["id"],
                "region_name": region["name"],
                "allowed_chars": allowed_chars,
                "page_segmentation_mode": run["ocr_page_segmentation_mode"],
                "uses_profile_fallback": True,
                "provenance": provenance,
            }
            for region in regions
        ]
        document = json.dumps(snapshots, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        connection.execute(
            sa.text("UPDATE pipeline_runs SET ocr_region_config_json=:document WHERE id=:run_id"),
            {"document": document, "run_id": run["id"]},
        )
        connection.execute(
            sa.text(
                "UPDATE stage_checkpoints SET ocr_region_config_json=:document WHERE run_id=:run_id"
            ),
            {"document": document, "run_id": run["id"]},
        )


def _restore_legacy_run_level_configuration() -> None:
    """Restore only runs whose region snapshots fit the older scalar schema."""
    connection = op.get_bind()
    runs = list(
        connection.execute(
            sa.text("SELECT id,ocr_region_config_json FROM pipeline_runs ORDER BY created_at,id")
        ).mappings()
    )

    # SQLite runs Alembic DDL without a transactional safety net. Validate every
    # run before updating even one row so an unrepresentable run cannot leave a
    # partially downgraded database behind.
    restored = [
        (run["id"], *_legacy_configuration_for_run(run["id"], run["ocr_region_config_json"]))
        for run in runs
    ]
    for run_id, config_hash, page_segmentation_mode in restored:
        connection.execute(
            sa.text(
                "UPDATE pipeline_runs SET ocr_config_hash=:config_hash,"
                "ocr_page_segmentation_mode=:psm WHERE id=:run_id"
            ),
            {
                "config_hash": config_hash,
                "psm": page_segmentation_mode,
                "run_id": run_id,
            },
        )
    connection.execute(
        sa.text(
            "UPDATE stage_checkpoints SET "
            "ocr_config_hash=(SELECT ocr_config_hash FROM pipeline_runs "
            "WHERE pipeline_runs.id=stage_checkpoints.run_id),"
            "ocr_page_segmentation_mode=(SELECT ocr_page_segmentation_mode FROM pipeline_runs "
            "WHERE pipeline_runs.id=stage_checkpoints.run_id)"
        )
    )


def _legacy_configuration_for_run(run_id: str, document: str) -> tuple[str, int]:
    try:
        snapshots: Any = json.loads(document)
    except (TypeError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"cannot downgrade OCR run {run_id!r}: invalid region snapshot") from exc
    if not isinstance(snapshots, list) or not snapshots:
        raise RuntimeError(f"cannot downgrade OCR run {run_id!r} without region snapshots")

    configurations: list[tuple[str, str, str, int]] = []
    for index, snapshot in enumerate(snapshots):
        if not isinstance(snapshot, dict):
            raise RuntimeError(
                f"cannot downgrade OCR run {run_id!r}: invalid region snapshot #{index + 1}"
            )
        region_id = snapshot.get("region_id")
        region_name = snapshot.get("region_name")
        provenance = snapshot.get("provenance")
        if (
            not isinstance(region_id, str)
            or not region_id
            or not isinstance(region_name, str)
            or not region_name
            or not isinstance(provenance, dict)
        ):
            raise RuntimeError(
                f"cannot downgrade OCR run {run_id!r}: invalid region snapshot #{index + 1}"
            )
        config_hash = provenance.get("config_hash")
        page_segmentation_mode = provenance.get("page_segmentation_mode")
        if (
            not isinstance(config_hash, str)
            or not config_hash
            or type(page_segmentation_mode) is not int
            or snapshot.get("page_segmentation_mode") != page_segmentation_mode
        ):
            raise RuntimeError(
                f"cannot downgrade OCR run {run_id!r}: invalid provenance for region "
                f"{region_id!r} ({region_name!r})"
            )
        configurations.append((region_id, region_name, config_hash, page_segmentation_mode))

    pairs = {(config_hash, psm) for _, _, config_hash, psm in configurations}
    if len(pairs) != 1:
        regions = ", ".join(
            f"{region_id!r} ({region_name!r}): config_hash={config_hash}, PSM={psm}"
            for region_id, region_name, config_hash, psm in configurations
        )
        raise RuntimeError(
            f"cannot downgrade OCR run {run_id!r}: region configurations differ: {regions}"
        )
    return next(iter(pairs))
