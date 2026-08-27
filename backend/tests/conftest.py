from __future__ import annotations

import hashlib
import shutil
from collections.abc import Iterator
from pathlib import Path
from typing import ClassVar

import pytest

from backend.app.access.status.service import ProbeResult
from backend.app.access.store.migrations import upgrade_database
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
    tesseract_path = tmp_path / "tools" / "tesseract.exe"
    model_path = tmp_path / "tools" / "tessdata" / "eng.traineddata"
    tesseract_path.parent.mkdir(parents=True)
    model_path.parent.mkdir(parents=True)
    tesseract_path.write_bytes(b"fixture tesseract runtime")
    model_path.write_bytes(b"fixture eng model")
    return Settings(
        workspace_dir=tmp_path / "workspace",
        cache_dir=tmp_path / "cache",
        ffmpeg_path=tmp_path / "tools" / "ffmpeg.exe",
        ffprobe_path=tmp_path / "tools" / "ffprobe.exe",
        tesseract_path=tesseract_path,
        tesseract_model_path=model_path,
        tesseract_runtime_sha256=hashlib.sha256(tesseract_path.read_bytes()).hexdigest(),
        tesseract_model_sha256=hashlib.sha256(model_path.read_bytes()).hexdigest(),
    )


@pytest.fixture(scope="session")
def migrated_database_template(tmp_path_factory: pytest.TempPathFactory) -> Path:
    template_root = tmp_path_factory.mktemp("database-template")
    template_settings = Settings(
        workspace_dir=template_root / "workspace",
        cache_dir=template_root / "cache",
    )
    template_settings.workspace_dir.mkdir(parents=True)
    upgrade_database(template_settings)
    return template_settings.database_path


@pytest.fixture
def composition(
    settings: Settings,
    migrated_database_template: Path,
) -> Iterator[CompositionRoot]:
    settings.workspace_dir.mkdir(parents=True)
    shutil.copy2(migrated_database_template, settings.database_path)
    root = build_composition(settings, resource_probe=AvailableResourceProbe())
    try:
        yield root
    finally:
        root.close()
