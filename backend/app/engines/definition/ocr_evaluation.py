from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from backend.app.engines.definition.engine import BBox
from backend.app.engines.definition.ocr_mapping import OcrCandidate

EVALUATOR_VERSION = "ocr-evaluator-v2"


@dataclass(frozen=True)
class ExpectedOcrCharacter:
    char: str
    bbox: BBox


@dataclass(frozen=True)
class OcrEvaluationCrop:
    crop_id: str
    expected: tuple[ExpectedOcrCharacter, ...]
    observed: tuple[OcrCandidate, ...]


@dataclass(frozen=True)
class OcrQualityThresholds:
    char_accuracy: float = 0.98
    exact_text_crop_rate: float = 0.90
    bbox_precision: float = 0.90
    bbox_recall: float = 0.90
    exact_char_bbox_crop_rate: float = 0.90
    iou_at_0_90_rate: float = 0.90
    bbox_match_iou: float = 0.50
    exact_bbox_iou: float = 0.90


@dataclass(frozen=True)
class OcrQualityCheck:
    metric: str
    value: float
    minimum: float
    passed: bool


@dataclass(frozen=True)
class OcrEvaluationMetrics:
    crop_count: int
    expected_character_count: int
    observed_character_count: int
    edit_count: int
    char_accuracy: float
    exact_text_crop_rate: float
    bbox_precision: float
    bbox_recall: float
    exact_char_bbox_crop_rate: float
    iou_at_0_90_rate: float
    iou_minimum: float
    iou_p10: float
    iou_p25: float
    iou_p50: float
    iou_p75: float
    iou_p90: float


@dataclass(frozen=True)
class OcrEvaluationResult:
    evaluator_version: str
    quality_gate: Literal["passed", "failed"]
    metrics: OcrEvaluationMetrics
    checks: tuple[OcrQualityCheck, ...]


@dataclass(frozen=True)
class _AlignmentResult:
    edit_cost: int
    total_iou: float
    matches: tuple[tuple[int, int, float], ...]


def evaluate_ocr(
    crops: tuple[OcrEvaluationCrop, ...],
    thresholds: OcrQualityThresholds | None = None,
) -> OcrEvaluationResult:
    """Evaluate text and native character geometry without provider dependencies."""
    thresholds = thresholds or OcrQualityThresholds()
    if not crops:
        raise ValueError("at least one OCR evaluation crop is required")
    expected_count = sum(len(crop.expected) for crop in crops)
    observed_count = sum(len(crop.observed) for crop in crops)
    if expected_count == 0:
        raise ValueError("at least one expected OCR character is required")

    edits = 0
    exact_text = 0
    exact_char_bbox = 0
    bbox_true_positives = 0
    expected_ious: list[float] = []
    for crop in crops:
        expected_text = "".join(character.char for character in crop.expected)
        observed_text = "".join(candidate.char for candidate in crop.observed)
        exact_text += expected_text == observed_text

        aligned = _align_same_characters(crop.expected, crop.observed)
        edits += aligned.edit_cost
        iou_by_expected = {
            expected_index: iou for expected_index, _observed_index, iou in aligned.matches
        }
        expected_ious.extend(iou_by_expected.get(index, 0.0) for index in range(len(crop.expected)))
        bbox_true_positives += sum(
            iou >= thresholds.bbox_match_iou for iou in iou_by_expected.values()
        )
        if len(crop.expected) == len(crop.observed) and all(
            expected.char == observed.char
            and _bbox_iou(expected.bbox, observed.bbox_local) >= thresholds.exact_bbox_iou
            for expected, observed in zip(crop.expected, crop.observed, strict=True)
        ):
            exact_char_bbox += 1

    metrics = OcrEvaluationMetrics(
        crop_count=len(crops),
        expected_character_count=expected_count,
        observed_character_count=observed_count,
        edit_count=edits,
        char_accuracy=1.0 - edits / expected_count,
        exact_text_crop_rate=exact_text / len(crops),
        bbox_precision=bbox_true_positives / observed_count if observed_count else 0.0,
        bbox_recall=bbox_true_positives / expected_count,
        exact_char_bbox_crop_rate=exact_char_bbox / len(crops),
        iou_at_0_90_rate=sum(iou >= thresholds.exact_bbox_iou for iou in expected_ious)
        / expected_count,
        iou_minimum=min(expected_ious),
        iou_p10=_percentile(expected_ious, 0.10),
        iou_p25=_percentile(expected_ious, 0.25),
        iou_p50=_percentile(expected_ious, 0.50),
        iou_p75=_percentile(expected_ious, 0.75),
        iou_p90=_percentile(expected_ious, 0.90),
    )
    checks = tuple(
        OcrQualityCheck(metric, value, minimum, value >= minimum)
        for metric, value, minimum in (
            ("char_accuracy", metrics.char_accuracy, thresholds.char_accuracy),
            ("exact_text_crop_rate", metrics.exact_text_crop_rate, thresholds.exact_text_crop_rate),
            ("bbox_precision", metrics.bbox_precision, thresholds.bbox_precision),
            ("bbox_recall", metrics.bbox_recall, thresholds.bbox_recall),
            (
                "exact_char_bbox_crop_rate",
                metrics.exact_char_bbox_crop_rate,
                thresholds.exact_char_bbox_crop_rate,
            ),
            ("iou_at_0_90_rate", metrics.iou_at_0_90_rate, thresholds.iou_at_0_90_rate),
        )
    )
    return OcrEvaluationResult(
        evaluator_version=EVALUATOR_VERSION,
        quality_gate="passed" if all(check.passed for check in checks) else "failed",
        metrics=metrics,
        checks=checks,
    )


def _align_same_characters(
    expected: tuple[ExpectedOcrCharacter, ...],
    observed: tuple[OcrCandidate, ...],
) -> _AlignmentResult:
    rows = len(expected) + 1
    columns = len(observed) + 1
    states = [
        [_AlignmentResult(0, 0.0, ()) for _observed_index in range(columns)]
        for _expected_index in range(rows)
    ]
    for expected_index in range(1, rows):
        previous = states[expected_index - 1][0]
        states[expected_index][0] = _AlignmentResult(previous.edit_cost + 1, 0.0, ())
    for observed_index in range(1, columns):
        previous = states[0][observed_index - 1]
        states[0][observed_index] = _AlignmentResult(previous.edit_cost + 1, 0.0, ())

    for expected_index in range(1, rows):
        for observed_index in range(1, columns):
            expected_character = expected[expected_index - 1]
            observed_candidate = observed[observed_index - 1]
            diagonal = states[expected_index - 1][observed_index - 1]
            if expected_character.char == observed_candidate.char:
                iou = _bbox_iou(expected_character.bbox, observed_candidate.bbox_local)
                diagonal = _AlignmentResult(
                    diagonal.edit_cost,
                    diagonal.total_iou + iou,
                    (*diagonal.matches, (expected_index - 1, observed_index - 1, iou)),
                )
            else:
                diagonal = _AlignmentResult(
                    diagonal.edit_cost + 1,
                    diagonal.total_iou,
                    diagonal.matches,
                )
            deletion = states[expected_index - 1][observed_index]
            deletion = _AlignmentResult(
                deletion.edit_cost + 1,
                deletion.total_iou,
                deletion.matches,
            )
            insertion = states[expected_index][observed_index - 1]
            insertion = _AlignmentResult(
                insertion.edit_cost + 1,
                insertion.total_iou,
                insertion.matches,
            )
            states[expected_index][observed_index] = min(
                (diagonal, deletion, insertion),
                key=lambda result: (
                    result.edit_cost,
                    -result.total_iou,
                    -len(result.matches),
                ),
            )
    return states[-1][-1]


def _bbox_iou(left: BBox, right: BBox) -> float:
    intersection_left = max(left.x, right.x)
    intersection_top = max(left.y, right.y)
    intersection_right = min(left.x + left.width, right.x + right.width)
    intersection_bottom = min(left.y + left.height, right.y + right.height)
    intersection_width = max(0, intersection_right - intersection_left)
    intersection_height = max(0, intersection_bottom - intersection_top)
    intersection = intersection_width * intersection_height
    union = left.width * left.height + right.width * right.height - intersection
    return intersection / union if union > 0 else 0.0


def _percentile(values: list[float], quantile: float) -> float:
    ordered = sorted(values)
    position = (len(ordered) - 1) * quantile
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    fraction = position - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction
