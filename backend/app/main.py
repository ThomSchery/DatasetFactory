from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Iterable, Iterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.routing import BaseRoute

from backend.app import __version__
from backend.app.api.annotations import create_annotations_router
from backend.app.api.assets import create_assets_router
from backend.app.api.dashboard import create_dashboard_router
from backend.app.api.errors import error_envelope
from backend.app.api.exports import create_exports_router
from backend.app.api.frames import create_frames_router
from backend.app.api.health import SystemStatusReader, create_health_router
from backend.app.api.materials import create_materials_router
from backend.app.api.middleware import RequestContextMiddleware
from backend.app.api.profiles import create_profiles_router
from backend.app.api.runs import create_runs_router
from backend.app.composition import CompositionRoot, build_composition
from backend.app.config import Settings
from backend.app.managers.workflow.dashboard_use_cases import DashboardUseCases
from backend.app.managers.workflow.export_use_cases import ExportUseCases
from backend.app.managers.workflow.manager import DatasetWorkflow
from backend.app.managers.workflow.material_use_cases import MaterialUseCases
from backend.app.managers.workflow.profile_use_cases import ProfileUseCases
from backend.app.managers.workflow.review_use_cases import ReviewUseCases


def _mount_spa(application: FastAPI, spa_dir: Path) -> None:
    """Serve one built Vite application without exposing arbitrary files."""
    index_path = spa_dir / "index.html"
    assets_dir = spa_dir / "assets"
    if not index_path.is_file() or not assets_dir.is_dir():
        raise RuntimeError("DF_SPA_DIR must contain a built index.html and assets directory")

    application.mount("/assets", StaticFiles(directory=assets_dir), name="spa-assets")

    @application.get("/", include_in_schema=False)
    def spa_index() -> FileResponse:
        return FileResponse(index_path)

    @application.get("/{client_path:path}", include_in_schema=False)
    def spa_client_route(request: Request, client_path: str) -> FileResponse:
        if client_path == "api" or client_path.startswith("api/"):
            status_code = 405 if _matches_declared_api_path(application, request) else 404
            raise StarletteHTTPException(status_code=status_code)
        return FileResponse(index_path)


def _iter_declared_routes(routes: Iterable[BaseRoute]) -> Iterator[BaseRoute]:
    for route in routes:
        included_router = getattr(route, "original_router", None)
        if included_router is None:
            yield route
        else:
            yield from _iter_declared_routes(included_router.routes)


def _matches_declared_api_path(application: FastAPI, request: Request) -> bool:
    """Distinguish a known API path with the wrong method from the SPA catch-all."""
    for route in _iter_declared_routes(application.router.routes):
        route_path = getattr(route, "path", "")
        path_regex = getattr(route, "path_regex", None)
        if (
            (route_path == "/api" or route_path.startswith("/api/"))
            and path_regex is not None
            and path_regex.match(request.url.path) is not None
        ):
            return True
    return False


def create_app(
    settings: Settings | None = None,
    *,
    composition: CompositionRoot | None = None,
) -> FastAPI:
    runtime_settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        active_composition = composition or build_composition(runtime_settings)
        application.state.composition = active_composition
        try:
            yield
        finally:
            if composition is None:
                active_composition.close()

    application = FastAPI(
        title="DatasetFactory",
        version=__version__,
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=[runtime_settings.dev_cors_origin],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["Content-Type", "X-Request-ID"],
    )
    application.add_middleware(RequestContextMiddleware)

    def get_system_status() -> SystemStatusReader:
        active_composition: CompositionRoot = application.state.composition
        return active_composition.system_status

    def get_profile_use_cases() -> ProfileUseCases:
        active_composition: CompositionRoot = application.state.composition
        return active_composition.profile_use_cases

    def get_material_use_cases() -> MaterialUseCases:
        active_composition: CompositionRoot = application.state.composition
        return active_composition.material_use_cases

    def get_dataset_workflow() -> DatasetWorkflow:
        active_composition: CompositionRoot = application.state.composition
        return active_composition.dataset_workflow

    def get_review_use_cases() -> ReviewUseCases:
        active_composition: CompositionRoot = application.state.composition
        return active_composition.review_use_cases

    def get_export_use_cases() -> ExportUseCases:
        active_composition: CompositionRoot = application.state.composition
        return active_composition.export_use_cases

    def get_dashboard_use_cases() -> DashboardUseCases:
        active_composition: CompositionRoot = application.state.composition
        return active_composition.dashboard_use_cases

    application.include_router(create_health_router(get_system_status))
    application.include_router(create_profiles_router(get_profile_use_cases))
    application.include_router(create_materials_router(get_material_use_cases))
    application.include_router(create_assets_router(get_profile_use_cases))
    application.include_router(create_runs_router(get_dataset_workflow))
    application.include_router(create_annotations_router(get_review_use_cases))
    application.include_router(create_frames_router(get_review_use_cases))
    application.include_router(create_exports_router(get_export_use_cases))
    application.include_router(create_dashboard_router(get_dashboard_use_cases))

    if runtime_settings.spa_dir is not None:
        _mount_spa(application, runtime_settings.spa_dir)

    @application.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        issues = [
            {
                "location": [str(part) for part in item["loc"]],
                "type": item["type"],
                "message": item["msg"],
            }
            for item in exc.errors()
        ]
        envelope = error_envelope(
            request,
            code="validation_error",
            message="Request validation failed.",
            details={"issues": issues},
        )
        return JSONResponse(status_code=400, content=envelope.model_dump())

    @application.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        status_code = exc.status_code
        is_api_path = request.url.path == "/api" or request.url.path.startswith("/api/")
        if (
            status_code == 405
            and is_api_path
            and not _matches_declared_api_path(application, request)
        ):
            status_code = 404
        code = "route_not_found" if status_code == 404 else "http_error"
        message = "Route not found." if status_code == 404 else "HTTP request failed."
        envelope = error_envelope(request, code=code, message=message)
        return JSONResponse(status_code=status_code, content=envelope.model_dump())

    @application.exception_handler(Exception)
    async def unhandled_error(request: Request, _: Exception) -> JSONResponse:
        request_id = str(request.state.request_id)
        logging.getLogger("datasetfactory.api").exception(
            "unhandled_request_error",
            extra={"request_id": request_id},
        )
        envelope = error_envelope(
            request,
            code="internal_error",
            message="An unexpected local application error occurred.",
        )
        return JSONResponse(
            status_code=500,
            content=envelope.model_dump(),
            headers={"X-Request-ID": request_id},
        )

    return application


app = create_app()
