from __future__ import annotations

import json
from pathlib import Path
from uuid import UUID

from fastapi.testclient import TestClient
from pytest import MonkeyPatch

from backend.app.composition import CompositionRoot
from backend.app.config import Settings
from backend.app.main import create_app


def test_health_200_reports_all_dependencies(
    settings: Settings,
    composition: CompositionRoot,
) -> None:
    with TestClient(create_app(settings, composition=composition)) as client:
        response = client.get("/api/v1/health")

    assert response.status_code == 200
    body = response.json()
    assert body["version"] == "0.1.0"
    assert body["status"] == "ok"
    assert body["database"]["available"] is True
    assert body["workspace"]["critical"] is True
    assert body["ffmpeg"]["available"] is True
    assert body["tesseract"]["available"] is True
    assert body["gpu"]["available"] is True
    assert UUID(response.headers["X-Request-ID"]) == UUID(
        body.get("request_id", response.headers["X-Request-ID"])
    )


def test_health_503_uses_error_envelope(
    settings: Settings,
    composition: CompositionRoot,
    monkeypatch: MonkeyPatch,
) -> None:
    monkeypatch.setattr(composition.database, "check_health", lambda: False)
    with TestClient(create_app(settings, composition=composition)) as client:
        response = client.get("/api/v1/health")

    assert response.status_code == 503
    error = response.json()["error"]
    assert error["code"] == "dependency_unavailable"
    assert error["details"]["health"]["database"]["available"] is False
    assert error["request_id"] == response.headers["X-Request-ID"]


def test_unmatched_route_uses_safe_error_envelope_and_request_id(
    settings: Settings,
    composition: CompositionRoot,
) -> None:
    private_value = "D:/private/crop-secret.png"
    with TestClient(create_app(settings, composition=composition)) as client:
        response = client.get("/api/v1/missing", params={"source": private_value})

    assert response.status_code == 404
    assert response.json() == {
        "error": {
            "code": "route_not_found",
            "message": "Route not found.",
            "details": {},
            "request_id": response.headers["X-Request-ID"],
        }
    }

    for handler in composition.logger.handlers:
        handler.flush()
    log_contents = Path(composition.log_path).read_text(encoding="utf-8")
    assert private_value not in log_contents
    assert "crop-secret" not in log_contents


def test_unhandled_500_logs_redacted_traceback_and_returns_safe_envelope(
    settings: Settings,
    composition: CompositionRoot,
) -> None:
    application = create_app(settings, composition=composition)

    @application.get("/api/v1/test/unhandled")
    def raise_unhandled() -> None:
        raise RuntimeError("failed D:/private/video.mp4 OCR=TOP-SECRET-OCR")

    with TestClient(application, raise_server_exceptions=False) as client:
        response = client.get("/api/v1/test/unhandled")

    assert response.status_code == 500
    error = response.json()["error"]
    assert error == {
        "code": "internal_error",
        "message": "An unexpected local application error occurred.",
        "details": {},
        "request_id": response.headers["X-Request-ID"],
    }

    for handler in composition.logger.handlers:
        handler.flush()
    records = [
        json.loads(line)
        for line in Path(composition.log_path).read_text(encoding="utf-8").splitlines()
    ]
    exception_record = next(
        record for record in records if record["message"] == "unhandled_request_error"
    )
    serialized = json.dumps(exception_record)
    assert exception_record["request_id"] == response.headers["X-Request-ID"]
    assert exception_record["exception"]["type"] == "RuntimeError"
    assert exception_record["exception"]["traceback"]
    assert "D:/private/video.mp4" not in serialized
    assert "TOP-SECRET-OCR" not in serialized
