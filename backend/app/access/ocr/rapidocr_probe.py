from __future__ import annotations

from backend.app.access.ocr.protocol import OcrProcessError
from backend.app.access.ocr.rapidocr import RapidOcrRuntimeIdentity
from backend.app.access.status.probe import ProbeResult


class RapidOcrDependencyProbe:
    """Verify the operator-installed library and weights for system diagnostics."""

    engine_id = "rapidocr"
    engine_name = "RapidOCR"
    # The engine finds the text itself, so the operator's text layout means nothing to it.
    uses_text_layout = False

    _MISSING_DETAIL = (
        "Stan zdegradowany: brak zweryfikowanej instalacji operatora (biblioteka lub modele); "
        "realny OCR jest wyłączony (TD-015)."
    )
    _MISMATCH_DETAIL = (
        "Stan zdegradowany: wersja biblioteki, runtime lub suma SHA-256 modeli jest niezgodna; "
        "realny OCR jest wyłączony (TD-015)."
    )

    def __init__(self, runtime: RapidOcrRuntimeIdentity) -> None:
        self._runtime = runtime

    def probe(self) -> ProbeResult:
        try:
            self._runtime.verified()
        except OcrProcessError as error:
            if error.code == "ocr_provenance_mismatch":
                return ProbeResult(False, self._MISMATCH_DETAIL, "checksum_mismatch")
            return ProbeResult(False, self._MISSING_DETAIL, "missing_installation")
        return ProbeResult(True, "Zweryfikowana instalacja operatora (SHA-256).", "verified")
