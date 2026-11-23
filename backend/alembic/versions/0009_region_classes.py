"""region_classes

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-23
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime
from uuid import uuid4

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | Sequence[str] | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Give every active HUD region a class of its own name (FE-026).

    From this revision on the repository keeps that rule on every write. Regions
    drawn before it — on a real profile, `kill`, `score_left` and `score_right`
    — never got their class, so the operator could not draw them by hand where
    OCR missed them. The backfill applies the same rule the repository does:
    names fold with `strip().casefold()`, a region whose name already is a class
    of either kind adds nothing, and new classes are `game` classes appended
    after the profile's highest ordinal, so no exported class identifier moves.
    A profile that gained a class gets a new version, because its definition
    did change and an editor still holding the old one must reload.
    """
    connection = op.get_bind()
    # The text SQLAlchemy's SQLite `DateTime` stores and parses; binding a
    # `datetime` here would go through sqlite3's deprecated default adapter.
    stamp = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S.%f")
    profile_ids = connection.execute(
        sa.text("SELECT id FROM game_profiles ORDER BY created_at,id")
    ).scalars()
    for profile_id in list(profile_ids):
        taken = {
            _folded(name)
            for name in connection.execute(
                sa.text("SELECT name FROM categories WHERE profile_id=:profile_id"),
                {"profile_id": profile_id},
            ).scalars()
        }
        missing: list[str] = []
        for name in connection.execute(
            sa.text(
                "SELECT name FROM hud_regions "
                "WHERE profile_id=:profile_id AND retired_at IS NULL "
                # Regions of one profile were inserted in one flush and share a
                # timestamp; `rowid` keeps the order they were defined in, while
                # `id` would order them by a random UUID.
                "ORDER BY created_at,rowid"
            ),
            {"profile_id": profile_id},
        ).scalars():
            key = _folded(name)
            if key in taken:
                continue
            taken.add(key)
            missing.append(name.strip())
        if not missing:
            continue
        current_max = connection.execute(
            sa.text("SELECT MAX(ordinal) FROM categories WHERE profile_id=:profile_id"),
            {"profile_id": profile_id},
        ).scalar()
        ordinal = (current_max if current_max is not None else -1) + 1
        for name in missing:
            connection.execute(
                sa.text(
                    "INSERT INTO categories "
                    "(id,profile_id,name,kind,ordinal,created_at,updated_at) "
                    "VALUES (:id,:profile_id,:name,'game',:ordinal,:stamp,:stamp)"
                ),
                {
                    "id": str(uuid4()),
                    "profile_id": profile_id,
                    "name": name,
                    "ordinal": ordinal,
                    "stamp": stamp,
                },
            )
            ordinal += 1
        connection.execute(
            sa.text(
                "UPDATE game_profiles SET version=version+1, updated_at=:stamp WHERE id=:profile_id"
            ),
            {"profile_id": profile_id, "stamp": stamp},
        )


def downgrade() -> None:
    """Keep the classes.

    The schema is unchanged, and once the operator has drawn boxes under a
    backfilled class it is indistinguishable from one they created — deleting
    it would be refused by `annotations.category_id` (RESTRICT) or would take
    review work with it. 0008 reads these rows like any other class.
    """


def _folded(name: str) -> str:
    return name.strip().casefold()
