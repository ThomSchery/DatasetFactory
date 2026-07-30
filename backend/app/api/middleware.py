from __future__ import annotations

import logging
import time
from collections.abc import Awaitable, Callable
from uuid import UUID, uuid4

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Assign a UUID request_id and log bounded HTTP metadata only."""

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        request_id = self._request_id(request.headers.get("X-Request-ID"))
        request.state.request_id = request_id
        started = time.perf_counter()
        response = await call_next(request)
        response.headers["X-Request-ID"] = str(request_id)

        route = request.scope.get("route")
        route_template = getattr(route, "path", "unmatched")
        logging.getLogger("datasetfactory.http").info(
            "request_completed",
            extra={
                "request_id": str(request_id),
                "method": request.method,
                "route": route_template,
                "status_code": response.status_code,
                "duration_ms": round((time.perf_counter() - started) * 1000, 2),
            },
        )
        return response

    @staticmethod
    def _request_id(candidate: str | None) -> UUID:
        if candidate is not None:
            try:
                return UUID(candidate)
            except ValueError:
                pass
        return uuid4()
