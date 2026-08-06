from collections.abc import Callable
from typing import Annotated, Protocol

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict

from backend.app import __version__
from backend.app.access.status.service import (
    DependencyStatus,
    SystemStatusSnapshot,
)
from backend.app.api.errors import ErrorEnvelope, error_envelope


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DependencyStatusResponse(StrictModel):
    available: bool
    critical: bool
    detail: str


class HealthResponse(StrictModel):
    version: str
    status: str
    database: DependencyStatusResponse
    workspace: DependencyStatusResponse
    ffmpeg: DependencyStatusResponse
    tesseract: DependencyStatusResponse
    gpu: DependencyStatusResponse


def _status_response(status: DependencyStatus) -> DependencyStatusResponse:
    return DependencyStatusResponse(
        available=status.available,
        critical=status.critical,
        detail=status.detail,
    )


def health_response(snapshot: SystemStatusSnapshot) -> HealthResponse:
    """Render one system snapshot. Shared so `/dashboard` cannot drift from `/health`."""
    return HealthResponse(
        version=__version__,
        status="ok" if snapshot.operational else "unavailable",
        database=_status_response(snapshot.database),
        workspace=_status_response(snapshot.workspace),
        ffmpeg=_status_response(snapshot.ffmpeg),
        tesseract=_status_response(snapshot.tesseract),
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
