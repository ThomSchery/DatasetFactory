"""profile_asset_integrity

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-30
"""

from __future__ import annotations

import unicodedata
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine import Connection

revision: str = "0003"
down_revision: str | Sequence[str] | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _normalized_profile_name(name: str) -> str:
    return unicodedata.normalize("NFKC", name.strip()).casefold()


def _require_unique_normalized_profile_names(connection: Connection) -> None:
    profiles = connection.execute(
        sa.text("SELECT id, name FROM game_profiles ORDER BY id")
    ).mappings()
    grouped: dict[str, list[tuple[str, str]]] = {}
    for profile in profiles:
        profile_id = str(profile["id"])
        name = str(profile["name"])
        grouped.setdefault(_normalized_profile_name(name), []).append((profile_id, name))

    collisions = {
        normalized_name: records for normalized_name, records in grouped.items() if len(records) > 1
    }
    if not collisions:
        return

    details = "; ".join(
        f"normalized_name={normalized_name!r}: "
        + ", ".join(f"id={profile_id!r} name={name!r}" for profile_id, name in records)
        for normalized_name, records in sorted(collisions.items())
    )
    raise RuntimeError(
        "profile name normalization collisions must be resolved before migration 0003; "
        f"no schema changes were made; {details}"
    )


def upgrade() -> None:
    connection = op.get_bind()
    _require_unique_normalized_profile_names(connection)

    op.add_column(
        "reference_assets",
        sa.Column("status", sa.String(length=20), nullable=False, server_default="ready"),
    )
    with op.batch_alter_table("reference_assets") as batch_op:
        batch_op.create_check_constraint(
            "ck_reference_asset_status", "status IN ('ready','missing')"
        )

    op.add_column(
        "game_profiles", sa.Column("normalized_name", sa.String(length=200), nullable=True)
    )
    profiles = connection.execute(sa.text("SELECT id, name FROM game_profiles")).mappings()
    for profile in profiles:
        connection.execute(
            sa.text("UPDATE game_profiles SET normalized_name = :normalized_name WHERE id = :id"),
            {
                "id": profile["id"],
                "normalized_name": _normalized_profile_name(str(profile["name"])),
            },
        )
    with op.batch_alter_table("game_profiles") as batch_op:
        batch_op.drop_constraint("uq_game_profiles_name", type_="unique")
        batch_op.alter_column(
            "normalized_name",
            existing_type=sa.String(length=200),
            nullable=False,
        )
        batch_op.create_unique_constraint("uq_game_profiles_normalized_name", ["normalized_name"])

    op.add_column("categories", sa.Column("ordinal", sa.Integer(), nullable=True))
    categories = connection.execute(
        sa.text("SELECT id, profile_id FROM categories ORDER BY profile_id, created_at, id")
    ).mappings()
    next_ordinal: dict[str, int] = {}
    for category in categories:
        profile_id = str(category["profile_id"])
        ordinal = next_ordinal.get(profile_id, 0)
        connection.execute(
            sa.text("UPDATE categories SET ordinal = :ordinal WHERE id = :id"),
            {"id": category["id"], "ordinal": ordinal},
        )
        next_ordinal[profile_id] = ordinal + 1
    with op.batch_alter_table("categories") as batch_op:
        batch_op.alter_column("ordinal", existing_type=sa.Integer(), nullable=False)
        batch_op.create_check_constraint("ck_category_ordinal", "ordinal >= 0")
        batch_op.create_unique_constraint(
            "uq_categories_profile_ordinal", ["profile_id", "ordinal"]
        )


def downgrade() -> None:
    with op.batch_alter_table("categories") as batch_op:
        batch_op.drop_constraint("uq_categories_profile_ordinal", type_="unique")
        batch_op.drop_constraint("ck_category_ordinal", type_="check")
        batch_op.drop_column("ordinal")

    with op.batch_alter_table("game_profiles") as batch_op:
        batch_op.drop_constraint("uq_game_profiles_normalized_name", type_="unique")
        batch_op.create_unique_constraint("uq_game_profiles_name", ["name"])
        batch_op.drop_column("normalized_name")

    with op.batch_alter_table("reference_assets") as batch_op:
        batch_op.drop_constraint("ck_reference_asset_status", type_="check")
        batch_op.drop_column("status")
