from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import Engine, create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker

# SQLite lets one writer in at a time; every other write waits up to this long for
# the lock and then fails with "database is locked". The run worker writes while the
# operator keeps working (deleting another run, saving a review), and a run whose
# write gives up fails. On 2026-11-27, with OCR saturating the CPU, the lock stayed
# taken for about 10 s while the only other write in the log, deleting a run
# (0.2 s on an idle machine), was in flight; 5 s failed the working run. Every
# transaction here is short, so this is time spent behind a slow transaction; a
# lock held for longer still fails the write.
DEFAULT_BUSY_TIMEOUT_MS = 30_000


class Database:
    """Own the SQLite engine and short-lived SQLAlchemy sessions."""

    def __init__(
        self,
        database_url: str,
        *,
        busy_timeout_ms: int = DEFAULT_BUSY_TIMEOUT_MS,
    ) -> None:
        if busy_timeout_ms < 0:
            raise ValueError("busy_timeout_ms must not be negative")
        self._busy_timeout_ms = busy_timeout_ms
        self.engine = create_engine(database_url, future=True)
        self._sessions = sessionmaker(bind=self.engine, expire_on_commit=False)
        event.listen(self.engine, "connect", self._configure_sqlite)

    def _configure_sqlite(self, dbapi_connection: sqlite3.Connection, _: object) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute(f"PRAGMA busy_timeout={int(self._busy_timeout_ms)}")
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
