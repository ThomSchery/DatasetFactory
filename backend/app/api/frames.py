from collections.abc import Callable
from typing import Annotated, Literal, Self

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import Field, model_validator

from backend.app.access.store.repositories.annotations import StoredFrameReview
from backend.app.api.annotations import (
    AnnotationResponse,
    BBoxRequest,
    annotation_response,
    review_error,
)
from backend.app.api.errors import ErrorEnvelope, StrictModel
from backend.app.managers.workflow.review_use_cases import ReviewUseCaseError, ReviewUseCases


class FrameReviewRequest(StrictModel):
    decision: Literal["accept", "reject", "reopen"]
    expected_version: int = Field(ge=1)


class CreateAnnotationRequest(StrictModel):
    category_id: str = Field(min_length=1)
    bbox: BBoxRequest
    expected_version: int = Field(ge=1)


class CopyPreviousAnnotationsRequest(StrictModel):
    scope: Literal["game", "character", "category"]
    category_id: str | None = None
    expected_version: int = Field(ge=1)

    @model_validator(mode="after")
    def validate_category_scope(self) -> Self:
        if self.scope == "category" and not self.category_id:
            raise ValueError("category_id is required for category scope")
        if self.scope != "category" and self.category_id is not None:
            raise ValueError("category_id is only allowed for category scope")
        return self


class CopyPreviousAnnotationsResponse(StrictModel):
    copied: int
    replaced: int
    frame_version: int


class FrameDetailResponse(StrictModel):
    id: str
    run_id: str
    frame_index: int
    timestamp_ms: int
    stage_status: str
    review_status: str
    width: int
    height: int
    version: int
    review_revision: int
    annotations: tuple[AnnotationResponse, ...]


ReviewProvider = Callable[[], ReviewUseCases]


def _frame_response(record: StoredFrameReview) -> FrameDetailResponse:
    return FrameDetailResponse(
        id=record.id,
        run_id=record.run_id,
        frame_index=record.frame_index,
        timestamp_ms=record.timestamp_ms,
        stage_status=record.stage_status,
        review_status=record.review_status,
        width=record.width,
        height=record.height,
        version=record.version,
        review_revision=record.review_revision,
        annotations=tuple(annotation_response(item) for item in record.annotations),
    )


def create_frames_router(review_provider: ReviewProvider) -> APIRouter:
    router = APIRouter(prefix="/api/v1/frames", tags=["frames"])

    @router.get("/{frame_id}", response_model=FrameDetailResponse)
    def get_frame(
        frame_id: str,
        request: Request,
        review: Annotated[ReviewUseCases, Depends(review_provider)],
    ) -> FrameDetailResponse | JSONResponse:
        try:
            return _frame_response(review.get_frame(frame_id))
        except ReviewUseCaseError as error:
            return review_error(request, error)

    @router.get(
        "/{frame_id}/image",
        response_class=FileResponse,
        response_model=None,
        responses={404: {"model": ErrorEnvelope}},
    )
    def get_frame_image(
        frame_id: str,
        request: Request,
        review: Annotated[ReviewUseCases, Depends(review_provider)],
    ) -> FileResponse | JSONResponse:
        try:
            image = review.get_frame_image(frame_id)
        except ReviewUseCaseError as error:
            return review_error(request, error)
        return FileResponse(image.path, media_type=image.content_type)

    @router.post(
        "/{frame_id}/annotations",
        response_model=AnnotationResponse,
        status_code=201,
    )
    def create_annotation(
        frame_id: str,
        payload: CreateAnnotationRequest,
        request: Request,
        review: Annotated[ReviewUseCases, Depends(review_provider)],
    ) -> AnnotationResponse | JSONResponse:
        try:
            record = review.create_manual_annotation(
                frame_id,
                category_id=payload.category_id,
                bbox=(
                    payload.bbox.x,
                    payload.bbox.y,
                    payload.bbox.width,
                    payload.bbox.height,
                ),
                expected_version=payload.expected_version,
            )
        except ReviewUseCaseError as error:
            return review_error(request, error)
        return annotation_response(record)

    @router.post(
        "/{frame_id}/annotations/copy-previous",
        response_model=CopyPreviousAnnotationsResponse,
    )
    def copy_previous_annotations(
        frame_id: str,
        payload: CopyPreviousAnnotationsRequest,
        request: Request,
        review: Annotated[ReviewUseCases, Depends(review_provider)],
    ) -> CopyPreviousAnnotationsResponse | JSONResponse:
        try:
            result = review.copy_previous_annotations(
                frame_id,
                scope=payload.scope,
                category_id=payload.category_id,
                expected_version=payload.expected_version,
            )
        except ReviewUseCaseError as error:
            return review_error(request, error)
        return CopyPreviousAnnotationsResponse(**vars(result))

    @router.post("/{frame_id}/review", response_model=FrameDetailResponse)
    def review_frame(
        frame_id: str,
        payload: FrameReviewRequest,
        request: Request,
        review: Annotated[ReviewUseCases, Depends(review_provider)],
    ) -> FrameDetailResponse | JSONResponse:
        try:
            record = review.review_frame(
                frame_id,
                decision=payload.decision,
                expected_version=payload.expected_version,
            )
        except ReviewUseCaseError as error:
            return review_error(request, error)
        return _frame_response(record)

    return router
