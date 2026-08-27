from __future__ import annotations

from collections.abc import Collection
from pathlib import Path
from typing import Protocol, runtime_checkable

from backend.app.engines.definition.ocr_mapping import OcrCandidate, OcrProvenance


class OcrProcessError(RuntimeError):
    """Sanitized OCR infrastructure failure with explicit retry semantics."""

    def __init__(self, code: str, *, retryable: bool = False) -> None:
        super().__init__(code)
        self.code = code
        self.retryable = retryable


@runtime_checkable
class OcrEngine(Protocol):
    def describe(self, allowed_chars: Collection[str]) -> OcrProvenance: ...

    def detect_characters(
        self,
        crop_relpath: Path,
        allowed_chars: Collection[str],
    ) -> tuple[OcrCandidate, ...]: ...

    def cancel_current(self) -> None: ...
