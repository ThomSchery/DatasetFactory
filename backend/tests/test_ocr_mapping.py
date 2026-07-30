from __future__ import annotations

from backend.app.engines.definition import (
    BBox,
    DatasetDefinitionEngine,
    OcrCandidate,
    OcrProvenance,
)


def _candidate(char: str, bbox: BBox, confidence: float = 0.9) -> OcrCandidate:
    return OcrCandidate(
        char,
        bbox,
        confidence,
        OcrProvenance(
            "tesseract",
            "5.5.3.20260724",
            "a" * 64,
            "b" * 64,
            "c" * 64,
            True,
            "failed",
            "eng",
            7,
        ),
    )


def test_mapping_translates_local_bbox_and_preserves_provenance() -> None:
    candidate = _candidate("7", BBox(4, 5, 10, 12), 0.75)

    result = DatasetDefinitionEngine().map_ocr_candidates(
        (candidate,),
        region_bbox=BBox(100, 200, 80, 40),
        crop_width=80,
        crop_height=40,
        frame_width=1920,
        frame_height=1080,
        category_ids={"7": "category-seven"},
    )

    assert result.rejected == ()
    assert result.annotations[0].category_id == "category-seven"
    assert result.annotations[0].bbox_global == BBox(104, 205, 10, 12)
    assert result.annotations[0].candidate.provenance == candidate.provenance


def test_mapping_rejects_unknown_invalid_local_and_global_geometry() -> None:
    unknown = _candidate("X", BBox(1, 1, 2, 2))
    local_outside = _candidate("7", BBox(75, 1, 10, 2))
    global_outside = _candidate("7", BBox(1, 1, 2, 2))

    first = DatasetDefinitionEngine().map_ocr_candidates(
        (unknown, local_outside),
        region_bbox=BBox(100, 200, 80, 40),
        crop_width=80,
        crop_height=40,
        frame_width=1920,
        frame_height=1080,
        category_ids={"7": "category-seven"},
    )
    second = DatasetDefinitionEngine().map_ocr_candidates(
        (global_outside,),
        region_bbox=BBox(1919, 1079, 80, 40),
        crop_width=80,
        crop_height=40,
        frame_width=1920,
        frame_height=1080,
        category_ids={"7": "category-seven"},
    )

    assert [item.code for item in first.rejected] == [
        "category_not_allowed",
        "ocr_bbox_out_of_bounds",
    ]
    assert [item.code for item in second.rejected] == ["annotation_out_of_bounds"]


def test_slash_is_a_first_class_mapping_category() -> None:
    candidate = _candidate("/", BBox(12, 14, 18, 38))

    result = DatasetDefinitionEngine().map_ocr_candidates(
        (candidate,),
        region_bbox=BBox(100, 200, 80, 60),
        crop_width=80,
        crop_height=60,
        frame_width=1920,
        frame_height=1080,
        category_ids={"/": "category-slash"},
    )

    assert result.rejected == ()
    assert result.annotations[0].category_id == "category-slash"
    assert result.annotations[0].candidate.provenance.quality_gate == "failed"
