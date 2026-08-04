from __future__ import annotations

import shutil
import time
from contextlib import suppress
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

from sqlalchemy import select

from backend.app.access.store.database import Database
from backend.app.access.store.models import Export, ReferenceAsset
from backend.app.access.store.workspace import Workspace, WorkspaceError


@dataclass(frozen=True)
class ReconciliationResult:
    removed_temporary: int
    removed_orphaned: int
    marked_missing: int
    marked_ready: int


@dataclass(frozen=True)
class ExportReconciliationResult:
    removed_temporary: int
    removed_final: int
    failed_interrupted: int


class ExportReconciler:
    """Close process-interrupted exports and remove only their private artifacts."""

    ERROR_CODE = "export_process_interrupted"

    def __init__(self, database: Database, workspace: Workspace) -> None:
        self._database = database
        self._workspace = workspace

    def reconcile(self) -> ExportReconciliationResult:
        exports_path = self._workspace.resolve_relpath("exports")
        with self._database.session() as session:
            interrupted_ids = tuple(
                session.scalars(select(Export.id).where(Export.status.in_(("queued", "running"))))
            )

        removed_temporary = 0
        removed_final = 0
        for export_id in interrupted_ids:
            if not self._is_export_uuid(export_id):
                continue
            prefix = f".{export_id}-"
            for candidate in exports_path.iterdir():
                if candidate.name.startswith(prefix) and self._remove_artifact(candidate):
                    removed_temporary += 1
            final_path = self._workspace.resolve_relpath(Path("exports") / export_id)
            if self._remove_artifact(final_path):
                removed_final += 1

        failed_interrupted = 0
        if interrupted_ids:
            with self._database.session() as session:
                session.connection().exec_driver_sql("BEGIN IMMEDIATE")
                records = session.scalars(
                    select(Export).where(
                        Export.id.in_(interrupted_ids),
                        Export.status.in_(("queued", "running")),
                    )
                )
                for export in records:
                    export.status = "failed"
                    export.error_code = self.ERROR_CODE
                    export.output_relpath = None
                    export.manifest_json = None
                    failed_interrupted += 1

        return ExportReconciliationResult(
            removed_temporary=removed_temporary,
            removed_final=removed_final,
            failed_interrupted=failed_interrupted,
        )

    @staticmethod
    def _is_export_uuid(export_id: str) -> bool:
        try:
            return str(UUID(export_id)) == export_id
        except ValueError:
            return False

    @staticmethod
    def _remove_artifact(path: Path) -> bool:
        try:
            if path.is_symlink() or path.is_file():
                path.unlink()
                return True
            if path.is_dir():
                shutil.rmtree(path)
                return True
        except OSError:
            return False
        return False


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
