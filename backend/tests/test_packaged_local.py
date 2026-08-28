from __future__ import annotations

import re
from pathlib import Path
from typing import cast

import pytest
from fastapi import Request
from fastapi.testclient import TestClient
from starlette.types import Scope

from backend.app.composition import CompositionRoot
from backend.app.config import Settings
from backend.app.main import _matches_declared_api_path, create_app


def _built_spa(root: Path) -> Path:
    spa_dir = root / "dist"
    assets_dir = spa_dir / "assets"
    assets_dir.mkdir(parents=True)
    (spa_dir / "index.html").write_text(
        '<!doctype html><div id="root"></div><script src="/assets/app.js"></script>',
        encoding="utf-8",
    )
    (assets_dir / "app.js").write_text("globalThis.packagedLocal = true;", encoding="utf-8")
    return spa_dir


def _error_without_request_id(response_body: dict[str, object]) -> dict[str, object]:
    error = dict(cast(dict[str, object], response_body["error"]))
    error.pop("request_id")
    return error


def _request_for_path(path: str) -> Request:
    scope: Scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "root_path": "",
        "headers": [],
        "client": ("testclient", 50000),
        "server": ("testserver", 80),
    }
    return Request(scope)


def test_packaged_local_serves_spa_client_routes_and_api_from_one_app(
    tmp_path: Path,
    settings: Settings,
    composition: CompositionRoot,
) -> None:
    packaged_settings = settings.model_copy(update={"spa_dir": _built_spa(tmp_path)})

    with TestClient(create_app(packaged_settings, composition=composition)) as client:
        root = client.get("/")
        client_route = client.get("/profile-gier")
        asset = client.get("/assets/app.js")
        health = client.get("/api/v1/health")
        missing_api = client.get("/api/v1/not-a-route")

    assert root.status_code == 200
    assert root.headers["content-type"].startswith("text/html")
    assert client_route.content == root.content
    assert asset.text == "globalThis.packagedLocal = true;"
    assert health.status_code == 200
    assert health.headers["content-type"].startswith("application/json")
    assert missing_api.status_code == 404
    assert missing_api.json()["error"]["code"] == "route_not_found"


@pytest.mark.parametrize("method", ["GET", "POST", "PATCH"])
def test_packaged_local_preserves_dev_unknown_api_route_contract_for_every_method(
    tmp_path: Path,
    settings: Settings,
    composition: CompositionRoot,
    method: str,
) -> None:
    packaged_settings = settings.model_copy(update={"spa_dir": _built_spa(tmp_path)})

    with TestClient(create_app(settings, composition=composition)) as dev_client:
        dev_response = dev_client.request(method, "/api/v1/not-a-route")
    with TestClient(create_app(packaged_settings, composition=composition)) as packaged_client:
        packaged_response = packaged_client.request(method, "/api/v1/not-a-route")

    assert packaged_response.status_code == dev_response.status_code == 404
    assert (
        _error_without_request_id(packaged_response.json())
        == _error_without_request_id(dev_response.json())
        == {
            "code": "route_not_found",
            "message": "Route not found.",
            "details": {},
        }
    )
    assert (
        packaged_response.json()["error"]["request_id"] == packaged_response.headers["X-Request-ID"]
    )


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/api/v1/runs"),
        ("POST", "/api/v1/health"),
        ("PATCH", "/api/v1/health"),
    ],
)
def test_packaged_local_preserves_dev_known_api_path_wrong_method_contract(
    tmp_path: Path,
    settings: Settings,
    composition: CompositionRoot,
    method: str,
    path: str,
) -> None:
    packaged_settings = settings.model_copy(update={"spa_dir": _built_spa(tmp_path)})

    with TestClient(create_app(settings, composition=composition)) as dev_client:
        dev_response = dev_client.request(method, path)
    with TestClient(create_app(packaged_settings, composition=composition)) as packaged_client:
        packaged_response = packaged_client.request(method, path)

    assert packaged_response.status_code == dev_response.status_code == 405
    assert (
        _error_without_request_id(packaged_response.json())
        == _error_without_request_id(dev_response.json())
        == {
            "code": "http_error",
            "message": "HTTP request failed.",
            "details": {},
        }
    )


def test_declared_api_path_predicate_recognizes_every_effective_openapi_path(
    settings: Settings,
    composition: CompositionRoot,
) -> None:
    application = create_app(settings, composition=composition)
    api_paths = [path for path in application.openapi()["paths"] if path.startswith("/api/")]

    assert api_paths
    for path_template in api_paths:
        concrete_path = re.sub(r"{[^}]+}", "probe", path_template)
        assert _matches_declared_api_path(
            application,
            _request_for_path(concrete_path),
        ), path_template


@pytest.mark.parametrize("missing", ["index", "assets"])
def test_packaged_local_rejects_an_incomplete_spa_build(
    tmp_path: Path,
    settings: Settings,
    missing: str,
) -> None:
    spa_dir = _built_spa(tmp_path)
    if missing == "index":
        (spa_dir / "index.html").unlink()
    else:
        (spa_dir / "assets" / "app.js").unlink()
        (spa_dir / "assets").rmdir()

    with pytest.raises(
        RuntimeError,
        match=r"DF_SPA_DIR must contain a built index\.html and assets directory",
    ):
        create_app(settings.model_copy(update={"spa_dir": spa_dir}))
