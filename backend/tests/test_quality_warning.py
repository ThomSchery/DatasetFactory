"""The warning a run carries comes from what the engine reports, never from its name."""

from __future__ import annotations

import pytest

from backend.app.engines.definition import OcrProvenance
from backend.app.managers.workflow.manager import quality_warning


def _provenance(
    *, engine_id: str, experimental: bool, quality_gate: str = "failed"
) -> OcrProvenance:
    return OcrProvenance(
        engine_id=engine_id,
        engine_version="1",
        runtime_sha256="1" * 64,
        model_sha256="2" * 64,
        config_hash="3" * 64,
        experimental=experimental,
        quality_gate=quality_gate,  # type: ignore[arg-type]
        language="eng",
        page_segmentation_mode=7,
    )


@pytest.mark.parametrize("engine_id", ["tesseract", "some-other-engine"])
def test_a_failed_gate_names_the_engine_the_run_reports(engine_id: str) -> None:
    warning = quality_warning(_provenance(engine_id=engine_id, experimental=True))

    assert engine_id in warning
    assert "bramki jakości" in warning
    assert warning.startswith("Eksperymentalny silnik OCR")


def test_a_failed_gate_without_the_experimental_flag_is_not_called_experimental() -> None:
    warning = quality_warning(_provenance(engine_id="engine", experimental=False))

    assert warning.startswith("Silnik OCR (engine)")


def test_a_passed_gate_of_a_stable_engine_carries_no_warning() -> None:
    assert (
        quality_warning(_provenance(engine_id="engine", experimental=False, quality_gate="passed"))
        == ""
    )
