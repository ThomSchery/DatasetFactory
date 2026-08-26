from __future__ import annotations

import hmac
import os
import shutil
import time
from collections.abc import Collection
from pathlib import Path

import uvicorn

from backend.app.access.store.workspace import Workspace
from backend.app.composition import build_composition
from backend.app.config import Settings
from backend.app.engines.definition import BBox, OcrCandidate, OcrProvenance
from backend.app.main import create_app

CONTROL_DIRECTORY = "control"
OCR_ENTERED_MARKER = "ocr-entered"
OCR_HOLD_MARKER = "hold-ocr"
WORKSPACE_UNAVAILABLE_MARKER = "workspace-unavailable"


class DeterministicE2eOcrEngine:
    """Deterministic boundary stub; media, workflow, storage and HTTP stay real."""

    def __init__(self, control_root: Path) -> None:
        self._control_root = control_root
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
        self._control_root.mkdir(parents=True, exist_ok=True)
        (self._control_root / OCR_ENTERED_MARKER).write_text("entered", encoding="utf-8")
        while (self._control_root / OCR_HOLD_MARKER).exists():
            time.sleep(0.05)
        character = sorted(allowed_chars)[0]
        return (OcrCandidate(character, BBox(8, 8, 24, 32), 0.99, self._provenance),)

    def cancel_current(self) -> None:
        return None


class ControllableE2eWorkspace(Workspace):
    """Expose an on-disk negative health probe without changing production code."""

    def __init__(self, delegate: Workspace, control_root: Path) -> None:
        super().__init__(delegate.root, delegate.cache_dir)
        self._control_root = control_root

    def check_writable(self) -> bool:
        if (self._control_root / WORKSPACE_UNAVAILABLE_MARKER).exists():
            return False
        return super().check_writable()


def _runtime_root() -> Path:
    cache_root_value = os.environ.get("DATASETFACTORY_CACHE_ROOT")
    configured = os.environ.get("DATASETFACTORY_E2E_ROOT")
    expected_marker = os.environ.get("DATASETFACTORY_E2E_MARKER_TOKEN")
    if cache_root_value is None or configured is None or expected_marker is None:
        raise RuntimeError("The E2E launcher must provide cache, runtime leaf and marker")

    configured_path = Path(configured)
    if configured_path.is_symlink():
        raise RuntimeError("DATASETFACTORY_E2E_ROOT cannot be a symlink")
    root = configured_path.resolve()
    playwright_root = (Path(cache_root_value).resolve() / "playwright").resolve()
    marker = root / ".datasetfactory-e2e-runtime"
    if (
        root.parent != playwright_root
        or not root.name.startswith("runtime-")
        or not root.is_dir()
        or marker.is_symlink()
        or not marker.is_file()
    ):
        raise RuntimeError("DATASETFACTORY_E2E_ROOT must be a marked launcher-owned leaf")
    if not hmac.compare_digest(marker.read_text(encoding="utf-8"), expected_marker):
        raise RuntimeError("DATASETFACTORY_E2E_ROOT marker does not match this launcher")
    return root


def main() -> None:
    root = _runtime_root()
    control_root = root / CONTROL_DIRECTORY
    control_root.mkdir(parents=True, exist_ok=True)
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if ffmpeg is None or ffprobe is None:
        raise RuntimeError("The real E2E backend requires ffmpeg and ffprobe on PATH")
    settings = Settings().model_copy(
        update={
            "workspace_dir": root / "workspace",
            "cache_dir": root / "cache",
            "ffmpeg_path": Path(ffmpeg),
            "ffprobe_path": Path(ffprobe),
        }
    )
    composition = build_composition(
        settings,
        ocr_engine=DeterministicE2eOcrEngine(control_root),
    )
    composition.system_status._workspace = ControllableE2eWorkspace(
        composition.workspace,
        control_root,
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
