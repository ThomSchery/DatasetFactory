from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import ClassVar

import pytest

from backend.app.access.status.service import ProbeResult
from backend.app.composition import CompositionRoot, build_composition
from backend.app.config import Settings


class AvailableResourceProbe:
    _EXPECTED: ClassVar[dict[str, tuple[tuple[str, ...], str]]] = {
        "ffmpeg.exe": (("-version",), "ffmpeg version"),
        "ffprobe.exe": (("-version",), "ffprobe version"),
        "tesseract.exe": (("--version",), "tesseract"),
    }

    def executable(
        self,
        path: Path,
        *,
        arguments: tuple[str, ...],
        output_marker: str,
        timeout_seconds: int,
    ) -> ProbeResult:
        del timeout_seconds
        if self._EXPECTED.get(path.name.lower()) != (arguments, output_marker):
            return ProbeResult(False, "unexpected_probe")
        return ProbeResult(True, "stub_available")

    def gpu(self, *, timeout_seconds: int) -> ProbeResult:
        del timeout_seconds
        return ProbeResult(True, "stub_available")


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        workspace_dir=tmp_path / "workspace",
        cache_dir=tmp_path / "cache",
        ffmpeg_path=tmp_path / "tools" / "ffmpeg.exe",
        ffprobe_path=tmp_path / "tools" / "ffprobe.exe",
        tesseract_path=tmp_path / "tools" / "tesseract.exe",
        tesseract_model_path=tmp_path / "tools" / "tessdata" / "eng.traineddata",
    )


@pytest.fixture
def composition(settings: Settings) -> Iterator[CompositionRoot]:
    root = build_composition(settings, resource_probe=AvailableResourceProbe())
    try:
        yield root
    finally:
        root.close()
