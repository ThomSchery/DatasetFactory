from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import Engine, create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker


class Database:
    """Own the SQLite engine and short-lived SQLAlchemy sessions."""

    def __init__(self, database_url: str) -> None:
        self.engine = create_engine(database_url, future=True)
        self._sessions = sessionmaker(bind=self.engine, expire_on_commit=False)
        event.listen(self.engine, "connect", self._configure_sqlite)

    @staticmethod
    def _configure_sqlite(dbapi_connection: sqlite3.Connection, _: object) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

    @contextmanager
    def session(self) -> Iterator[Session]:
        session = self._sessions()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def check_health(self) -> bool:
        try:
            with self.engine.connect() as connection:
                connection.execute(text("SELECT 1"))
        except Exception:
            return False
        return True

    def dispose(self) -> None:
        self.engine.dispose()


def sqlite_pragmas(engine: Engine) -> tuple[int, str]:
    """Expose active safety pragmas for verification and diagnostics."""
    with engine.connect() as connection:
        foreign_keys = int(connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one())
        journal_mode = str(connection.exec_driver_sql("PRAGMA journal_mode").scalar_one())
    return foreign_keys, journal_mode
