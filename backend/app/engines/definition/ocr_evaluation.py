from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from backend.app.engines.definition.engine import BBox
from backend.app.engines.definition.ocr_mapping import OcrCandidate

EVALUATOR_VERSION = "ocr-evaluator-v1"


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
        edits += _edit_distance(expected_text, observed_text)
        exact_text += expected_text == observed_text

        aligned = _align_same_characters(crop.expected, crop.observed)
        iou_by_expected = {expected_index: iou for expected_index, _observed_index, iou in aligned}
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
) -> tuple[tuple[int, int, float], ...]:
    expected_text = "".join(character.char for character in expected)
    observed_text = "".join(candidate.char for candidate in observed)
    rows = len(expected_text) + 1
    columns = len(observed_text) + 1
    costs = [[0] * columns for _ in range(rows)]
    for index in range(rows):
        costs[index][0] = index
    for index in range(columns):
        costs[0][index] = index
    for expected_index in range(1, rows):
        for observed_index in range(1, columns):
            costs[expected_index][observed_index] = min(
                costs[expected_index - 1][observed_index] + 1,
                costs[expected_index][observed_index - 1] + 1,
                costs[expected_index - 1][observed_index - 1]
                + (expected_text[expected_index - 1] != observed_text[observed_index - 1]),
            )

    aligned: list[tuple[int, int, float]] = []
    expected_index = len(expected_text)
    observed_index = len(observed_text)
    while expected_index > 0 or observed_index > 0:
        if (
            expected_index > 0
            and observed_index > 0
            and costs[expected_index][observed_index]
            == costs[expected_index - 1][observed_index - 1]
            + (expected_text[expected_index - 1] != observed_text[observed_index - 1])
        ):
            if expected_text[expected_index - 1] == observed_text[observed_index - 1]:
                aligned.append(
                    (
                        expected_index - 1,
                        observed_index - 1,
                        _bbox_iou(
                            expected[expected_index - 1].bbox,
                            observed[observed_index - 1].bbox_local,
                        ),
                    )
                )
            expected_index -= 1
            observed_index -= 1
        elif expected_index > 0 and costs[expected_index][observed_index] == (
            costs[expected_index - 1][observed_index] + 1
        ):
            expected_index -= 1
        else:
            observed_index -= 1
    aligned.reverse()
    return tuple(aligned)


def _edit_distance(left: str, right: str) -> int:
    previous = list(range(len(right) + 1))
    for left_index, left_char in enumerate(left, start=1):
        current = [left_index]
        for right_index, right_char in enumerate(right, start=1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[right_index] + 1,
                    previous[right_index - 1] + (left_char != right_char),
                )
            )
        previous = current
    return previous[-1]


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
