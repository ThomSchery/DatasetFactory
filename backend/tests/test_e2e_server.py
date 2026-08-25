from __future__ import annotations

from pathlib import Path

import pytest

from backend.tests.e2e_server import _runtime_root

MARKER_NAME = ".datasetfactory-e2e-runtime"


def configure_runtime(
    monkeypatch: pytest.MonkeyPatch,
    *,
    cache_root: Path,
    runtime_root: Path,
    marker_token: str,
) -> None:
    monkeypatch.setenv("DATASETFACTORY_CACHE_ROOT", str(cache_root))
    monkeypatch.setenv("DATASETFACTORY_E2E_ROOT", str(runtime_root))
    monkeypatch.setenv("DATASETFACTORY_E2E_MARKER_TOKEN", marker_token)


def test_runtime_root_accepts_a_marked_unique_leaf_under_custom_cache(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    cache_root = tmp_path / "custom-cache"
    runtime_root = cache_root / "playwright" / "runtime-1234"
    runtime_root.mkdir(parents=True)
    marker_token = "launcher-token"
    (runtime_root / MARKER_NAME).write_text(marker_token, encoding="utf-8")
    configure_runtime(
        monkeypatch,
        cache_root=cache_root,
        runtime_root=runtime_root,
        marker_token=marker_token,
    )

    assert _runtime_root() == runtime_root.resolve()


def test_runtime_root_rejects_broad_playwright_directory(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    configure_runtime(
        monkeypatch,
        cache_root=Path("D:/DatasetFactory/cache"),
        runtime_root=Path("D:/playwright"),
        marker_token="launcher-token",
    )

    with pytest.raises(RuntimeError, match="launcher-owned leaf"):
        _runtime_root()


def test_runtime_root_rejection_does_not_delete_a_foreign_directory(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    cache_root = tmp_path / "custom-cache"
    foreign_root = cache_root / "playwright" / "runtime-foreign"
    foreign_root.mkdir(parents=True)
    sentinel = foreign_root / "keep.txt"
    sentinel.write_text("keep", encoding="utf-8")
    configure_runtime(
        monkeypatch,
        cache_root=cache_root,
        runtime_root=foreign_root,
        marker_token="missing-marker",
    )

    with pytest.raises(RuntimeError, match="launcher-owned leaf"):
        _runtime_root()

    assert sentinel.read_text(encoding="utf-8") == "keep"
