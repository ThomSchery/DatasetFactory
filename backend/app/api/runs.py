from collections.abc import Callable
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from pydantic import Field

from backend.app.access.store.repositories.frames import FramePage, FrameSummary
from backend.app.access.store.repositories.runs import RunRecord
from backend.app.api.errors import ErrorEnvelope, StrictModel, error_envelope
from backend.app.managers.workflow.manager import DatasetWorkflow, WorkflowError


class CreateRunRequest(StrictModel):
    profile_id: str = Field(min_length=1)
    video_id: str = Field(min_length=1)
    interval_ms: int = Field(default=1000, gt=0)


class VersionedMutationRequest(StrictModel):
    expected_version: int = Field(ge=1)


class RunResponse(StrictModel):
    id: str
    profile_id: str
    video_id: str
    interval_ms: int
    status: str
    error_code: str | None
    last_heartbeat_at: datetime | None
    attempt: int
    total_frames: int
    completed_frames: int
    current_stage: str | None
    current_frame_index: int | None
    version: int
    ocr_engine: str
    ocr_engine_version: str
    ocr_runtime_sha256: str
    ocr_model_sha256: str
    ocr_config_hash: str
    ocr_language: str
    ocr_page_segmentation_mode: int
    experimental: bool
    quality_gate: str
    warning: str


class FrameSummaryResponse(StrictModel):
    id: str
    frame_index: int
    timestamp_ms: int
    stage_status: str
    review_status: str
    width: int
    height: int
    version: int
    ocr_engine: str
    experimental: bool
    quality_gate: str
    warning: str


class FramePageResponse(StrictModel):
    items: tuple[FrameSummaryResponse, ...]
    page: int
    page_size: int
    total: int


WorkflowProvider = Callable[[], DatasetWorkflow]


def _run_response(record: RunRecord) -> RunResponse:
    return RunResponse(**vars(record))


def _frame_response(record: FrameSummary) -> FrameSummaryResponse:
    return FrameSummaryResponse(**vars(record))


def _page_response(page: FramePage) -> FramePageResponse:
    return FramePageResponse(
        items=tuple(_frame_response(item) for item in page.items),
        page=page.page,
        page_size=page.page_size,
        total=page.total,
    )


def _workflow_error(request: Request, error: WorkflowError) -> JSONResponse:
    if error.code in {"run_not_found", "profile_not_found", "video_not_found"}:
        status_code = 404
    elif error.code in {"active_run", "version_conflict", "invalid_transition"}:
        status_code = 409
    elif error.code in {"worker_unavailable", "workflow_persistence_failed"}:
        status_code = 500
    else:
        status_code = 400
    envelope = error_envelope(
        request,
        code=error.code,
        message="The durable dataset run request could not be completed.",
        details=error.details,
    )
    return JSONResponse(status_code=status_code, content=envelope.model_dump())


def create_runs_router(workflow_provider: WorkflowProvider) -> APIRouter:
    router = APIRouter(prefix="/api/v1/runs", tags=["runs"])

    @router.post(
        "",
        response_model=RunResponse,
        status_code=201,
        responses={400: {"model": ErrorEnvelope}, 404: {"model": ErrorEnvelope}},
    )
    def create_run(
        payload: CreateRunRequest,
        request: Request,
        workflow: Annotated[DatasetWorkflow, Depends(workflow_provider)],
    ) -> RunResponse | JSONResponse:
        # Authorization policy: local-public. No source path enters the response.
        try:
            record = workflow.create_run(
                profile_id=payload.profile_id,
                video_id=payload.video_id,
                interval_ms=payload.interval_ms,
            )
        except WorkflowError as error:
            return _workflow_error(request, error)
        return _run_response(record)

    def mutate(
        action: Literal["start", "pause", "resume", "cancel"],
        run_id: str,
        payload: VersionedMutationRequest,
        request: Request,
        workflow: DatasetWorkflow,
    ) -> RunResponse | JSONResponse:
        try:
            operation = getattr(workflow, action)
            record: RunRecord = operation(run_id, expected_version=payload.expected_version)
        except WorkflowError as error:
            return _workflow_error(request, error)
        return _run_response(record)

    @router.post("/{run_id}/start", response_model=RunResponse, status_code=202)
    def start_run(
        run_id: str,
        payload: VersionedMutationRequest,
        request: Request,
        workflow: Annotated[DatasetWorkflow, Depends(workflow_provider)],
    ) -> RunResponse | JSONResponse:
        return mutate("start", run_id, payload, request, workflow)

    @router.post("/{run_id}/pause", response_model=RunResponse, status_code=202)
    def pause_run(
        run_id: str,
        payload: VersionedMutationRequest,
        request: Request,
        workflow: Annotated[DatasetWorkflow, Depends(workflow_provider)],
    ) -> RunResponse | JSONResponse:
        return mutate("pause", run_id, payload, request, workflow)

    @router.post("/{run_id}/resume", response_model=RunResponse, status_code=202)
    def resume_run(
        run_id: str,
        payload: VersionedMutationRequest,
        request: Request,
        workflow: Annotated[DatasetWorkflow, Depends(workflow_provider)],
    ) -> RunResponse | JSONResponse:
        return mutate("resume", run_id, payload, request, workflow)

    @router.post("/{run_id}/cancel", response_model=RunResponse, status_code=202)
    def cancel_run(
        run_id: str,
        payload: VersionedMutationRequest,
        request: Request,
        workflow: Annotated[DatasetWorkflow, Depends(workflow_provider)],
    ) -> RunResponse | JSONResponse:
        return mutate("cancel", run_id, payload, request, workflow)

    @router.get("/{run_id}", response_model=RunResponse)
    def get_run(
        run_id: str,
        request: Request,
        workflow: Annotated[DatasetWorkflow, Depends(workflow_provider)],
    ) -> RunResponse | JSONResponse:
        try:
            return _run_response(workflow.get_run(run_id))
        except WorkflowError as error:
            return _workflow_error(request, error)

    @router.get("/{run_id}/frames", response_model=FramePageResponse)
    def list_frames(
        run_id: str,
        request: Request,
        workflow: Annotated[DatasetWorkflow, Depends(workflow_provider)],
        review_status: Annotated[
            Literal["pending", "accepted", "rejected"] | None,
            Query(),
        ] = None,
        page: Annotated[int, Query(ge=1)] = 1,
        page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    ) -> FramePageResponse | JSONResponse:
        # @SCALE: bounded polling is the v1 contract; add SSE only with an
        # external durable worker/queue and more than one concurrent run.
        try:
            return _page_response(
                workflow.list_frames(
                    run_id,
                    review_status=review_status,
                    page=page,
                    page_size=page_size,
                )
            )
        except WorkflowError as error:
            return _workflow_error(request, error)

    return router
