from __future__ import annotations

import hashlib
import json
import shutil
from dataclasses import asdict
from pathlib import Path
from typing import Any

import pytest

from backend.app.engines.definition import (
    EVALUATOR_VERSION,
    BBox,
    ExpectedOcrCharacter,
    OcrCandidate,
    OcrEvaluationCrop,
    OcrProvenance,
    OcrQualityThresholds,
    evaluate_ocr,
)

FIXTURES = Path("backend/tests/fixtures")
GROUND_TRUTH_PATH = FIXTURES / "expected-ocr/synthetic-hud.json"
REPORT_PATH = FIXTURES / "expected-ocr/tesseract-5.5.3-evaluation-v2.json"


def _candidate(char: str, bbox: BBox) -> OcrCandidate:
    return OcrCandidate(
        char,
        bbox,
        1.0,
        OcrProvenance(
            "test",
            "1",
            "a" * 64,
            "b" * 64,
            "c" * 64,
            True,
            "failed",
            "eng",
            7,
        ),
    )


def _fixture_manifest(ground_truth_path: Path, fixtures_root: Path) -> dict[str, Any]:
    ground_truth = json.loads(ground_truth_path.read_text(encoding="utf-8"))
    payload = {
        "ground_truth_sha256": hashlib.sha256(ground_truth_path.read_bytes()).hexdigest(),
        "crops": [
            {
                "path": sample["crop"],
                "sha256": hashlib.sha256((fixtures_root / sample["crop"]).read_bytes()).hexdigest(),
            }
            for sample in ground_truth["samples"]
        ],
    }
    canonical = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    return {
        **payload,
        "manifest_sha256": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
    }


def _load_versioned_evaluation() -> tuple[dict[str, Any], tuple[OcrEvaluationCrop, ...]]:
    ground_truth = json.loads(GROUND_TRUTH_PATH.read_text(encoding="utf-8"))
    report = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    runtime = report["runtime"]
    provenance = OcrProvenance(
        engine_id=runtime["engine_id"],
        engine_version=runtime["engine_version"],
        runtime_sha256=runtime["runtime_sha256"],
        model_sha256=runtime["model_sha256"],
        config_hash=runtime["config_hash"],
        experimental=runtime["experimental"],
        quality_gate=runtime["quality_gate"],
        language="eng",
        page_segmentation_mode=7,
    )
    expected_by_id = {sample["id"]: sample for sample in ground_truth["samples"]}
    crops: list[OcrEvaluationCrop] = []
    for observation in report["observations"]:
        expected = expected_by_id[observation["id"]]
        crops.append(
            OcrEvaluationCrop(
                observation["id"],
                tuple(
                    ExpectedOcrCharacter(character["char"], BBox(*character["bbox"]))
                    for character in expected["characters"]
                ),
                tuple(
                    OcrCandidate(
                        character["char"],
                        BBox(*character["bbox"]),
                        character["confidence"],
                        provenance,
                    )
                    for character in observation["characters"]
                ),
            )
        )
    return report, tuple(crops)


def test_versioned_tesseract_observation_recalculates_durable_failed_gate() -> None:
    report, crops = _load_versioned_evaluation()
    thresholds = OcrQualityThresholds(**report["thresholds"])

    result = evaluate_ocr(crops, thresholds)

    assert report["schema_version"] == "tk003-ocr-evaluation-observation-v2"
    assert report["evaluator_version"] == EVALUATOR_VERSION
    assert report["fixture_manifest"] == _fixture_manifest(GROUND_TRUTH_PATH, FIXTURES)
    assert report["expected_quality_gate"] == "failed"
    assert result.quality_gate == "failed"
    assert asdict(result.metrics) == report["evaluation"]["metrics"]
    assert [asdict(check) for check in result.checks] == report["evaluation"]["checks"]
    assert result.metrics.char_accuracy == pytest.approx(0.9322033898)
    assert result.metrics.exact_text_crop_rate == pytest.approx(7 / 11)
    assert result.metrics.iou_minimum == 0.0
    assert result.metrics.iou_p10 < result.metrics.iou_p50
    assert result.metrics.bbox_precision < 1.0
    assert result.metrics.bbox_recall < 1.0


def test_previous_94_34_percent_result_is_unambiguously_failed() -> None:
    provenance = OcrProvenance(
        "tesseract",
        "v5.5.3.20260724",
        "a" * 64,
        "b" * 64,
        "c" * 64,
        True,
        "failed",
        "eng",
        7,
    )
    expected = tuple(ExpectedOcrCharacter("A", BBox(index * 2, 0, 1, 1)) for index in range(53))
    observed = tuple(
        OcrCandidate(
            "A" if index < 50 else "B",
            BBox(index * 2, 0, 1, 1),
            1.0,
            provenance,
        )
        for index in range(53)
    )

    result = evaluate_ocr((OcrEvaluationCrop("legacy-baseline", expected, observed),))

    assert result.metrics.char_accuracy == pytest.approx(50 / 53)
    assert result.metrics.char_accuracy == pytest.approx(0.9434, abs=0.0001)
    assert result.quality_gate == "failed"
    assert next(check for check in result.checks if check.metric == "char_accuracy").passed is False


def test_slash_observation_has_native_box_and_failed_provenance() -> None:
    report, crops = _load_versioned_evaluation()
    ratio = next(crop for crop in crops if crop.crop_id == "ratio")
    slash = next(candidate for candidate in ratio.observed if candidate.char == "/")

    assert slash.bbox_local == BBox(149, 14, 25, 45)
    assert slash.provenance.experimental is True
    assert slash.provenance.quality_gate == "failed"
    assert report["runtime"]["runtime_sha256"] == (
        "c66f0f12ed76f6aa455dac97684bbc86756d6a732380bee09122454cfda3f420"
    )


def test_alignment_uses_highest_total_iou_for_equal_cost_repeated_characters() -> None:
    expected = (
        ExpectedOcrCharacter("A", BBox(0, 0, 5, 5)),
        ExpectedOcrCharacter("A", BBox(10, 0, 5, 5)),
    )
    observed = (
        _candidate("A", BBox(0, 0, 5, 5)),
        _candidate("A", BBox(10, 0, 5, 5)),
        _candidate("A", BBox(20, 0, 5, 5)),
    )

    metrics = evaluate_ocr((OcrEvaluationCrop("repeated-a", expected, observed),)).metrics

    assert metrics.edit_count == 1
    assert metrics.bbox_precision == pytest.approx(2 / 3)
    assert metrics.bbox_recall == 1.0
    assert metrics.iou_minimum == 1.0


@pytest.mark.parametrize(
    ("text", "observed_text", "extra_index"),
    [
        ("77/100", "777/100", 2),
        ("100", "1000", 3),
    ],
)
def test_alignment_maximizes_iou_for_repeated_digits(
    text: str,
    observed_text: str,
    extra_index: int,
) -> None:
    expected = tuple(
        ExpectedOcrCharacter(char, BBox(index * 10, 0, 5, 5)) for index, char in enumerate(text)
    )
    observed_boxes = [BBox(index * 10, 0, 5, 5) for index in range(len(text))]
    observed_boxes.insert(extra_index, BBox(1000, 0, 5, 5))
    observed = tuple(
        _candidate(char, bbox) for char, bbox in zip(observed_text, observed_boxes, strict=True)
    )

    metrics = evaluate_ocr((OcrEvaluationCrop("repeated-digits", expected, observed),)).metrics

    assert metrics.edit_count == 1
    assert metrics.bbox_precision == pytest.approx(len(text) / len(observed_text))
    assert metrics.bbox_recall == 1.0
    assert metrics.iou_minimum == 1.0


def test_fixture_manifest_pins_ground_truth_and_every_referenced_crop(tmp_path: Path) -> None:
    report = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    expected_manifest = _fixture_manifest(GROUND_TRUTH_PATH, FIXTURES)

    assert report["fixture_manifest"] == expected_manifest

    copied_root = tmp_path / "fixtures"
    (copied_root / "expected-ocr").mkdir(parents=True)
    shutil.copy2(GROUND_TRUTH_PATH, copied_root / "expected-ocr/synthetic-hud.json")
    shutil.copytree(FIXTURES / "hud-crops", copied_root / "hud-crops")
    changed_crop = copied_root / report["fixture_manifest"]["crops"][0]["path"]
    changed_crop.write_bytes(changed_crop.read_bytes() + b"tampered")

    changed_manifest = _fixture_manifest(
        copied_root / "expected-ocr/synthetic-hud.json",
        copied_root,
    )
    assert changed_manifest != report["fixture_manifest"]
