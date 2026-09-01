from collections.abc import Callable
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import Field

from backend.app.access.store.repositories.profiles import ProfileRecord, ProfileSummaryRecord
from backend.app.api.errors import ErrorEnvelope, StrictModel, error_envelope
from backend.app.engines.definition import CategoryDefinition, RegionDefinition
from backend.app.managers.workflow.profile_use_cases import (
    ProfileUseCaseError,
    ProfileUseCases,
    region_definition,
)


class RegionRequest(StrictModel):
    name: str = Field(min_length=1, max_length=200)
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    width: int = Field(gt=0)
    height: int = Field(gt=0)


class CategoryRequest(StrictModel):
    name: str = Field(min_length=1, max_length=200)
    kind: Literal["character", "game"]


class CreateProfileRequest(StrictModel):
    name: str = Field(min_length=1, max_length=200)
    reference_image_path: str = Field(min_length=1)
    regions: tuple[RegionRequest, ...] = Field(min_length=1)
    categories: tuple[CategoryRequest, ...] = Field(min_length=1)


class ReferencePreviewRequest(StrictModel):
    reference_image_path: str = Field(min_length=1)


class ReferencePreviewResponse(StrictModel):
    asset_id: str
    width: int
    height: int


class RegionResponse(StrictModel):
    id: str
    name: str
    x: int
    y: int
    width: int
    height: int


class CategoryResponse(StrictModel):
    id: str
    name: str
    kind: str


class GameProfileResponse(StrictModel):
    id: str
    name: str
    reference_asset_id: str
    reference_asset_url: str
    source_width: int
    source_height: int
    version: int
    regions: tuple[RegionResponse, ...]
    categories: tuple[CategoryResponse, ...]


class ProfileSummaryResponse(StrictModel):
    id: str
    name: str
    reference_asset_url: str
    source_width: int
    source_height: int
    region_count: int
    category_count: int
    created_at: datetime
    active: bool


ProfileUseCasesProvider = Callable[[], ProfileUseCases]


def _response(record: ProfileRecord) -> GameProfileResponse:
    return GameProfileResponse(
        id=record.id,
        name=record.name,
        reference_asset_id=record.reference_asset_id,
        reference_asset_url=f"/api/v1/assets/references/{record.reference_asset_id}",
        source_width=record.source_width,
        source_height=record.source_height,
        version=record.version,
        regions=tuple(RegionResponse(**vars(region)) for region in record.regions),
        categories=tuple(
            CategoryResponse(id=category.id, name=category.name, kind=category.kind)
            for category in record.categories
        ),
    )


def _summary_response(record: ProfileSummaryRecord) -> ProfileSummaryResponse:
    return ProfileSummaryResponse(
        id=record.id,
        name=record.name,
        reference_asset_url=f"/api/v1/assets/references/{record.reference_asset_id}",
        source_width=record.source_width,
        source_height=record.source_height,
        region_count=record.region_count,
        category_count=record.category_count,
        created_at=record.created_at,
        active=record.active,
    )


def _profile_error(request: Request, error: ProfileUseCaseError) -> JSONResponse:
    if error.code in {"profile_not_found", "source_missing"}:
        status_code = 404
    elif error.code in {"profile_name_exists", "active_run"}:
        status_code = 409
    elif error.code == "reference_asset_copy_failed":
        status_code = 502
    elif error.code == "profile_persistence_failed":
        status_code = 500
    else:
        status_code = 400
    envelope = error_envelope(
        request,
        code=error.code,
        message="The game profile could not be created.",
        details=error.details,
    )
    return JSONResponse(status_code=status_code, content=envelope.model_dump())


def create_profiles_router(use_cases_provider: ProfileUseCasesProvider) -> APIRouter:
    router = APIRouter(prefix="/api/v1/profiles", tags=["profiles"])

    @router.post(
        "/reference-preview",
        response_model=ReferencePreviewResponse,
        status_code=201,
        responses={
            400: {"model": ErrorEnvelope},
            404: {"model": ErrorEnvelope},
            502: {"model": ErrorEnvelope},
        },
    )
    def create_reference_preview(
        payload: ReferencePreviewRequest,
        request: Request,
        use_cases: Annotated[ProfileUseCases, Depends(use_cases_provider)],
    ) -> ReferencePreviewResponse | JSONResponse:
        # Authorization policy: local-public. The path remains server-local and is never returned.
        try:
            preview = use_cases.create_reference_preview(
                reference_image_path=payload.reference_image_path
            )
        except ProfileUseCaseError as error:
            return _profile_error(request, error)
        return ReferencePreviewResponse(
            asset_id=preview.asset_id,
            width=preview.width,
            height=preview.height,
        )

    @router.post(
        "",
        response_model=GameProfileResponse,
        status_code=201,
        responses={
            400: {"model": ErrorEnvelope},
            404: {"model": ErrorEnvelope},
            409: {"model": ErrorEnvelope},
        },
    )
    def create_profile(
        payload: CreateProfileRequest,
        request: Request,
        use_cases: Annotated[ProfileUseCases, Depends(use_cases_provider)],
    ) -> GameProfileResponse | JSONResponse:
        # Authorization policy: local-public. Domain rules remain in the engine/use case.
        regions: tuple[RegionDefinition, ...] = tuple(
            region_definition(
                name=region.name,
                x=region.x,
                y=region.y,
                width=region.width,
                height=region.height,
            )
            for region in payload.regions
        )
        categories = tuple(
            CategoryDefinition(name=category.name, kind=category.kind)
            for category in payload.categories
        )
        try:
            record = use_cases.create_profile(
                name=payload.name,
                reference_image_path=payload.reference_image_path,
                regions=regions,
                categories=categories,
            )
        except ProfileUseCaseError as error:
            return _profile_error(request, error)
        return _response(record)

    @router.get("", response_model=tuple[ProfileSummaryResponse, ...])
    def list_profiles(
        use_cases: Annotated[ProfileUseCases, Depends(use_cases_provider)],
    ) -> tuple[ProfileSummaryResponse, ...]:
        return tuple(_summary_response(record) for record in use_cases.list_profiles())

    @router.get("/current", response_model=GameProfileResponse | None)
    def current_profile(
        use_cases: Annotated[ProfileUseCases, Depends(use_cases_provider)],
    ) -> GameProfileResponse | None:
        record = use_cases.get_current_profile()
        return _response(record) if record is not None else None

    @router.post(
        "/{profile_id}/activate",
        response_model=GameProfileResponse,
        responses={404: {"model": ErrorEnvelope}, 409: {"model": ErrorEnvelope}},
    )
    def activate_profile(
        profile_id: str,
        request: Request,
        use_cases: Annotated[ProfileUseCases, Depends(use_cases_provider)],
    ) -> GameProfileResponse | JSONResponse:
        try:
            record = use_cases.activate_profile(profile_id)
        except ProfileUseCaseError as error:
            return _profile_error(request, error)
        return _response(record)

    @router.get(
        "/{profile_id}",
        response_model=GameProfileResponse,
        responses={404: {"model": ErrorEnvelope}},
    )
    def profile_by_id(
        profile_id: str,
        request: Request,
        use_cases: Annotated[ProfileUseCases, Depends(use_cases_provider)],
    ) -> GameProfileResponse | JSONResponse:
        try:
            record = use_cases.get_profile(profile_id)
        except ProfileUseCaseError as error:
            return _profile_error(request, error)
        return _response(record)

    return router
