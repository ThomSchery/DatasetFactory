from __future__ import annotations

import json
from pathlib import Path
from typing import ClassVar
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from pytest import MonkeyPatch

from backend.app.access.ocr import TesseractRuntimeIdentity
from backend.app.access.status.service import (
    ProbeResult,
    SystemStatusAccess,
    TesseractDependencyProbe,
)
from backend.app.composition import CompositionRoot
from backend.app.config import Settings
from backend.app.main import create_app


class FilePresenceResourceProbe:
    """Test probe whose availability follows the configured filesystem path."""

    _EXPECTED: ClassVar[dict[str, tuple[tuple[str, ...], str]]] = {
        "ffmpeg.exe": (("-version",), "ffmpeg version"),
        "ffprobe.exe": (("-version",), "ffprobe version"),
        "tesseract.exe": (("--version",), "tesseract"),
    }

    def executable(
        self,
        path: Path,
        *,
        arguments: tuple[str, ...],
        output_marker: str,
        timeout_seconds: int,
    ) -> ProbeResult:
        del timeout_seconds
        if not path.is_file():
            return ProbeResult(False, "not_found")
        if self._EXPECTED.get(path.name.lower()) != (arguments, output_marker):
            return ProbeResult(False, "unexpected_probe")
        return ProbeResult(True, "available")

    def gpu(self, *, timeout_seconds: int) -> ProbeResult:
        del timeout_seconds
        return ProbeResult(True, "available")


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


def test_health_openapi_closes_the_overall_status_contract(
    settings: Settings,
    composition: CompositionRoot,
) -> None:
    with TestClient(create_app(settings, composition=composition)) as client:
        response = client.get("/openapi.json")

    status_schema = response.json()["components"]["schemas"]["HealthResponse"]["properties"][
        "status"
    ]
    assert status_schema["enum"] == ["ok", "degraded", "unavailable"]


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


def test_missing_operator_tesseract_is_an_explicit_degraded_200_without_traceback(
    settings: Settings,
    composition: CompositionRoot,
) -> None:
    settings.tesseract_path.unlink()
    settings.tesseract_model_path.unlink()

    with TestClient(create_app(settings, composition=composition)) as client:
        response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json()["status"] == "degraded"
    assert response.json()["tesseract"] == {
        "available": False,
        "critical": False,
        "detail": (
            "Stan zdegradowany: brak zweryfikowanej instalacji operatora; "
            "realny OCR jest wylaczony (TD-015)."
        ),
    }


def test_operator_tesseract_checksum_mismatch_is_degraded_and_never_reported_available(
    settings: Settings,
    composition: CompositionRoot,
) -> None:
    settings.tesseract_model_path.write_bytes(b"tampered model")

    with TestClient(create_app(settings, composition=composition)) as client:
        response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json()["status"] == "degraded"
    assert response.json()["tesseract"] == {
        "available": False,
        "critical": False,
        "detail": (
            "Stan zdegradowany: suma SHA-256 runtime lub modelu jest niezgodna; "
            "realny OCR jest wylaczony (TD-015)."
        ),
    }


@pytest.mark.parametrize(
    ("missing_setting", "missing_name", "expected_detail"),
    [
        (
            "ffmpeg_path",
            "missing-ffmpeg.exe",
            "Stan zdegradowany: FFmpeg jest niedostepny (not_found).",
        ),
        (
            "ffprobe_path",
            "missing-ffprobe.exe",
            "Stan zdegradowany: ffprobe jest niedostepny (not_found).",
        ),
    ],
)
def test_missing_configured_media_dependency_is_explicit_degraded_200(
    tmp_path: Path,
    settings: Settings,
    composition: CompositionRoot,
    missing_setting: str,
    missing_name: str,
    expected_detail: str,
) -> None:
    settings.ffmpeg_path.write_bytes(b"fixture ffmpeg runtime")
    settings.ffprobe_path.write_bytes(b"fixture ffprobe runtime")
    degraded_settings = settings.model_copy(
        update={missing_setting: tmp_path / "tools" / missing_name}
    )
    resource_probe = FilePresenceResourceProbe()
    composition.system_status = SystemStatusAccess(
        composition.database,
        composition.workspace,
        degraded_settings,
        resource_probe,
        TesseractDependencyProbe(
            TesseractRuntimeIdentity(
                degraded_settings.tesseract_path,
                degraded_settings.tesseract_model_path,
                degraded_settings.tesseract_version,
                degraded_settings.tesseract_runtime_sha256,
                degraded_settings.tesseract_model_sha256,
            ),
            resource_probe,
            timeout_seconds=degraded_settings.tesseract_timeout_seconds,
        ),
    )

    with TestClient(create_app(degraded_settings, composition=composition)) as client:
        response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json()["status"] == "degraded"
    assert response.json()["ffmpeg"] == {
        "available": False,
        "critical": False,
        "detail": expected_detail,
    }


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
