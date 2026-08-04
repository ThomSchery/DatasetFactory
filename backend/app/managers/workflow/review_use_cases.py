from __future__ import annotations

import mimetypes
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, cast

from backend.app.access.store.repositories.annotations import (
    AnnotationNotFoundError,
    AnnotationRepository,
    ReviewCategoryError,
    ReviewFrameNotFoundError,
    ReviewLockedError,
    ReviewNoAnnotationsError,
    ReviewTransitionError,
    ReviewVersionConflictError,
    StoredAnnotation,
    StoredFrameReview,
)
from backend.app.access.store.workspace import Workspace, WorkspaceError
from backend.app.engines.review import (
    AnnotationReviewEngine,
    AnnotationSnapshot,
    FrameReviewSnapshot,
    ReviewBBox,
    ReviewValidationError,
)


class ReviewUseCaseError(RuntimeError):
    def __init__(self, code: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.details = details or {}


@dataclass(frozen=True)
class FrameImage:
    path: Path
    content_type: str


class ReviewUseCases:
    def __init__(
        self,
        engine: AnnotationReviewEngine,
        annotations: AnnotationRepository,
        workspace: Workspace,
    ) -> None:
        self._engine = engine
        self._annotations = annotations
        self._workspace = workspace

    def get_frame(self, frame_id: str) -> StoredFrameReview:
        try:
            return self._annotations.frame(frame_id)
        except ReviewFrameNotFoundError as exc:
            raise ReviewUseCaseError("frame_not_found") from exc

    def get_frame_image(self, frame_id: str) -> FrameImage:
        frame = self.get_frame(frame_id)
        try:
            path = self._workspace.resolve_relpath(frame.image_relpath)
        except WorkspaceError as exc:
            raise ReviewUseCaseError("frame_image_not_found") from exc
        if not path.is_file():
            raise ReviewUseCaseError("frame_image_not_found")
        content_type, _ = mimetypes.guess_type(path.name)
        if content_type not in {"image/jpeg", "image/png", "image/webp"}:
            raise ReviewUseCaseError("frame_image_not_found")
        return FrameImage(path, content_type)

    def correct_annotation(
        self,
        annotation_id: str,
        *,
        category_id: str,
        expected_version: int,
    ) -> StoredAnnotation:
        try:
            current = self._annotations.frame_for_annotation(annotation_id)
            self._engine.correct_class(
                self._snapshot(current),
                annotation_id=annotation_id,
                category_id=category_id,
                allowed_categories=current.allowed_category_ids,
            )
            updated = self._annotations.update_category(
                annotation_id,
                category_id=category_id,
                expected_version=expected_version,
            )
            return self._find_annotation(updated, annotation_id)
        except Exception as exc:
            raise self._translate(exc) from exc

    def delete_annotation(self, annotation_id: str, *, expected_version: int) -> None:
        try:
            current = self._annotations.frame_for_annotation(annotation_id)
            self._engine.tombstone(self._snapshot(current), annotation_id=annotation_id)
            self._annotations.tombstone(annotation_id, expected_version=expected_version)
        except Exception as exc:
            raise self._translate(exc) from exc

    def review_frame(
        self,
        frame_id: str,
        *,
        decision: Literal["accept", "reject"],
        expected_version: int,
    ) -> StoredFrameReview:
        try:
            current = self._annotations.frame(frame_id)
            self._engine.review_frame(
                self._snapshot(current),
                decision=decision,
                allowed_categories=current.allowed_category_ids,
            )
            return self._annotations.review_frame(
                frame_id,
                decision=decision,
                expected_version=expected_version,
            )
        except Exception as exc:
            raise self._translate(exc) from exc

    @staticmethod
    def _snapshot(record: StoredFrameReview) -> FrameReviewSnapshot:
        return FrameReviewSnapshot(
            id=record.id,
            width=record.width,
            height=record.height,
            review_status=cast(Literal["pending", "accepted", "rejected"], record.review_status),
            version=record.version,
            annotations=tuple(
                AnnotationSnapshot(
                    id=item.id,
                    category_id=item.category_id,
                    bbox=ReviewBBox(item.x, item.y, item.width, item.height),
                    status=cast(Literal["proposed", "accepted", "deleted"], item.status),
                    version=item.version,
                )
                for item in record.annotations
            ),
        )

    @staticmethod
    def _find_annotation(record: StoredFrameReview, annotation_id: str) -> StoredAnnotation:
        return next(item for item in record.annotations if item.id == annotation_id)

    @staticmethod
    def _translate(error: Exception) -> ReviewUseCaseError:
        if isinstance(error, AnnotationNotFoundError):
            return ReviewUseCaseError("annotation_not_found")
        if isinstance(error, ReviewFrameNotFoundError):
            return ReviewUseCaseError("frame_not_found")
        if isinstance(error, ReviewVersionConflictError):
            return ReviewUseCaseError("version_conflict")
        if isinstance(error, ReviewLockedError):
            return ReviewUseCaseError("review_locked")
        if isinstance(error, ReviewCategoryError):
            return ReviewUseCaseError("category_not_allowed")
        if isinstance(error, ReviewNoAnnotationsError):
            return ReviewUseCaseError("no_annotations")
        if isinstance(error, ReviewTransitionError):
            return ReviewUseCaseError("invalid_review_transition")
        if isinstance(error, ReviewValidationError):
            return ReviewUseCaseError(error.code)
        if isinstance(error, ReviewUseCaseError):
            return error
        return ReviewUseCaseError("review_persistence_failed")
