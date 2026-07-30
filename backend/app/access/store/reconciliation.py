from __future__ import annotations

import time
from contextlib import suppress
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select

from backend.app.access.store.database import Database
from backend.app.access.store.models import ReferenceAsset
from backend.app.access.store.workspace import Workspace, WorkspaceError


@dataclass(frozen=True)
class ReconciliationResult:
    removed_temporary: int
    removed_orphaned: int
    marked_missing: int
    marked_ready: int


class ReferenceAssetReconciler:
    """Reconcile crash windows between SQLite commits and atomic file publication."""

    def __init__(
        self,
        database: Database,
        workspace: Workspace,
        *,
        temporary_stale_seconds: int = 300,
    ) -> None:
        self._database = database
        self._workspace = workspace
        self._temporary_stale_seconds = temporary_stale_seconds

    def reconcile(self, *, now: float | None = None) -> ReconciliationResult:
        references_path = self._workspace.resolve_relpath("assets/references")
        cutoff = (time.time() if now is None else now) - self._temporary_stale_seconds
        removed_temporary = self._remove_stale_temporary(references_path, cutoff)
        marked_missing = 0
        marked_ready = 0
        committed_paths: set[Path] = set()

        with self._database.session() as session:
            for asset in session.scalars(select(ReferenceAsset)):
                path = self._safe_final_path(asset.relpath, references_path)
                exists = path is not None and path.is_file()
                if path is not None:
                    committed_paths.add(path)
                expected_status = "ready" if exists else "missing"
                if asset.status != expected_status:
                    asset.status = expected_status
                    if expected_status == "ready":
                        marked_ready += 1
                    else:
                        marked_missing += 1

        removed_orphaned = 0
        for candidate in references_path.iterdir():
            if not candidate.is_file() or candidate.name.endswith(".tmp"):
                continue
            if candidate.resolve() not in committed_paths:
                with suppress(OSError):
                    candidate.unlink()
                    removed_orphaned += 1
        return ReconciliationResult(
            removed_temporary=removed_temporary,
            removed_orphaned=removed_orphaned,
            marked_missing=marked_missing,
            marked_ready=marked_ready,
        )

    def _safe_final_path(self, relpath: str, references_path: Path) -> Path | None:
        try:
            path = self._workspace.resolve_relpath(relpath)
        except WorkspaceError:
            return None
        if path.parent != references_path or path.suffix.casefold() not in {".png", ".jpg"}:
            return None
        return path

    @staticmethod
    def _remove_stale_temporary(references_path: Path, cutoff: float) -> int:
        removed = 0
        for candidate in references_path.glob("*.tmp"):
            try:
                if candidate.is_file() and candidate.stat().st_mtime <= cutoff:
                    candidate.unlink()
                    removed += 1
            except OSError:
                continue
        return removed
