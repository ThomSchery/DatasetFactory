from __future__ import annotations

import os
import shutil
from collections.abc import Collection
from pathlib import Path

import uvicorn

from backend.app.access.status.service import ProbeResult
from backend.app.composition import build_composition
from backend.app.config import Settings
from backend.app.engines.definition import BBox, OcrCandidate, OcrProvenance
from backend.app.main import create_app


class DeterministicE2eOcrEngine:
    """Deterministic boundary stub; media, workflow, storage and HTTP stay real."""

    def __init__(self) -> None:
        self._provenance = OcrProvenance(
            engine_id="deterministic-e2e",
            engine_version="1",
            runtime_sha256="1" * 64,
            model_sha256="2" * 64,
            config_hash="3" * 64,
            experimental=False,
            quality_gate="passed",
            language="eng",
            page_segmentation_mode=7,
        )

    def describe(self, allowed_chars: Collection[str]) -> OcrProvenance:
        if not allowed_chars:
            raise ValueError("e2e profile must define a character category")
        return self._provenance

    def detect_characters(
        self,
        crop_relpath: Path,
        allowed_chars: Collection[str],
    ) -> tuple[OcrCandidate, ...]:
        del crop_relpath
        character = sorted(allowed_chars)[0]
        return (OcrCandidate(character, BBox(8, 8, 24, 32), 0.99, self._provenance),)

    def cancel_current(self) -> None:
        return None


class AvailableE2eResourceProbe:
    def executable(
        self,
        path: Path,
        *,
        arguments: tuple[str, ...],
        output_marker: str,
        timeout_seconds: int,
    ) -> ProbeResult:
        del path, arguments, output_marker, timeout_seconds
        return ProbeResult(True, "e2e_available")

    def gpu(self, *, timeout_seconds: int) -> ProbeResult:
        del timeout_seconds
        return ProbeResult(True, "e2e_available")


def _runtime_root() -> Path:
    configured = os.environ.get(
        "DATASETFACTORY_E2E_ROOT",
        "D:/DatasetFactory/cache/playwright/runtime",
    )
    root = Path(configured).resolve()
    if root.drive.upper() != "D:" or "playwright" not in {part.casefold() for part in root.parts}:
        raise RuntimeError("DATASETFACTORY_E2E_ROOT must be a dedicated Playwright directory on D:")
    return root


def main() -> None:
    root = _runtime_root()
    if root.exists():
        shutil.rmtree(root)
    root.mkdir(parents=True)
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if ffmpeg is None or ffprobe is None:
        raise RuntimeError("The real E2E backend requires ffmpeg and ffprobe on PATH")
    settings = Settings(
        workspace_dir=root / "workspace",
        cache_dir=root / "cache",
        ffmpeg_path=Path(ffmpeg),
        ffprobe_path=Path(ffprobe),
        tesseract_path=Path("D:/tools/e2e/tesseract.exe"),
        tesseract_model_path=Path("D:/tools/e2e/tessdata/eng.traineddata"),
    )
    composition = build_composition(
        settings,
        resource_probe=AvailableE2eResourceProbe(),
        ocr_engine=DeterministicE2eOcrEngine(),
    )
    try:
        uvicorn.run(
            create_app(settings, composition=composition),
            host=settings.host,
            port=settings.port,
            log_level="warning",
        )
    finally:
        composition.close()


if __name__ == "__main__":
    main()
