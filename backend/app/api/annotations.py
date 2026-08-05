from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import JSONResponse
from pydantic import Field

from backend.app.access.store.repositories.annotations import StoredAnnotation
from backend.app.api.errors import StrictModel, error_envelope
from backend.app.managers.workflow.review_use_cases import ReviewUseCaseError, ReviewUseCases


class BBoxRequest(StrictModel):
    x: int
    y: int
    width: int
    height: int


class UpdateAnnotationRequest(StrictModel):
    category_id: str | None = Field(default=None, min_length=1)
    bbox: BBoxRequest | None = None
    expected_version: int = Field(ge=1)


class AnnotationResponse(StrictModel):
    id: str
    category_id: str
    x: int
    y: int
    width: int
    height: int
    confidence: float | None
    source: str
    observation_id: str | None
    status: str
    version: int


ReviewProvider = Callable[[], ReviewUseCases]


def annotation_response(record: StoredAnnotation) -> AnnotationResponse:
    return AnnotationResponse(**vars(record))


def review_error(request: Request, error: ReviewUseCaseError) -> JSONResponse:
    if error.code in {"annotation_not_found", "frame_not_found", "frame_image_not_found"}:
        status_code = 404
    elif error.code in {
        "version_conflict",
        "review_locked",
        "frame_not_reviewable",
        "invalid_review_transition",
    }:
        status_code = 409
    elif error.code == "review_persistence_failed":
        status_code = 500
    else:
        status_code = 400
    envelope = error_envelope(
        request,
        code=error.code,
        message="The annotation review request could not be completed.",
        details=error.details,
    )
    return JSONResponse(status_code=status_code, content=envelope.model_dump())


def create_annotations_router(review_provider: ReviewProvider) -> APIRouter:
    router = APIRouter(prefix="/api/v1/annotations", tags=["annotations"])

    @router.patch("/{annotation_id}", response_model=AnnotationResponse)
    def update_annotation(
        annotation_id: str,
        payload: UpdateAnnotationRequest,
        request: Request,
        review: Annotated[ReviewUseCases, Depends(review_provider)],
    ) -> AnnotationResponse | JSONResponse:
        try:
            record = review.correct_annotation(
                annotation_id,
                category_id=payload.category_id,
                bbox=(
                    (
                        payload.bbox.x,
                        payload.bbox.y,
                        payload.bbox.width,
                        payload.bbox.height,
                    )
                    if payload.bbox is not None
                    else None
                ),
                expected_version=payload.expected_version,
            )
        except ReviewUseCaseError as error:
            return review_error(request, error)
        return annotation_response(record)

    @router.delete(
        "/{annotation_id}",
        status_code=204,
        response_class=Response,
        response_model=None,
    )
    def delete_annotation(
        annotation_id: str,
        request: Request,
        review: Annotated[ReviewUseCases, Depends(review_provider)],
        expected_version: Annotated[int, Query(ge=1)],
    ) -> Response | JSONResponse:
        try:
            review.delete_annotation(annotation_id, expected_version=expected_version)
        except ReviewUseCaseError as error:
            return review_error(request, error)
        return Response(status_code=204)

    return router
