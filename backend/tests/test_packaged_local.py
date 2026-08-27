from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app.composition import CompositionRoot
from backend.app.config import Settings
from backend.app.main import create_app


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
        match="DF_SPA_DIR must contain a built index.html and assets directory",
    ):
        create_app(settings.model_copy(update={"spa_dir": spa_dir}))
