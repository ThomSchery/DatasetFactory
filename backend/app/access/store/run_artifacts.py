from __future__ import annotations

import logging
import shutil
import time
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

from backend.app.access.store.workspace import Workspace, WorkspaceError


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


class RunArtifacts:
    """Own the files a run leaves in the controlled workspace once its rows are gone.

    A run writes only under `runs/<run_id>/` (frames, region crops, checkpoints) and its
    exports only under `exports/<export_id>` plus their `.<export_id>-*` staging entries.
    Removal is best effort after the database commit: Windows can hold a frame image
    open for a moment after it was served, so each entry is retried briefly, and what
    still cannot go is reported and swept on the next start.
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
        if _is_uuid(run_id):
            candidates.extend(self._controlled(Path("runs") / run_id))
        exports_path = self._exports_path()
        for export_id in export_ids:
            if not _is_uuid(export_id):
                continue
            candidates.extend(self._controlled(Path("exports") / export_id))
            if exports_path is not None:
                prefix = f".{export_id}-"
                candidates.extend(
                    entry for entry in exports_path.iterdir() if entry.name.startswith(prefix)
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
        """Remove UUID-named run and export entries that no database row owns.

        Only a deleted run leaves such an entry, because a run row exists before its
        first file and an export row is never deleted on its own. Anything not named by
        a UUID is not ours to judge and stays.
        """
        removed_runs = self._sweep("runs", run_ids)
        removed_exports = self._sweep("exports", export_ids)
        return RunArtifactSweep(removed_runs=removed_runs, removed_exports=removed_exports)

    def _sweep(self, directory: str, known: frozenset[str]) -> int:
        try:
            root = self._workspace.resolve_relpath(directory)
        except WorkspaceError:
            return 0
        if not root.is_dir():
            return 0
        removed = 0
        for entry in root.iterdir():
            if not _is_uuid(entry.name) or entry.name in known:
                continue
            if self._remove_once(entry):
                removed += 1
        return removed

    def _exports_path(self) -> Path | None:
        try:
            path = self._workspace.resolve_relpath("exports")
        except WorkspaceError:
            return None
        return path if path.is_dir() else None

    def _controlled(self, relpath: Path) -> tuple[Path, ...]:
        try:
            return (self._workspace.resolve_relpath(relpath),)
        except WorkspaceError:
            return ()

    @staticmethod
    def _exists(path: Path) -> bool:
        return path.is_symlink() or path.exists()

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
            if path.is_symlink() or path.is_file():
                path.unlink()
            elif path.is_dir():
                shutil.rmtree(path)
        except OSError:
            return not (path.is_symlink() or path.exists())
        return True
