from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config

from backend.app.config import Settings


def alembic_config(settings: Settings) -> Config:
    backend_dir = Path(__file__).resolve().parents[3]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))
    config.attributes["settings"] = settings
    return config


def upgrade_database(settings: Settings) -> None:
    command.upgrade(alembic_config(settings), "head")
