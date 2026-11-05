from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from backend.app.access.desktop import FileKind, FilePickerError, LocalFilePicker
from backend.app.api.errors import ErrorEnvelope, StrictModel, error_envelope


class PickLocalFileRequest(StrictModel):
    kind: FileKind


class PickLocalFileResponse(StrictModel):
    """`path` is `null` when the user cancelled the dialog."""

    path: str | None


LocalFilePickerProvider = Callable[[], LocalFilePicker]


def create_local_files_router(picker_provider: LocalFilePickerProvider) -> APIRouter:
    router = APIRouter(prefix="/api/v1/local-files", tags=["local-files"])

    @router.post(
        "/pick",
        response_model=PickLocalFileResponse,
        responses={409: {"model": ErrorEnvelope}, 503: {"model": ErrorEnvelope}},
    )
    def pick_local_file(
        payload: PickLocalFileRequest,
        request: Request,
        picker: Annotated[LocalFilePicker, Depends(picker_provider)],
    ) -> PickLocalFileResponse | JSONResponse:
        # Authorization policy: local-public. A plain `def` endpoint runs in the
        # thread pool, so a dialog left open never blocks the event loop.
        try:
            picked = picker.pick(payload.kind)
        except FilePickerError as error:
            envelope = error_envelope(
                request,
                code=error.code,
                message="The local file dialog could not be opened.",
            )
            status_code = 409 if error.code == "file_picker_busy" else 503
            return JSONResponse(status_code=status_code, content=envelope.model_dump())
        return PickLocalFileResponse(path=picked.path)

    return router
