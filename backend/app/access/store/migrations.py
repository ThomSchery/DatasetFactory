from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config

from backend.app.config import Settings


class SchemaUpgradeBlockedError(RuntimeError):
    """A migration refused to run because the existing data cannot be migrated truthfully.

    Carries the remediation path in its message so the refusal is actionable instead of
    being an unhandled crash during application startup.
    """

    def __init__(self, message: str, *, code: str = "schema_upgrade_blocked") -> None:
        super().__init__(message)
        self.code = code


def alembic_config(settings: Settings) -> Config:
    backend_dir = Path(__file__).resolve().parents[3]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))
    config.attributes["settings"] = settings
    return config


def upgrade_database(settings: Settings) -> None:
    command.upgrade(alembic_config(settings), "head")
