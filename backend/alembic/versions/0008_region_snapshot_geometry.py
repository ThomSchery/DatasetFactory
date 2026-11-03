"""region_snapshot_geometry

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-03
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | Sequence[str] | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_GEOMETRY_KEYS = ("x", "y", "width", "height")


def upgrade() -> None:
    """Pin each run to the region geometry it used and allow soft retirement.

    Both halves serve the same rule: editing a profile must not rewrite what an
    earlier run recorded. The backfill copies the geometry that is available
    now, which is the state every reader would have resolved a moment ago — it
    does not invent an unknown past. Retirement keeps a removed region's row, so
    `region_samples` and their OCR observations stay attached to a real
    identifier while the profile stops offering the region to new runs.
    """
    _backfill_region_geometry()
    with op.batch_alter_table("hud_regions", recreate="always") as batch_op:
        batch_op.add_column(sa.Column("retired_at", sa.DateTime(), nullable=True))
        batch_op.drop_constraint("uq_hud_regions_profile_name", type_="unique")
    op.create_index(
        "uq_hud_regions_profile_name_active",
        "hud_regions",
        ["profile_id", "name"],
        unique=True,
        sqlite_where=sa.text("retired_at IS NULL"),
    )
    op.create_index("ix_hud_regions_retired_at", "hud_regions", ["retired_at"])


def downgrade() -> None:
    _require_no_retired_regions()
    op.drop_index("ix_hud_regions_retired_at", table_name="hud_regions")
    op.drop_index("uq_hud_regions_profile_name_active", table_name="hud_regions")
    with op.batch_alter_table("hud_regions", recreate="always") as batch_op:
        batch_op.drop_column("retired_at")
        batch_op.create_unique_constraint("uq_hud_regions_profile_name", ["profile_id", "name"])
    _strip_region_geometry()


def _backfill_region_geometry() -> None:
    connection = op.get_bind()
    geometry = {
        row["id"]: {key: int(row[key]) for key in _GEOMETRY_KEYS}
        for row in connection.execute(
            sa.text("SELECT id,x,y,width,height FROM hud_regions")
        ).mappings()
    }
    # SQLite gives Alembic no transactional safety net, so every document is
    # validated before a single row is written. A run whose snapshot names a
    # region that no longer exists cannot be migrated truthfully, and stopping
    # here keeps the database on 0007 instead of half-upgraded.
    updates = [
        (table, key_column, key, _with_geometry(table, key_column, key, document, geometry))
        for table, key_column, key, document in _documents(connection)
    ]
    for table, key_column, key, document in updates:
        _write_document(connection, table, key_column, key, document)


def _strip_region_geometry() -> None:
    connection = op.get_bind()
    for table, key_column, key, document in _documents(connection):
        snapshots = _snapshots(table, key, document)
        for snapshot in snapshots:
            for geometry_key in _GEOMETRY_KEYS:
                snapshot.pop(geometry_key, None)
        _write_document(connection, table, key_column, key, _encode(snapshots))


def _write_document(
    connection: sa.Connection,
    table: str,
    key_column: str,
    key: str,
    document: str,
) -> None:
    # The table and column names come from this module's own two literals, never
    # from data; the values themselves travel as bound parameters.
    statement = sa.text(
        f"UPDATE {table} SET ocr_region_config_json=:document WHERE {key_column}=:key"
    )
    connection.execute(statement, {"document": document, "key": key})


def _documents(connection: sa.Connection) -> list[tuple[str, str, str, str]]:
    runs = [
        ("pipeline_runs", "id", row["id"], row["ocr_region_config_json"])
        for row in connection.execute(
            sa.text("SELECT id,ocr_region_config_json FROM pipeline_runs ORDER BY created_at,id")
        ).mappings()
    ]
    # One document per run covers its checkpoints too: 0007 wrote the same
    # payload to every checkpoint of a run, and nothing since diverges them.
    checkpoints = [
        ("stage_checkpoints", "run_id", row["run_id"], row["ocr_region_config_json"])
        for row in connection.execute(
            sa.text(
                "SELECT run_id,MIN(ocr_region_config_json) AS ocr_region_config_json "
                "FROM stage_checkpoints GROUP BY run_id ORDER BY run_id"
            )
        ).mappings()
    ]
    return runs + checkpoints


def _with_geometry(
    table: str,
    key_column: str,
    key: str,
    document: str,
    geometry: dict[str, dict[str, int]],
) -> str:
    snapshots = _snapshots(table, key, document)
    for snapshot in snapshots:
        region_id = snapshot.get("region_id")
        if not isinstance(region_id, str) or region_id not in geometry:
            raise RuntimeError(
                f"cannot upgrade {table}.{key_column}={key!r}: region {region_id!r} is gone, "
                "so the geometry this run used cannot be recovered"
            )
        snapshot.update(geometry[region_id])
    return _encode(snapshots)


def _snapshots(table: str, key: str, document: str) -> list[dict[str, Any]]:
    try:
        payload: Any = json.loads(document)
    except (TypeError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"cannot migrate {table} row {key!r}: invalid region snapshot") from exc
    if not isinstance(payload, list) or any(not isinstance(item, dict) for item in payload):
        raise RuntimeError(f"cannot migrate {table} row {key!r}: invalid region snapshot")
    return list(payload)


def _encode(snapshots: list[dict[str, Any]]) -> str:
    return json.dumps(snapshots, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _require_no_retired_regions() -> None:
    connection = op.get_bind()
    retired = connection.execute(
        sa.text(
            "SELECT id,name FROM hud_regions WHERE retired_at IS NOT NULL ORDER BY created_at,id"
        )
    ).mappings()
    blocking = [f"{row['id']!r} ({row['name']!r})" for row in retired]
    if blocking:
        raise RuntimeError(
            "cannot downgrade: retired HUD regions have no representation before 0008 and "
            "dropping them would orphan their samples: " + ", ".join(blocking)
        )
