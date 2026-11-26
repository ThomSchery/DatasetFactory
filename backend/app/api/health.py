from collections.abc import Callable
from typing import Annotated, Literal, Protocol

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict

from backend.app import __version__
from backend.app.api.errors import ErrorEnvelope, error_envelope
from backend.app.managers.workflow.contracts import (
    DependencyStatus,
    SystemStatusSnapshot,
)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DependencyStatusResponse(StrictModel):
    available: bool
    critical: bool
    detail: str
    code: str


class OcrStatusResponse(DependencyStatusResponse):
    """The OCR dependency, named after whichever engine is installed."""

    engine: str
    # False when the engine finds the text itself and the profile's text layout is moot.
    uses_text_layout: bool


class HealthResponse(StrictModel):
    version: str
    status: Literal["ok", "degraded", "unavailable"]
    database: DependencyStatusResponse
    workspace: DependencyStatusResponse
    ffmpeg: DependencyStatusResponse
    ocr: OcrStatusResponse
    gpu: DependencyStatusResponse


def _status_response(status: DependencyStatus) -> DependencyStatusResponse:
    return DependencyStatusResponse(
        available=status.available,
        critical=status.critical,
        detail=status.detail,
        code=status.code,
    )


def health_response(snapshot: SystemStatusSnapshot) -> HealthResponse:
    """Render one system snapshot. Shared so `/dashboard` cannot drift from `/health`."""
    return HealthResponse(
        version=__version__,
        status=(
            "unavailable"
            if not snapshot.operational
            else "degraded"
            if not snapshot.ffmpeg.available or not snapshot.ocr.available
            else "ok"
        ),
        database=_status_response(snapshot.database),
        workspace=_status_response(snapshot.workspace),
        ffmpeg=_status_response(snapshot.ffmpeg),
        ocr=OcrStatusResponse(
            **_status_response(snapshot.ocr).model_dump(),
            engine=snapshot.ocr_engine,
            uses_text_layout=snapshot.ocr_uses_text_layout,
        ),
        gpu=_status_response(snapshot.gpu),
    )


class SystemStatusReader(Protocol):
    def snapshot(self) -> SystemStatusSnapshot: ...


SystemStatusProvider = Callable[[], SystemStatusReader]


def create_health_router(status_provider: SystemStatusProvider) -> APIRouter:
    router = APIRouter(prefix="/api/v1", tags=["system"])

    @router.get(
        "/health",
        response_model=HealthResponse,
        responses={503: {"model": ErrorEnvelope}},
    )
    def health(
        request: Request,
        system_status: Annotated[SystemStatusReader, Depends(status_provider)],
    ) -> HealthResponse | JSONResponse:
        # Authorization policy: local-public. Network confinement is enforced by Settings.
        snapshot = system_status.snapshot()
        response = health_response(snapshot)
        if snapshot.operational:
            return response

        envelope = error_envelope(
            request,
            code="dependency_unavailable",
            message="A critical local dependency is unavailable.",
            details={"health": response.model_dump()},
        )
        return JSONResponse(status_code=503, content=envelope.model_dump())

    return router
