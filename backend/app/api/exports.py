from collections.abc import Callable
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from pydantic import Field

from backend.app.access.store.repositories.exports import ExportRecord
from backend.app.api.errors import ErrorEnvelope, StrictModel, error_envelope
from backend.app.managers.workflow.export_use_cases import ExportUseCaseError, ExportUseCases


class CreateExportRequest(StrictModel):
    run_id: str = Field(min_length=1)


class ExportResponse(StrictModel):
    id: str
    run_id: str
    status: str
    input_revision: int
    error_code: str | None
    manifest: dict[str, Any] | None
    output_relpath: str | None


ExportProvider = Callable[[], ExportUseCases]


def _export_response(record: ExportRecord) -> ExportResponse:
    return ExportResponse(**vars(record))


def _export_error(request: Request, error: ExportUseCaseError) -> JSONResponse:
    if error.code in {"run_not_found", "export_not_found"}:
        status_code = 404
    elif error.code == "export_running":
        status_code = 409
    elif error.code in {"export_unavailable", "export_persistence_failed"}:
        status_code = 500
    else:
        status_code = 400
    envelope = error_envelope(
        request,
        code=error.code,
        message="The COCO export request could not be completed.",
        details=error.details,
    )
    return JSONResponse(status_code=status_code, content=envelope.model_dump())


def create_exports_router(export_provider: ExportProvider) -> APIRouter:
    router = APIRouter(prefix="/api/v1/exports", tags=["exports"])

    @router.post(
        "",
        response_model=ExportResponse,
        status_code=202,
        responses={
            400: {"model": ErrorEnvelope},
            404: {"model": ErrorEnvelope},
            409: {"model": ErrorEnvelope},
        },
    )
    def create_export(
        payload: CreateExportRequest,
        request: Request,
        exports: Annotated[ExportUseCases, Depends(export_provider)],
    ) -> ExportResponse | JSONResponse:
        # Authorization policy: local-public. Only a controlled run id enters.
        try:
            return _export_response(exports.create_export(payload.run_id))
        except ExportUseCaseError as error:
            return _export_error(request, error)

    @router.get("/latest", response_model=ExportResponse | None)
    def get_latest_export(
        run_id: Annotated[str, Query(min_length=1)],
        request: Request,
        exports: Annotated[ExportUseCases, Depends(export_provider)],
    ) -> ExportResponse | JSONResponse | None:
        try:
            record = exports.get_latest_export(run_id)
            return None if record is None else _export_response(record)
        except ExportUseCaseError as error:
            return _export_error(request, error)

    @router.get("/{export_id}", response_model=ExportResponse)
    def get_export(
        export_id: str,
        request: Request,
        exports: Annotated[ExportUseCases, Depends(export_provider)],
    ) -> ExportResponse | JSONResponse:
        try:
            return _export_response(exports.get_export(export_id))
        except ExportUseCaseError as error:
            return _export_error(request, error)

    return router
