from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends

from backend.app.access.store.repositories.profiles import ProfileRecord
from backend.app.access.store.repositories.projects import ProjectRecord
from backend.app.api.errors import ErrorEnvelope, StrictModel
from backend.app.api.health import HealthResponse, health_response
from backend.app.api.runs import RunResponse, run_response
from backend.app.managers.workflow.dashboard_use_cases import DashboardSnapshot, DashboardUseCases


class DashboardProjectResponse(StrictModel):
    id: str
    name: str


class DashboardProfileResponse(StrictModel):
    id: str
    name: str
    source_width: int
    source_height: int
    version: int
    reference_asset_url: str


class FrameCountsResponse(StrictModel):
    pending: int
    accepted: int
    rejected: int
    total: int


class DashboardResponse(StrictModel):
    project: DashboardProjectResponse | None
    profile: DashboardProfileResponse | None
    run: RunResponse | None
    frame_counts: FrameCountsResponse
    system: HealthResponse


DashboardProvider = Callable[[], DashboardUseCases]


def _project_response(record: ProjectRecord) -> DashboardProjectResponse:
    # `workspace_path` stays out: no local filesystem path enters a response.
    return DashboardProjectResponse(id=record.id, name=record.name)


def _profile_response(record: ProfileRecord) -> DashboardProfileResponse:
    # Regions and categories belong to `GET /profiles/current`; the dashboard names
    # the active profile and links its reference image, it does not re-serve it.
    return DashboardProfileResponse(
        id=record.id,
        name=record.name,
        source_width=record.source_width,
        source_height=record.source_height,
        version=record.version,
        reference_asset_url=f"/api/v1/assets/references/{record.reference_asset_id}",
    )


def _dashboard_response(snapshot: DashboardSnapshot) -> DashboardResponse:
    counts = snapshot.counts
    return DashboardResponse(
        project=None if snapshot.project is None else _project_response(snapshot.project),
        profile=None if snapshot.profile is None else _profile_response(snapshot.profile),
        # The same renderer as `GET /runs/{id}`, so the experimental and quality-gate
        # warning reaches the first screen exactly as it reaches the run screen.
        run=None if snapshot.run is None else run_response(snapshot.run),
        frame_counts=FrameCountsResponse(
            pending=counts.pending,
            accepted=counts.accepted,
            rejected=counts.rejected,
            total=counts.total,
        ),
        system=health_response(snapshot.system),
    )


def create_dashboard_router(dashboard_provider: DashboardProvider) -> APIRouter:
    router = APIRouter(prefix="/api/v1", tags=["dashboard"])

    @router.get(
        "/dashboard",
        response_model=DashboardResponse,
        responses={500: {"model": ErrorEnvelope}},
    )
    def dashboard(
        use_cases: Annotated[DashboardUseCases, Depends(dashboard_provider)],
    ) -> DashboardResponse:
        # Authorization policy: local-public. Read-only: an empty install answers 200
        # with nulls, and only an unexpected failure reaches the global 500 envelope.
        return _dashboard_response(use_cases.snapshot())

    return router
