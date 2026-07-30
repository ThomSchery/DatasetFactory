from __future__ import annotations

import hashlib
import math
import shutil
from pathlib import Path
from typing import Any, Protocol
from uuid import uuid4

from backend.app.access.media.probe import MediaMetadata, MediaProbeError
from backend.app.access.store.repositories.materials import (
    MaterialPage,
    MaterialRecord,
    MaterialRepository,
)
from backend.app.access.store.repositories.projects import ProjectRepository

MAX_VIDEO_BYTES = 50 * 1024**3
MAX_DURATION_MS = 2 * 60 * 60 * 1000
DISK_RESERVE_BYTES = 512 * 1024**2
SUPPORTED_VIDEO_EXTENSIONS = frozenset({".mp4", ".mkv", ".mov"})
SUPPORTED_VIDEO_CONTAINERS = frozenset({"mp4_mov", "matroska"})


class MaterialProbe(Protocol):
    def inspect(self, source: Path) -> MediaMetadata: ...


class DiskSpaceReader(Protocol):
    def available_bytes(self, path: Path) -> int: ...


class SystemDiskSpaceReader:
    def available_bytes(self, path: Path) -> int:
        return shutil.disk_usage(path).free


class MaterialUseCaseError(RuntimeError):
    def __init__(self, code: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.details = details or {}


class MaterialUseCases:
    """Validate local media intake and persist a path-redacted video record."""

    def __init__(
        self,
        media_probe: MaterialProbe,
        disk_space: DiskSpaceReader,
        workspace_root: Path,
        project_repository: ProjectRepository,
        material_repository: MaterialRepository,
    ) -> None:
        self._media_probe = media_probe
        self._disk_space = disk_space
        self._workspace_root = workspace_root
        self._projects = project_repository
        self._materials = material_repository

    def import_material(self, local_path: str) -> MaterialRecord:
        source = Path(local_path)
        if not source.is_absolute():
            raise MaterialUseCaseError("media_path_not_absolute", details={"field": "local_path"})
        if source.suffix.casefold() not in SUPPORTED_VIDEO_EXTENSIONS:
            raise MaterialUseCaseError("unsupported_media", details={"field": "local_path"})
        try:
            initial_stat = source.stat()
        except OSError as exc:
            raise MaterialUseCaseError("source_missing", details={"field": "local_path"}) from exc
        if not source.is_file():
            raise MaterialUseCaseError("source_missing", details={"field": "local_path"})
        if initial_stat.st_size <= 0:
            raise MaterialUseCaseError("invalid_media")
        if initial_stat.st_size > MAX_VIDEO_BYTES:
            raise MaterialUseCaseError("media_too_large")

        try:
            metadata = self._media_probe.inspect(source)
        except MediaProbeError as exc:
            raise MaterialUseCaseError(exc.code) from exc
        if metadata.container not in SUPPORTED_VIDEO_CONTAINERS:
            raise MaterialUseCaseError("unsupported_media")
        if metadata.duration_ms > MAX_DURATION_MS:
            raise MaterialUseCaseError("media_too_long")
        required_bytes = self.required_disk_bytes(metadata)
        if self._disk_space.available_bytes(self._workspace_root) < required_bytes:
            raise MaterialUseCaseError(
                "disk_space",
                details={"required_bytes": required_bytes},
            )
        try:
            verified_stat = source.stat()
        except OSError as exc:
            raise MaterialUseCaseError("source_missing") from exc
        if (
            verified_stat.st_size != initial_stat.st_size
            or verified_stat.st_mtime_ns != initial_stat.st_mtime_ns
        ):
            raise MaterialUseCaseError("source_changed")
        fingerprint = hashlib.sha256(
            f"{verified_stat.st_size}:{verified_stat.st_mtime_ns}".encode()
        ).hexdigest()
        return self._materials.create(
            asset_id=str(uuid4()),
            project_id=self._projects.get_or_create_current_id(),
            local_path=source.resolve(),
            size_bytes=verified_stat.st_size,
            duration_ms=metadata.duration_ms,
            width=metadata.width,
            height=metadata.height,
            fingerprint=fingerprint,
        )

    def list_materials(self, *, page: int, page_size: int) -> MaterialPage:
        return self._materials.list(page=page, page_size=page_size)

    @staticmethod
    def required_disk_bytes(metadata: MediaMetadata) -> int:
        frames_at_one_fps = max(1, math.ceil(metadata.duration_ms / 1000))
        estimated_frame_bytes = min(
            max(metadata.width * metadata.height // 4, 128 * 1024), 4 * 1024**2
        )
        return DISK_RESERVE_BYTES + frames_at_one_fps * estimated_frame_bytes
