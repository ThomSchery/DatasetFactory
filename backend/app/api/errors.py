from __future__ import annotations

from typing import Any

from fastapi import Request
from pydantic import BaseModel, ConfigDict


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ErrorBody(StrictModel):
    code: str
    message: str
    details: dict[str, Any]
    request_id: str


class ErrorEnvelope(StrictModel):
    error: ErrorBody


def request_id_for(request: Request) -> str:
    return str(request.state.request_id)


def error_envelope(
    request: Request,
    *,
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> ErrorEnvelope:
    return ErrorEnvelope(
        error=ErrorBody(
            code=code,
            message=message,
            details=details or {},
            request_id=request_id_for(request),
        )
    )
