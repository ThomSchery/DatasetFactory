from __future__ import annotations

from backend.app.access.ocr.protocol import OcrProcessError
from backend.app.access.ocr.tesseract import TesseractRuntimeIdentity
from backend.app.access.status.probe import ProbeResult, ResourceProbe


class TesseractDependencyProbe:
    """Verify one operator-installed runtime/model pair for system diagnostics."""

    _MISSING_DETAIL = (
        "Stan zdegradowany: brak zweryfikowanej instalacji operatora; "
        "realny OCR jest wyłączony (TD-015)."
    )
    _MISMATCH_DETAIL = (
        "Stan zdegradowany: suma SHA-256 runtime lub modelu jest niezgodna; "
        "realny OCR jest wyłączony (TD-015)."
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

    engine_id = "tesseract"
    engine_name = "Tesseract"
    # Tesseract has to be told how many lines to expect.
    uses_text_layout = True

    def probe(self) -> ProbeResult:
        if not self._runtime.executable.is_file() or not self._runtime.model.is_file():
            return ProbeResult(False, self._MISSING_DETAIL, "missing_installation")
        try:
            self._runtime.verified_hashes(language=self._language)
        except OcrProcessError:
            return ProbeResult(False, self._MISMATCH_DETAIL, "checksum_mismatch")

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
                f"({executable.detail}); realny OCR jest wyłączony (TD-015).",
                f"runtime_{executable.reason}",
            )
        return ProbeResult(True, "Zweryfikowana instalacja operatora (SHA-256).", "verified")
