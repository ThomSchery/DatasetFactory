from __future__ import annotations

import os
import tempfile
from pathlib import Path, PurePath


class WorkspaceError(RuntimeError):
    """Raised when the controlled workspace cannot be used safely."""


class Workspace:
    """Own controlled project directories and confine stored relative paths."""

    _DIRECTORIES = (
        "assets/references",
        "runs",
        "exports",
        "logs",
    )

    def __init__(self, root: Path, cache_dir: Path) -> None:
        self.root = root.resolve()
        self.cache_dir = cache_dir.resolve()

    def prepare(self) -> None:
        try:
            self.root.mkdir(parents=True, exist_ok=True)
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            for relpath in self._DIRECTORIES:
                (self.root / relpath).mkdir(parents=True, exist_ok=True)
            self._assert_writable(self.root)
            self._assert_writable(self.cache_dir)
        except OSError as exc:
            raise WorkspaceError("workspace or cache directory is not writable") from exc

    def resolve_relpath(self, relpath: str | PurePath) -> Path:
        candidate_relpath = Path(relpath)
        if candidate_relpath.is_absolute() or candidate_relpath.drive:
            raise WorkspaceError("controlled artifact path must be relative")
        candidate = (self.root / candidate_relpath).resolve()
        if not candidate.is_relative_to(self.root):
            raise WorkspaceError("controlled artifact path escapes workspace")
        return candidate

    def check_writable(self) -> bool:
        try:
            self._assert_writable(self.root)
        except OSError:
            return False
        return True

    @staticmethod
    def _assert_writable(path: Path) -> None:
        descriptor, probe_name = tempfile.mkstemp(prefix=".df-write-", dir=path)
        os.close(descriptor)
        Path(probe_name).unlink()
