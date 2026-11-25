from __future__ import annotations

import logging
import os
import shutil
import time
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

from backend.app.access.store.workspace import Workspace, WorkspaceError

# `tempfile.mkdtemp(prefix=f".{export_id}-")` names an export's staging directory
# (`ExportRepository`): a dot, the 36-character export UUID, a dash, a random tail.
_STAGING_ID = slice(1, 37)


@dataclass(frozen=True)
class RunArtifactRemoval:
    removed: int
    left_behind: tuple[str, ...]


@dataclass(frozen=True)
class RunArtifactSweep:
    removed_runs: int
    removed_exports: int


def _is_uuid(name: str) -> bool:
    try:
        return str(UUID(name)) == name
    except ValueError:
        return False


def _staging_export_id(name: str) -> str | None:
    """The export id a staging entry belongs to, or nothing for any other name."""
    if not name.startswith(".") or len(name) < 39 or name[37] != "-":
        return None
    export_id = name[_STAGING_ID]
    return export_id if _is_uuid(export_id) else None


def _is_link(path: Path) -> bool:
    return path.is_symlink() or path.is_junction()


class RunArtifacts:
    """Own the files a run leaves in the controlled workspace once its rows are gone.

    A run writes only under `runs/<run_id>/` (frames, region crops, checkpoints) and its
    exports only under `exports/<export_id>` plus their `.<export_id>-*` staging entries.
    Removal is best effort after the database commit: Windows can hold a frame image
    open for a moment after it was served, so each entry is retried briefly, and what
    still cannot go is reported and swept on the next start.

    Entries are addressed by name inside the resolved `runs/` and `exports/`
    directories and never resolved themselves: a link or junction standing where a run
    directory should be is removed as a link, so its target is never touched.
    """

    def __init__(
        self,
        workspace: Workspace,
        logger: logging.Logger,
        *,
        attempts: int = 5,
        retry_delay_seconds: float = 0.2,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._workspace = workspace
        self._logger = logger
        self._attempts = max(1, attempts)
        self._retry_delay_seconds = retry_delay_seconds
        self._sleep = sleep

    def remove(self, run_id: str, export_ids: Iterable[str]) -> RunArtifactRemoval:
        candidates: list[Path] = []
        runs_path = self._directory("runs")
        if runs_path is not None and _is_uuid(run_id):
            candidates.append(runs_path / run_id)
        exports_path = self._directory("exports")
        owned_exports = {export_id for export_id in export_ids if _is_uuid(export_id)}
        if exports_path is not None and owned_exports:
            candidates.extend(exports_path / export_id for export_id in sorted(owned_exports))
            candidates.extend(
                entry
                for entry in exports_path.iterdir()
                if _staging_export_id(entry.name) in owned_exports
            )
        removed = 0
        left_behind: list[str] = []
        for candidate in candidates:
            if not self._exists(candidate):
                continue
            if self._remove_with_retry(candidate):
                removed += 1
            else:
                left_behind.append(candidate.relative_to(self._workspace.root).as_posix())
        if left_behind:
            self._logger.warning(
                "run_files_left_behind",
                extra={"run_id": run_id, "paths": left_behind},
            )
        return RunArtifactRemoval(removed=removed, left_behind=tuple(left_behind))

    def sweep_orphans(
        self,
        run_ids: frozenset[str],
        export_ids: frozenset[str],
    ) -> RunArtifactSweep:
        """Remove run and export entries that no database row owns.

        A run row exists before its first file, and an export row before its staging
        directory, and neither is deleted except with the run; so at startup, before
        any worker runs, an entry without a row is what a deleted run left behind.
        Only `runs/<uuid>`, `exports/<uuid>` and `exports/.<uuid>-*` are judged;
        anything else is not ours and stays.
        """
        removed_runs = 0
        runs_path = self._directory("runs")
        if runs_path is not None:
            for entry in runs_path.iterdir():
                if _is_uuid(entry.name) and entry.name not in run_ids and self._remove_once(entry):
                    removed_runs += 1
        removed_exports = 0
        exports_path = self._directory("exports")
        if exports_path is not None:
            for entry in exports_path.iterdir():
                owner = entry.name if _is_uuid(entry.name) else _staging_export_id(entry.name)
                if owner is not None and owner not in export_ids and self._remove_once(entry):
                    removed_exports += 1
        return RunArtifactSweep(removed_runs=removed_runs, removed_exports=removed_exports)

    def _directory(self, relpath: str) -> Path | None:
        try:
            path = self._workspace.resolve_relpath(relpath)
        except WorkspaceError:
            return None
        return path if path.is_dir() else None

    @staticmethod
    def _exists(path: Path) -> bool:
        return _is_link(path) or path.exists()

    def _remove_with_retry(self, path: Path) -> bool:
        for attempt in range(self._attempts):
            if self._remove_once(path):
                return True
            if attempt + 1 < self._attempts:
                self._sleep(self._retry_delay_seconds)
        return False

    @staticmethod
    def _remove_once(path: Path) -> bool:
        try:
            if _is_link(path):
                # The link itself, never what it points at. A directory link or
                # junction on Windows only goes with `rmdir`.
                try:
                    path.unlink()
                except OSError:
                    os.rmdir(path)
            elif path.is_file():
                path.unlink()
            elif path.is_dir():
                # `rmtree` removes links met inside as links (junctions too on 3.8+).
                shutil.rmtree(path)
        except OSError:
            return not RunArtifacts._exists(path)
        return True
