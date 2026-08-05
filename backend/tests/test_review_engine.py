from __future__ import annotations

import pytest

from backend.app.engines.review import (
    AnnotationReviewEngine,
    AnnotationSnapshot,
    FrameReviewSnapshot,
    ReviewBBox,
    ReviewValidationError,
)


def snapshot(
    *,
    review_status: str = "pending",
    annotations: tuple[AnnotationSnapshot, ...] | None = None,
) -> FrameReviewSnapshot:
    return FrameReviewSnapshot(
        id="frame",
        width=100,
        height=50,
        review_status=review_status,  # type: ignore[arg-type]
        version=3,
        annotations=annotations
        if annotations is not None
        else (AnnotationSnapshot("annotation", "zero", ReviewBBox(1, 2, 3, 4), "proposed", 2),),
    )


def test_class_correction_and_tombstone_are_immutable_transitions() -> None:
    engine = AnnotationReviewEngine()
    original = snapshot()

    corrected = engine.correct_class(
        original,
        annotation_id="annotation",
        category_id="one",
        allowed_categories=frozenset({"zero", "one"}),
    )
    deleted = engine.tombstone(corrected, annotation_id="annotation")

    assert original.annotations[0].category_id == "zero"
    assert original.annotations[0].version == 2
    assert corrected.annotations[0].category_id == "one"
    assert corrected.annotations[0].version == 3
    assert deleted.annotations[0].status == "deleted"
    assert deleted.annotations[0].version == 4


def test_manual_annotation_and_overlapping_geometry_are_allowed() -> None:
    engine = AnnotationReviewEngine()
    original = snapshot()

    created = engine.add_annotation(
        original,
        annotation_id="manual",
        category_id="one",
        bbox=ReviewBBox(2, 3, 10, 10),
        allowed_categories=frozenset({"zero", "one"}),
    )
    overlapping = engine.add_annotation(
        created,
        annotation_id="manual-overlap",
        category_id="one",
        bbox=ReviewBBox(3, 4, 10, 10),
        allowed_categories=frozenset({"zero", "one"}),
    )

    assert original.version == 3
    assert created.version == 4
    assert overlapping.version == 5
    assert overlapping.annotations[-2:] == (
        AnnotationSnapshot("manual", "one", ReviewBBox(2, 3, 10, 10), "proposed", 1),
        AnnotationSnapshot("manual-overlap", "one", ReviewBBox(3, 4, 10, 10), "proposed", 1),
    )


def test_geometry_edit_and_out_of_bounds_geometry_validation() -> None:
    engine = AnnotationReviewEngine()
    changed = engine.edit_annotation(
        snapshot(),
        annotation_id="annotation",
        category_id=None,
        bbox=ReviewBBox(10, 11, 12, 13),
        allowed_categories=frozenset({"zero"}),
    )

    assert changed.annotations[0].bbox == ReviewBBox(10, 11, 12, 13)
    assert changed.annotations[0].version == 3

    with pytest.raises(ReviewValidationError, match="bbox_invalid"):
        engine.add_annotation(
            snapshot(),
            annotation_id="outside",
            category_id="zero",
            bbox=ReviewBBox(99, 49, 2, 2),
            allowed_categories=frozenset({"zero"}),
        )

    with pytest.raises(ReviewValidationError, match="empty_patch"):
        engine.edit_annotation(
            snapshot(),
            annotation_id="annotation",
            category_id=None,
            bbox=None,
            allowed_categories=frozenset({"zero"}),
        )


def test_accept_requires_active_annotation_and_marks_snapshot_accepted() -> None:
    engine = AnnotationReviewEngine()
    accepted = engine.review_frame(
        snapshot(),
        decision="accept",
        allowed_categories=frozenset({"zero"}),
    )
    assert accepted.review_status == "accepted"
    assert accepted.version == 4
    assert accepted.annotations[0].status == "accepted"

    with pytest.raises(ReviewValidationError, match="no_annotations"):
        engine.review_frame(
            snapshot(
                annotations=(
                    AnnotationSnapshot("annotation", "zero", ReviewBBox(1, 2, 3, 4), "deleted", 2),
                )
            ),
            decision="accept",
            allowed_categories=frozenset({"zero"}),
        )


def test_reopen_only_rejected_and_decided_frames_lock_mutations() -> None:
    engine = AnnotationReviewEngine()
    rejected = engine.review_frame(
        snapshot(),
        decision="reject",
        allowed_categories=frozenset({"zero"}),
    )
    assert rejected.review_status == "rejected"
    assert rejected.version == 4

    reopened = engine.review_frame(
        rejected,
        decision="reopen",
        allowed_categories=frozenset({"zero"}),
    )
    assert reopened.review_status == "pending"
    assert reopened.version == 5
    assert reopened.annotations == rejected.annotations

    with pytest.raises(ReviewValidationError, match="invalid_review_transition"):
        engine.review_frame(
            snapshot(),
            decision="reopen",
            allowed_categories=frozenset({"zero"}),
        )

    for locked_status in ("accepted", "rejected"):
        with pytest.raises(ReviewValidationError, match="review_locked"):
            engine.tombstone(
                snapshot(review_status=locked_status),
                annotation_id="annotation",
            )

    with pytest.raises(ReviewValidationError, match="review_locked"):
        engine.review_frame(
            snapshot(review_status="accepted"),
            decision="reopen",
            allowed_categories=frozenset({"zero"}),
        )


def test_category_outside_profile_is_rejected() -> None:
    with pytest.raises(ReviewValidationError, match="category_not_allowed"):
        AnnotationReviewEngine().correct_class(
            snapshot(),
            annotation_id="annotation",
            category_id="foreign",
            allowed_categories=frozenset({"zero"}),
        )


@pytest.mark.parametrize(
    "bbox,valid",
    [
        (ReviewBBox(0, 0, 1, 1), True),
        (ReviewBBox(99, 49, 1, 1), True),
        (ReviewBBox(-1, 0, 1, 1), False),
        (ReviewBBox(0, -1, 1, 1), False),
        (ReviewBBox(0, 0, 0, 1), False),
        (ReviewBBox(0, 0, 1, 0), False),
        (ReviewBBox(99, 49, 2, 1), False),
        (ReviewBBox(99, 49, 1, 2), False),
    ],
)
def test_bbox_validation_boundaries(bbox: ReviewBBox, valid: bool) -> None:
    if valid:
        AnnotationReviewEngine.validate_bbox(bbox, frame_width=100, frame_height=50)
    else:
        with pytest.raises(ReviewValidationError, match="bbox_invalid"):
            AnnotationReviewEngine.validate_bbox(bbox, frame_width=100, frame_height=50)
