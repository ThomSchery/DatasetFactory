from collections.abc import Callable
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse, JSONResponse

from backend.app.api.errors import ErrorEnvelope, error_envelope
from backend.app.managers.workflow.profile_use_cases import ProfileUseCaseError, ProfileUseCases

ProfileUseCasesProvider = Callable[[], ProfileUseCases]


def create_assets_router(use_cases_provider: ProfileUseCasesProvider) -> APIRouter:
    router = APIRouter(prefix="/api/v1/assets", tags=["assets"])

    @router.get(
        "/references/{asset_id}",
        response_model=None,
        response_class=FileResponse,
        responses={404: {"model": ErrorEnvelope}},
    )
    def reference_asset(
        asset_id: UUID,
        request: Request,
        use_cases: Annotated[ProfileUseCases, Depends(use_cases_provider)],
    ) -> FileResponse | JSONResponse:
        # Authorization policy: local-public. Only a UUID resolved through persistence is accepted.
        try:
            asset = use_cases.get_reference_asset(str(asset_id))
        except ProfileUseCaseError:
            envelope = error_envelope(
                request,
                code="asset_not_found",
                message="Reference asset was not found.",
            )
            return JSONResponse(status_code=404, content=envelope.model_dump())
        return FileResponse(
            asset.path,
            media_type=asset.content_type,
            filename=None,
            headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"},
        )

    return router
