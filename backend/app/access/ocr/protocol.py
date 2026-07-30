from __future__ import annotations

from collections.abc import Collection
from pathlib import Path
from typing import Protocol, runtime_checkable

from backend.app.engines.definition.ocr_mapping import OcrCandidate


@runtime_checkable
class OcrEngine(Protocol):
    def detect_characters(
        self,
        crop_relpath: Path,
        allowed_chars: Collection[str],
    ) -> tuple[OcrCandidate, ...]: ...
