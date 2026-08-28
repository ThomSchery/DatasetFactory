from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from backend.app.access.ocr import OcrProcessError, TesseractRuntimeIdentity
from backend.app.access.store.database import Database
from backend.app.access.store.workspace import Workspace
from backend.app.config import Settings


@dataclass(frozen=True)
class ProbeResult:
    available: bool
    detail: str


class ResourceProbe(Protocol):
    def executable(
        self,
        path: Path,
        *,
        arguments: tuple[str, ...],
        output_marker: str,
        timeout_seconds: int,
    ) -> ProbeResult: ...

    def gpu(self, *, timeout_seconds: int) -> ProbeResult: ...


class SystemResourceProbe:
    """Check configured local executables without invoking application workloads."""

    def executable(
        self,
        path: Path,
        *,
        arguments: tuple[str, ...],
        output_marker: str,
        timeout_seconds: int,
    ) -> ProbeResult:
        if not path.is_file():
            return ProbeResult(False, "not_found")
        try:
            completed = subprocess.run(
                [str(path), *arguments],
                capture_output=True,
                check=False,
                text=True,
                timeout=timeout_seconds,
            )
        except subprocess.TimeoutExpired:
            return ProbeResult(False, "timeout")
        except OSError:
            return ProbeResult(False, "unavailable")
        if completed.returncode != 0:
            return ProbeResult(False, "error")
        output = f"{completed.stdout}\n{completed.stderr}".casefold()
        if output_marker.casefold() not in output:
            return ProbeResult(False, "unexpected_output")
        return ProbeResult(True, "available")

    def gpu(self, *, timeout_seconds: int) -> ProbeResult:
        executable = shutil.which("nvidia-smi")
        if executable is None:
            return ProbeResult(False, "not_found")
        try:
            completed = subprocess.run(
                [executable, "--query-gpu=name", "--format=csv,noheader"],
                capture_output=True,
                check=False,
                text=True,
                timeout=timeout_seconds,
            )
        except subprocess.TimeoutExpired:
            return ProbeResult(False, "timeout")
        except OSError:
            return ProbeResult(False, "unavailable")
        return ProbeResult(
            completed.returncode == 0, "available" if completed.returncode == 0 else "error"
        )


class TesseractDependencyProbe:
    """Verify one operator-installed runtime/model pair for system diagnostics."""

    _MISSING_DETAIL = (
        "Stan zdegradowany: brak zweryfikowanej instalacji operatora; "
        "realny OCR jest wylaczony (TD-015)."
    )
    _MISMATCH_DETAIL = (
        "Stan zdegradowany: suma SHA-256 runtime lub modelu jest niezgodna; "
        "realny OCR jest wylaczony (TD-015)."
    )

    def __init__(
        self,
        runtime: TesseractRuntimeIdentity,
        resource_probe: ResourceProbe,
        *,
        timeout_seconds: int,
        language: str = "eng",
    ) -> None:
        self._runtime = runtime
        self._resource_probe = resource_probe
        self._timeout_seconds = timeout_seconds
        self._language = language

    def probe(self) -> ProbeResult:
        if not self._runtime.executable.is_file() or not self._runtime.model.is_file():
            return ProbeResult(False, self._MISSING_DETAIL)
        try:
            self._runtime.verified_hashes(language=self._language)
        except OcrProcessError:
            return ProbeResult(False, self._MISMATCH_DETAIL)

        executable = self._resource_probe.executable(
            self._runtime.executable,
            arguments=("--version",),
            output_marker="tesseract",
            timeout_seconds=self._timeout_seconds,
        )
        if not executable.available:
            return ProbeResult(
                False,
                "Stan zdegradowany: zweryfikowany runtime nie odpowiada "
                f"({executable.detail}); realny OCR jest wylaczony (TD-015).",
            )
        return ProbeResult(True, "Zweryfikowana instalacja operatora (SHA-256).")


@dataclass(frozen=True)
class DependencyStatus:
    name: str
    available: bool
    critical: bool
    detail: str


@dataclass(frozen=True)
class SystemStatusSnapshot:
    database: DependencyStatus
    workspace: DependencyStatus
    ffmpeg: DependencyStatus
    tesseract: DependencyStatus
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
        tesseract_probe: TesseractDependencyProbe,
    ) -> None:
        self._database = database
        self._workspace = workspace
        self._settings = settings
        self._resource_probe = resource_probe
        self._tesseract_probe = tesseract_probe

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
        tesseract = self._tesseract_probe.probe()
        gpu = self._resource_probe.gpu(timeout_seconds=self._settings.ffprobe_timeout_seconds)
        ffmpeg_status = self._combined_ffmpeg_status(ffmpeg, ffprobe)
        return SystemStatusSnapshot(
            database=DependencyStatus(
                "database",
                database_available,
                True,
                "available" if database_available else "unavailable",
            ),
            workspace=DependencyStatus(
                "workspace",
                workspace_available,
                True,
                "available" if workspace_available else "unavailable",
            ),
            ffmpeg=DependencyStatus("ffmpeg", ffmpeg_status.available, False, ffmpeg_status.detail),
            tesseract=DependencyStatus("tesseract", tesseract.available, False, tesseract.detail),
            gpu=DependencyStatus("gpu", gpu.available, False, gpu.detail),
        )

    @staticmethod
    def _combined_ffmpeg_status(ffmpeg: ProbeResult, ffprobe: ProbeResult) -> ProbeResult:
        if not ffmpeg.available:
            return ProbeResult(
                False,
                f"Stan zdegradowany: FFmpeg jest niedostepny ({ffmpeg.detail}).",
            )
        if not ffprobe.available:
            return ProbeResult(
                False,
                f"Stan zdegradowany: ffprobe jest niedostepny ({ffprobe.detail}).",
            )
        return ProbeResult(True, "available")
