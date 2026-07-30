from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.app import __version__
from backend.app.api.assets import create_assets_router
from backend.app.api.errors import error_envelope
from backend.app.api.health import SystemStatusReader, create_health_router
from backend.app.api.materials import create_materials_router
from backend.app.api.middleware import RequestContextMiddleware
from backend.app.api.profiles import create_profiles_router
from backend.app.composition import CompositionRoot, build_composition
from backend.app.config import Settings
from backend.app.managers.workflow.material_use_cases import MaterialUseCases
from backend.app.managers.workflow.profile_use_cases import ProfileUseCases


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

    application.include_router(create_health_router(get_system_status))
    application.include_router(create_profiles_router(get_profile_use_cases))
    application.include_router(create_materials_router(get_material_use_cases))
    application.include_router(create_assets_router(get_profile_use_cases))

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
        code = "route_not_found" if exc.status_code == 404 else "http_error"
        message = "Route not found." if exc.status_code == 404 else "HTTP request failed."
        envelope = error_envelope(request, code=code, message=message)
        return JSONResponse(status_code=exc.status_code, content=envelope.model_dump())

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
