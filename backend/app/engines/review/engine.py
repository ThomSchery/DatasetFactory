from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any, Literal

AnnotationStatus = Literal["proposed", "accepted", "deleted"]
ReviewStatus = Literal["pending", "accepted", "rejected"]

# The only stage at which a frame carries OCR proposals and accepts human work.
REVIEWABLE_STAGE = "review_pending"


class ReviewValidationError(ValueError):
    def __init__(self, code: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.details = details or {}


@dataclass(frozen=True)
class ReviewBBox:
    x: int
    y: int
    width: int
    height: int


@dataclass(frozen=True)
class AnnotationSnapshot:
    id: str
    category_id: str
    bbox: ReviewBBox
    status: AnnotationStatus
    version: int


@dataclass(frozen=True)
class FrameReviewSnapshot:
    id: str
    width: int
    height: int
    # Plain `str`: the engine only compares it with `REVIEWABLE_STAGE`, and the
    # stage vocabulary belongs to the workflow state machine, not here.
    stage_status: str
    review_status: ReviewStatus
    version: int
    annotations: tuple[AnnotationSnapshot, ...]


class AnnotationReviewEngine:
    """Pure review transitions over immutable snapshots."""

    def add_annotation(
        self,
        snapshot: FrameReviewSnapshot,
        *,
        annotation_id: str,
        category_id: str,
        bbox: ReviewBBox,
        allowed_categories: frozenset[str],
    ) -> FrameReviewSnapshot:
        self._require_mutable(snapshot)
        # A frame that has not finished OCR would lose the box to `commit_ocr`,
        # which rewrites the frame's OCR proposals when the worker reaches it.
        if snapshot.stage_status != REVIEWABLE_STAGE:
            raise ReviewValidationError("frame_not_reviewable")
        if category_id not in allowed_categories:
            raise ReviewValidationError("category_not_allowed")
        self.validate_bbox(
            bbox,
            frame_width=snapshot.width,
            frame_height=snapshot.height,
        )
        annotation = AnnotationSnapshot(
            id=annotation_id,
            category_id=category_id,
            bbox=bbox,
            status="proposed",
            version=1,
        )
        return replace(
            snapshot,
            version=snapshot.version + 1,
            annotations=(*snapshot.annotations, annotation),
        )

    def edit_annotation(
        self,
        snapshot: FrameReviewSnapshot,
        *,
        annotation_id: str,
        category_id: str | None,
        bbox: ReviewBBox | None,
        allowed_categories: frozenset[str],
    ) -> FrameReviewSnapshot:
        self._require_mutable(snapshot)
        if category_id is None and bbox is None:
            raise ReviewValidationError("empty_patch")
        if category_id is not None and category_id not in allowed_categories:
            raise ReviewValidationError("category_not_allowed")
        annotation = self._annotation(snapshot, annotation_id)
        if annotation.status == "deleted":
            raise ReviewValidationError("annotation_deleted")
        next_bbox = bbox if bbox is not None else annotation.bbox
        self.validate_bbox(
            next_bbox,
            frame_width=snapshot.width,
            frame_height=snapshot.height,
        )
        changed = replace(
            annotation,
            category_id=category_id if category_id is not None else annotation.category_id,
            bbox=next_bbox,
            version=annotation.version + 1,
        )
        return replace(snapshot, annotations=self._replace_annotation(snapshot, changed))

    def correct_class(
        self,
        snapshot: FrameReviewSnapshot,
        *,
        annotation_id: str,
        category_id: str,
        allowed_categories: frozenset[str],
    ) -> FrameReviewSnapshot:
        return self.edit_annotation(
            snapshot,
            annotation_id=annotation_id,
            category_id=category_id,
            bbox=None,
            allowed_categories=allowed_categories,
        )

    def tombstone(
        self,
        snapshot: FrameReviewSnapshot,
        *,
        annotation_id: str,
    ) -> FrameReviewSnapshot:
        self._require_mutable(snapshot)
        annotation = self._annotation(snapshot, annotation_id)
        if annotation.status == "deleted":
            raise ReviewValidationError("annotation_deleted")
        changed = replace(annotation, status="deleted", version=annotation.version + 1)
        return replace(snapshot, annotations=self._replace_annotation(snapshot, changed))

    def review_frame(
        self,
        snapshot: FrameReviewSnapshot,
        *,
        decision: Literal["accept", "reject", "reopen"],
        allowed_categories: frozenset[str],
    ) -> FrameReviewSnapshot:
        if decision == "reopen":
            if snapshot.review_status == "accepted":
                raise ReviewValidationError("review_locked")
            if snapshot.review_status != "rejected":
                raise ReviewValidationError("invalid_review_transition")
            return replace(
                snapshot,
                review_status="pending",
                version=snapshot.version + 1,
            )
        # `_require_mutable` leaves only `pending`, the third `ReviewStatus` value.
        self._require_mutable(snapshot)
        # `commit_ocr` resets `review_status` to `pending` when the worker reaches a
        # frame, so a decision taken before OCR finished would be silently undone.
        # `reopen` returns above: a `rejected` frame has always cleared this stage.
        if snapshot.stage_status != REVIEWABLE_STAGE:
            raise ReviewValidationError("frame_not_reviewable")
        active = tuple(item for item in snapshot.annotations if item.status != "deleted")
        if decision == "accept":
            if not active:
                raise ReviewValidationError("no_annotations")
            for annotation in active:
                if annotation.category_id not in allowed_categories:
                    raise ReviewValidationError("category_not_allowed")
            # A recovery that re-samples the frame at smaller dimensions can leave a
            # kept manual box outside the frame. Name every offending box at once so
            # the user can fix them instead of hunting one rejection at a time.
            outside = tuple(
                annotation.id
                for annotation in active
                if not self._bbox_fits(
                    annotation.bbox,
                    frame_width=snapshot.width,
                    frame_height=snapshot.height,
                )
            )
            if outside:
                raise ReviewValidationError(
                    "bbox_invalid",
                    details={"annotation_ids": list(outside)},
                )
            annotations = tuple(
                replace(item, status="accepted") if item.status != "deleted" else item
                for item in snapshot.annotations
            )
            return replace(
                snapshot,
                review_status="accepted",
                version=snapshot.version + 1,
                annotations=annotations,
            )
        if decision == "reject":
            return replace(snapshot, review_status="rejected", version=snapshot.version + 1)
        raise ReviewValidationError("invalid_decision")

    @classmethod
    def validate_bbox(cls, bbox: ReviewBBox, *, frame_width: int, frame_height: int) -> None:
        if not cls._bbox_fits(bbox, frame_width=frame_width, frame_height=frame_height):
            raise ReviewValidationError("bbox_invalid")

    @staticmethod
    def _bbox_fits(bbox: ReviewBBox, *, frame_width: int, frame_height: int) -> bool:
        return not (
            bbox.x < 0
            or bbox.y < 0
            or bbox.width <= 0
            or bbox.height <= 0
            or bbox.x + bbox.width > frame_width
            or bbox.y + bbox.height > frame_height
        )

    @staticmethod
    def _require_mutable(snapshot: FrameReviewSnapshot) -> None:
        if snapshot.review_status in {"accepted", "rejected"}:
            raise ReviewValidationError("review_locked")

    @staticmethod
    def _annotation(
        snapshot: FrameReviewSnapshot,
        annotation_id: str,
    ) -> AnnotationSnapshot:
        for annotation in snapshot.annotations:
            if annotation.id == annotation_id:
                return annotation
        raise ReviewValidationError("annotation_not_found")

    @staticmethod
    def _replace_annotation(
        snapshot: FrameReviewSnapshot,
        changed: AnnotationSnapshot,
    ) -> tuple[AnnotationSnapshot, ...]:
        return tuple(changed if item.id == changed.id else item for item in snapshot.annotations)
