from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal

from backend.app.engines.definition.engine import BBox


@dataclass(frozen=True)
class OcrProvenance:
    engine_id: str
    engine_version: str
    runtime_sha256: str
    model_sha256: str
    config_hash: str
    experimental: bool
    quality_gate: Literal["passed", "failed", "unknown"]
    language: str
    page_segmentation_mode: int


@dataclass(frozen=True)
class OcrCandidate:
    char: str
    bbox_local: BBox
    confidence: float
    provenance: OcrProvenance


@dataclass(frozen=True)
class AnnotationDraft:
    category_id: str
    bbox_global: BBox
    confidence: float
    source: str
    candidate: OcrCandidate


@dataclass(frozen=True)
class RejectedOcrCandidate:
    candidate: OcrCandidate
    code: str


@dataclass(frozen=True)
class OcrMappingResult:
    annotations: tuple[AnnotationDraft, ...]
    rejected: tuple[RejectedOcrCandidate, ...]


def map_ocr_candidates(
    candidates: tuple[OcrCandidate, ...],
    *,
    region_bbox: BBox,
    crop_width: int,
    crop_height: int,
    frame_width: int,
    frame_height: int,
    category_ids: Mapping[str, str],
) -> OcrMappingResult:
    """Validate untrusted OCR observations and translate crop-local geometry."""
    annotations: list[AnnotationDraft] = []
    rejected: list[RejectedOcrCandidate] = []
    for candidate in candidates:
        bbox = candidate.bbox_local
        code: str | None = None
        if len(candidate.char) != 1 or candidate.char not in category_ids:
            code = "category_not_allowed"
        elif not 0.0 <= candidate.confidence <= 1.0:
            code = "invalid_ocr_confidence"
        elif bbox.x < 0 or bbox.y < 0 or bbox.width <= 0 or bbox.height <= 0:
            code = "invalid_ocr_bbox"
        elif bbox.x + bbox.width > crop_width or bbox.y + bbox.height > crop_height:
            code = "ocr_bbox_out_of_bounds"
        else:
            global_bbox = BBox(
                region_bbox.x + bbox.x,
                region_bbox.y + bbox.y,
                bbox.width,
                bbox.height,
            )
            if (
                global_bbox.x < 0
                or global_bbox.y < 0
                or global_bbox.x + global_bbox.width > frame_width
                or global_bbox.y + global_bbox.height > frame_height
            ):
                code = "annotation_out_of_bounds"
            else:
                annotations.append(
                    AnnotationDraft(
                        category_id=category_ids[candidate.char],
                        bbox_global=global_bbox,
                        confidence=candidate.confidence,
                        source="ocr",
                        candidate=candidate,
                    )
                )
        if code is not None:
            rejected.append(RejectedOcrCandidate(candidate, code))
    return OcrMappingResult(tuple(annotations), tuple(rejected))
