from __future__ import annotations

import os
import shutil
import tempfile
from contextlib import suppress
from dataclasses import dataclass
from pathlib import Path

from backend.app.access.store.workspace import Workspace


class ReferenceAssetWriteError(RuntimeError):
    pass


@dataclass
class StagedReferenceAsset:
    asset_id: str
    size_bytes: int
    _temporary_path: Path
    _references_path: Path
    relpath: str = ""
    content_type: str = ""
    _final_path: Path | None = None
    _published: bool = False

    @property
    def temporary_path(self) -> Path:
        return self._temporary_path

    def configure(self, *, extension: str, content_type: str) -> None:
        self.relpath = f"assets/references/{self.asset_id}{extension}"
        self.content_type = content_type
        self._final_path = self._references_path / f"{self.asset_id}{extension}"

    def publish(self) -> None:
        if self._final_path is None or not self.relpath or not self.content_type:
            raise ReferenceAssetWriteError("reference_asset_not_verified")
        try:
            os.replace(self._temporary_path, self._final_path)
        except OSError as exc:
            raise ReferenceAssetWriteError("reference_asset_copy_failed") from exc
        self._published = True

    def discard(self) -> None:
        with suppress(OSError):
            self._temporary_path.unlink(missing_ok=True)
        if self._final_path is not None:
            with suppress(OSError):
                self._final_path.unlink(missing_ok=True)


class ReferenceAssetStore:
    """Stage reference images on the destination volume for atomic publication."""

    def __init__(self, workspace: Workspace) -> None:
        self._workspace = workspace

    def stage(
        self,
        source: Path,
        *,
        asset_id: str,
    ) -> StagedReferenceAsset:
        references_path = self._workspace.resolve_relpath("assets/references")
        descriptor = -1
        temporary_name = ""
        try:
            descriptor, temporary_name = tempfile.mkstemp(
                prefix=f".{asset_id}-", suffix=".tmp", dir=references_path
            )
            with source.open("rb") as source_stream, os.fdopen(descriptor, "wb") as target_stream:
                descriptor = -1
                shutil.copyfileobj(source_stream, target_stream, length=1024 * 1024)
                target_stream.flush()
                os.fsync(target_stream.fileno())
            temporary_path = Path(temporary_name)
            size_bytes = temporary_path.stat().st_size
            if size_bytes <= 0:
                raise OSError("empty reference asset")
        except OSError as exc:
            if descriptor >= 0:
                os.close(descriptor)
            if temporary_name:
                Path(temporary_name).unlink(missing_ok=True)
            raise ReferenceAssetWriteError("reference_asset_copy_failed") from exc
        return StagedReferenceAsset(
            asset_id=asset_id,
            size_bytes=size_bytes,
            _temporary_path=temporary_path,
            _references_path=references_path,
        )
