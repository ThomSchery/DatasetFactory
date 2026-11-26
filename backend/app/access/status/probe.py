from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class ProbeResult:
    """`detail` is the operator text; `code` is the stable machine reason.

    Probes whose detail is already a code (`not_found`, `timeout`) leave `code`
    empty and `reason` falls back to the detail. The UI presents the reason in
    its own language, so it never has to parse the detail text (FE-022 FIX1).
    """

    available: bool
    detail: str
    code: str = ""

    @property
    def reason(self) -> str:
        return self.code or self.detail


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


class OcrDependencyProbe(Protocol):
    """What the system status needs to know about whichever OCR engine is installed.

    Each engine adapter ships its own probe and knows how to verify its own
    installation; the status module only asks for the verdict.
    """

    @property
    def engine_name(self) -> str: ...

    def probe(self) -> ProbeResult: ...
