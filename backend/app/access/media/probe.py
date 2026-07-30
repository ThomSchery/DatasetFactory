from __future__ import annotations

import json
import os
import signal
import subprocess
from collections.abc import Callable
from contextlib import suppress
from dataclasses import dataclass
from pathlib import Path
from typing import Any, ClassVar, Protocol, cast


class MediaProbeError(RuntimeError):
    """A sanitized ffprobe failure identified by a stable code."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class ProcessResult:
    returncode: int
    stdout: str


@dataclass(frozen=True)
class MediaMetadata:
    duration_ms: int
    width: int
    height: int
    container: str


class CommandRunner(Protocol):
    def run(self, arguments: list[str], *, timeout_seconds: int) -> ProcessResult: ...


class ProcessTreeRunner:
    """Run a bounded subprocess and terminate its process tree on timeout."""

    def __init__(self, *, cleanup_timeout_seconds: int = 2) -> None:
        self._cleanup_timeout_seconds = cleanup_timeout_seconds

    def run(self, arguments: list[str], *, timeout_seconds: int) -> ProcessResult:
        creation_flags = 0
        start_new_session = os.name != "nt"
        if os.name == "nt":
            creation_flags = subprocess.CREATE_NEW_PROCESS_GROUP
        try:
            process = subprocess.Popen(
                arguments,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                creationflags=creation_flags,
                start_new_session=start_new_session,
            )
        except OSError as exc:
            raise MediaProbeError("ffprobe_unavailable") from exc
        try:
            stdout, _ = process.communicate(timeout=timeout_seconds)
        except subprocess.TimeoutExpired as exc:
            self._terminate_tree(process)
            try:
                process.communicate(timeout=self._cleanup_timeout_seconds)
            except subprocess.TimeoutExpired:
                self._close_pipes(process)
            raise MediaProbeError("ffprobe_timeout") from exc
        return ProcessResult(process.returncode, stdout)

    @staticmethod
    def _terminate_tree(process: subprocess.Popen[str]) -> None:
        if os.name == "nt":
            with suppress(OSError, subprocess.TimeoutExpired):
                subprocess.run(
                    ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    check=False,
                    timeout=5,
                )
            with suppress(OSError):
                process.kill()
            return
        with suppress(ProcessLookupError):
            kill_process_group = cast(Callable[[int, int], None], os.__dict__["killpg"])
            kill_process_group(process.pid, int(getattr(signal, "SIGKILL", signal.SIGTERM)))

    @staticmethod
    def _close_pipes(process: subprocess.Popen[str]) -> None:
        for stream in (process.stdout, process.stderr):
            if stream is not None:
                with suppress(OSError):
                    stream.close()


class FfprobeMediaProbe:
    """Extract duration and primary video dimensions from real ffprobe JSON."""

    _CONTAINER_ALIASES: ClassVar[dict[str, frozenset[str]]] = {
        "mp4_mov": frozenset({"mov", "mp4", "m4a", "3gp", "3g2", "mj2"}),
        "matroska": frozenset({"matroska", "webm"}),
    }

    def __init__(self, executable: Path, timeout_seconds: int, runner: CommandRunner) -> None:
        self._executable = executable
        self._timeout_seconds = timeout_seconds
        self._runner = runner

    def inspect(self, source: Path) -> MediaMetadata:
        result = self._runner.run(
            [
                str(self._executable),
                "-v",
                "error",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                str(source),
            ],
            timeout_seconds=self._timeout_seconds,
        )
        if result.returncode != 0:
            raise MediaProbeError("invalid_media")
        try:
            payload: dict[str, Any] = json.loads(result.stdout)
            streams = payload.get("streams")
            if not isinstance(streams, list):
                raise ValueError
            video = next(
                stream
                for stream in streams
                if isinstance(stream, dict) and stream.get("codec_type") == "video"
            )
            format_data = payload.get("format")
            if not isinstance(format_data, dict):
                raise ValueError
            duration_value = format_data.get("duration") or video.get("duration")
            if duration_value is None:
                raise ValueError
            duration_ms = round(float(duration_value) * 1000)
            width = int(video["width"])
            height = int(video["height"])
            container = self._canonical_container(str(format_data["format_name"]))
        except (KeyError, StopIteration, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise MediaProbeError("invalid_media_metadata") from exc
        if duration_ms <= 0 or width <= 0 or height <= 0:
            raise MediaProbeError("invalid_media_metadata")
        return MediaMetadata(
            duration_ms=duration_ms,
            width=width,
            height=height,
            container=container,
        )

    @classmethod
    def _canonical_container(cls, format_name: str) -> str:
        aliases = frozenset(part.strip().casefold() for part in format_name.split(",") if part)
        if not aliases:
            raise ValueError
        matches = [
            canonical
            for canonical, recognized in cls._CONTAINER_ALIASES.items()
            if aliases & recognized
        ]
        if len(matches) > 1:
            raise ValueError
        return matches[0] if matches else sorted(aliases)[0]
