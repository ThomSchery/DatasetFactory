from collections.abc import Callable
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from pydantic import Field

from backend.app.access.store.repositories.materials import MaterialPage, MaterialRecord
from backend.app.api.errors import ErrorEnvelope, StrictModel, error_envelope
from backend.app.managers.workflow.material_use_cases import MaterialUseCaseError, MaterialUseCases


class CreateMaterialRequest(StrictModel):
    local_path: str = Field(min_length=1)


class MaterialResponse(StrictModel):
    id: str
    basename: str
    size_bytes: int
    duration_ms: int
    width: int
    height: int
    fingerprint: str
    available: bool
    created_at: datetime


class MaterialPageResponse(StrictModel):
    items: tuple[MaterialResponse, ...]
    page: int
    page_size: int
    total: int


MaterialUseCasesProvider = Callable[[], MaterialUseCases]


def _material_response(record: MaterialRecord) -> MaterialResponse:
    return MaterialResponse(**vars(record))


def _page_response(page: MaterialPage) -> MaterialPageResponse:
    return MaterialPageResponse(
        items=tuple(_material_response(item) for item in page.items),
        page=page.page,
        page_size=page.page_size,
        total=page.total,
    )


def _material_error(request: Request, error: MaterialUseCaseError) -> JSONResponse:
    if error.code == "source_missing":
        status_code = 404
    elif error.code == "ffprobe_unavailable":
        status_code = 503
    elif error.code == "ffprobe_timeout":
        status_code = 504
    else:
        status_code = 400
    envelope = error_envelope(
        request,
        code=error.code,
        message="The local material could not be imported.",
        details=error.details,
    )
    return JSONResponse(status_code=status_code, content=envelope.model_dump())


def create_materials_router(use_cases_provider: MaterialUseCasesProvider) -> APIRouter:
    router = APIRouter(prefix="/api/v1/materials", tags=["materials"])

    @router.post(
        "",
        response_model=MaterialResponse,
        status_code=201,
        responses={400: {"model": ErrorEnvelope}, 404: {"model": ErrorEnvelope}},
    )
    def create_material(
        payload: CreateMaterialRequest,
        request: Request,
        use_cases: Annotated[MaterialUseCases, Depends(use_cases_provider)],
    ) -> MaterialResponse | JSONResponse:
        # Authorization policy: local-public. The source path never enters the response.
        try:
            record = use_cases.import_material(payload.local_path)
        except MaterialUseCaseError as error:
            return _material_error(request, error)
        return _material_response(record)

    @router.get("", response_model=MaterialPageResponse)
    def list_materials(
        use_cases: Annotated[MaterialUseCases, Depends(use_cases_provider)],
        page: Annotated[int, Query(ge=1)] = 1,
        page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    ) -> MaterialPageResponse:
        return _page_response(use_cases.list_materials(page=page, page_size=page_size))

    return router
