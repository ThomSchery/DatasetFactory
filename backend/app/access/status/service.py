from __future__ import annotations

from dataclasses import dataclass

from backend.app.access.status.probe import OcrDependencyProbe, ProbeResult, ResourceProbe
from backend.app.access.store.database import Database
from backend.app.access.store.workspace import Workspace
from backend.app.config import Settings


@dataclass(frozen=True)
class DependencyStatus:
    name: str
    available: bool
    critical: bool
    detail: str
    code: str


@dataclass(frozen=True)
class SystemStatusSnapshot:
    database: DependencyStatus
    workspace: DependencyStatus
    ffmpeg: DependencyStatus
    ocr: DependencyStatus
    ocr_engine: str
    gpu: DependencyStatus

    @property
    def operational(self) -> bool:
        return self.database.available and self.workspace.available


class SystemStatusAccess:
    """Report critical storage and optional local tooling availability."""

    def __init__(
        self,
        database: Database,
        workspace: Workspace,
        settings: Settings,
        resource_probe: ResourceProbe,
        ocr_probe: OcrDependencyProbe,
    ) -> None:
        self._database = database
        self._workspace = workspace
        self._settings = settings
        self._resource_probe = resource_probe
        self._ocr_probe = ocr_probe

    def snapshot(self) -> SystemStatusSnapshot:
        database_available = self._database.check_health()
        workspace_available = self._workspace.check_writable()
        ffmpeg = self._resource_probe.executable(
            self._settings.ffmpeg_path,
            arguments=("-version",),
            output_marker="ffmpeg version",
            timeout_seconds=self._settings.ffprobe_timeout_seconds,
        )
        ffprobe = self._resource_probe.executable(
            self._settings.ffprobe_path,
            arguments=("-version",),
            output_marker="ffprobe version",
            timeout_seconds=self._settings.ffprobe_timeout_seconds,
        )
        ocr = self._ocr_probe.probe()
        gpu = self._resource_probe.gpu(timeout_seconds=self._settings.ffprobe_timeout_seconds)
        ffmpeg_status = self._combined_ffmpeg_status(ffmpeg, ffprobe)
        return SystemStatusSnapshot(
            database=DependencyStatus(
                "database",
                database_available,
                True,
                "available" if database_available else "unavailable",
                "available" if database_available else "unavailable",
            ),
            workspace=DependencyStatus(
                "workspace",
                workspace_available,
                True,
                "available" if workspace_available else "unavailable",
                "available" if workspace_available else "unavailable",
            ),
            ffmpeg=DependencyStatus(
                "ffmpeg",
                ffmpeg_status.available,
                False,
                ffmpeg_status.detail,
                ffmpeg_status.reason,
            ),
            ocr=DependencyStatus("ocr", ocr.available, False, ocr.detail, ocr.reason),
            ocr_engine=self._ocr_probe.engine_name,
            gpu=DependencyStatus("gpu", gpu.available, False, gpu.detail, gpu.reason),
        )

    @staticmethod
    def _combined_ffmpeg_status(ffmpeg: ProbeResult, ffprobe: ProbeResult) -> ProbeResult:
        if not ffmpeg.available:
            return ProbeResult(
                False,
                f"Stan zdegradowany: FFmpeg jest niedostępny ({ffmpeg.detail}).",
                f"ffmpeg_{ffmpeg.reason}",
            )
        if not ffprobe.available:
            return ProbeResult(
                False,
                f"Stan zdegradowany: ffprobe jest niedostępny ({ffprobe.detail}).",
                f"ffprobe_{ffprobe.reason}",
            )
        return ProbeResult(True, "available")
