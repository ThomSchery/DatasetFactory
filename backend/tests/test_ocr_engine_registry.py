"""A run names its OCR engine once; the engines are the registry's, not the Manager's (TK-018)."""

from __future__ import annotations

from collections.abc import Collection
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from backend.app.access.ocr import OcrEngineEntry, OcrEngineRegistry, UnknownOcrEngineError
from backend.app.composition import CompositionRoot
from backend.app.engines.definition import OcrProvenance
from backend.app.main import create_app
from backend.tests.test_durable_workflow import (
    PerRegionOcrEngine,
    StubMediaAccess,
    _create_run,
    _install_workflow,
    _seed,
    _wait_status,
)


class NamedEngine(PerRegionOcrEngine):
    """A test double that reports its own engine id, as every adapter does."""

    def __init__(self, engine_id: str) -> None:
        super().__init__()
        self.engine_id = engine_id

    def _provenance(
        self,
        allowed_chars: Collection[str],
        text_layout: str | None,
    ) -> OcrProvenance:
        return replace(super()._provenance(allowed_chars, text_layout), engine_id=self.engine_id)


def _registry(*engines: NamedEngine, default: str | None = None) -> OcrEngineRegistry:
    return OcrEngineRegistry(
        [OcrEngineEntry(engine.engine_id, engine) for engine in engines],
        default or engines[0].engine_id,
    )


def _body(seeded: Any, engine: str | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {
        "profile_id": seeded.profile_id,
        "video_id": seeded.video_id,
        "interval_ms": 1000,
    }
    if engine is not None:
        body["ocr_engine"] = engine
    return body


def _start(client: TestClient, run: dict[str, Any]) -> None:
    response = client.post(
        f"/api/v1/runs/{run['id']}/start", json={"expected_version": run["version"]}
    )
    assert response.status_code == 202, response.text


# --- the registry ---


def test_the_registry_answers_by_id_and_for_none_with_its_default() -> None:
    alpha, beta = NamedEngine("alpha"), NamedEngine("beta")
    registry = _registry(alpha, beta, default="beta")

    assert registry.get("alpha") is alpha
    assert registry.get(None) is beta
    assert registry.default_id == "beta"
    assert [entry.id for entry in registry.entries] == ["alpha", "beta"]


def test_an_engine_that_is_not_installed_is_refused_by_name() -> None:
    with pytest.raises(UnknownOcrEngineError) as error:
        _registry(NamedEngine("alpha")).get("gamma")

    assert error.value.engine_id == "gamma"


def test_a_registry_needs_unique_ids_and_a_default_among_them() -> None:
    alpha = NamedEngine("alpha")
    with pytest.raises(ValueError, match="unique ids"):
        OcrEngineRegistry([OcrEngineEntry("a", alpha), OcrEngineEntry("a", alpha)], "a")
    with pytest.raises(ValueError, match="default among them"):
        OcrEngineRegistry([OcrEngineEntry("a", alpha)], "missing")


def test_a_bare_engine_becomes_a_registry_that_answers_for_any_run() -> None:
    engine = NamedEngine("whatever")
    registry = OcrEngineRegistry.of(engine)

    assert registry.get(None) is engine
    assert registry.get("anything-a-run-names") is engine


def test_cancelling_reaches_every_engine() -> None:
    cancelled: list[str] = []

    class Counting(NamedEngine):
        def cancel_current(self) -> None:
            cancelled.append(self.engine_id)

    _registry(Counting("a"), Counting("b")).cancel_current()

    assert sorted(cancelled) == ["a", "b"]


# --- a run keeps the engine it was created with ---


def test_a_run_reads_with_the_engine_it_names(composition: CompositionRoot, tmp_path: Path) -> None:
    seeded = _seed(composition, tmp_path)
    alpha, beta = NamedEngine("alpha"), NamedEngine("beta")
    _install_workflow(composition, StubMediaAccess(composition), _registry(alpha, beta))

    with TestClient(create_app(composition.settings, composition=composition)) as client:
        response = client.post("/api/v1/runs", json=_body(seeded, "beta"))
        assert response.status_code == 201, response.text
        run = response.json()
        _start(client, run)
        finished = _wait_status(client, run["id"], "review_ready")

    assert finished["ocr_engine"] == "beta"
    assert beta.detect_calls and not alpha.detect_calls


def test_a_run_that_names_no_engine_uses_the_default(
    composition: CompositionRoot, tmp_path: Path
) -> None:
    seeded = _seed(composition, tmp_path)
    alpha, beta = NamedEngine("alpha"), NamedEngine("beta")
    _install_workflow(composition, StubMediaAccess(composition), _registry(alpha, beta))

    with TestClient(create_app(composition.settings, composition=composition)) as client:
        run = _create_run(client, seeded)
        _start(client, run)
        finished = _wait_status(client, run["id"], "review_ready")

    assert finished["ocr_engine"] == "alpha"
    assert alpha.detect_calls and not beta.detect_calls


def test_an_unknown_engine_is_a_400_and_leaves_no_run(
    composition: CompositionRoot, tmp_path: Path
) -> None:
    seeded = _seed(composition, tmp_path)
    _install_workflow(composition, StubMediaAccess(composition), _registry(NamedEngine("alpha")))

    with TestClient(create_app(composition.settings, composition=composition)) as client:
        response = client.post("/api/v1/runs", json=_body(seeded, "gamma"))
        runs = client.get("/api/v1/runs").json()

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "ocr_engine_unknown"
    assert runs["items"] == []


def test_a_queued_run_starts_on_its_own_engine_not_on_the_default_of_the_day(
    composition: CompositionRoot, tmp_path: Path
) -> None:
    seeded = _seed(composition, tmp_path)
    alpha, beta = NamedEngine("alpha"), NamedEngine("beta")
    media = StubMediaAccess(composition)
    _install_workflow(composition, media, _registry(alpha, beta, default="alpha"))
    with TestClient(create_app(composition.settings, composition=composition)) as client:
        run = client.post("/api/v1/runs", json=_body(seeded, "beta")).json()

    # The application restarts with another default engine; the run still names beta.
    _install_workflow(composition, media, _registry(alpha, beta, default="alpha"))
    with TestClient(create_app(composition.settings, composition=composition)) as client:
        _start(client, run)
        _wait_status(client, run["id"], "review_ready")

    assert beta.detect_calls and not alpha.detect_calls


def test_a_run_whose_engine_is_gone_fails_in_a_controlled_way(
    composition: CompositionRoot, tmp_path: Path
) -> None:
    seeded = _seed(composition, tmp_path)
    alpha, beta = NamedEngine("alpha"), NamedEngine("beta")
    media = StubMediaAccess(composition)
    _install_workflow(composition, media, _registry(alpha, beta))
    with TestClient(create_app(composition.settings, composition=composition)) as client:
        run = client.post("/api/v1/runs", json=_body(seeded, "beta")).json()

    _install_workflow(composition, media, _registry(alpha))
    with TestClient(create_app(composition.settings, composition=composition)) as client:
        _start(client, run)
        failed = _wait_status(client, run["id"], "failed")

    assert failed["error_code"] == "ocr_engine_unavailable"
    assert not alpha.detect_calls


def test_a_third_engine_needs_no_change_above_the_registry(
    composition: CompositionRoot, tmp_path: Path
) -> None:
    """The variability rule: a new adapter and a registry entry are the whole change."""
    seeded = _seed(composition, tmp_path)
    alpha, beta, gamma = NamedEngine("alpha"), NamedEngine("beta"), NamedEngine("gamma")
    _install_workflow(composition, StubMediaAccess(composition), _registry(alpha, beta, gamma))

    with TestClient(create_app(composition.settings, composition=composition)) as client:
        run = client.post("/api/v1/runs", json=_body(seeded, "gamma")).json()
        _start(client, run)
        finished = _wait_status(client, run["id"], "review_ready")

    assert finished["ocr_engine"] == "gamma"
    assert gamma.detect_calls and not alpha.detect_calls and not beta.detect_calls


# --- the status lists the engines a run may choose ---


def test_health_lists_every_engine_with_the_default_first(composition: CompositionRoot) -> None:
    with TestClient(create_app(composition.settings, composition=composition)) as client:
        body = client.get("/api/v1/health").json()

    engines = body["ocr_engines"]
    assert [engine["id"] for engine in engines] == ["tesseract", "rapidocr"]
    assert [engine["default"] for engine in engines] == [True, False]
    assert {engine["id"]: engine["uses_text_layout"] for engine in engines} == {
        "tesseract": True,
        "rapidocr": False,
    }
    # `ocr` stays the default engine's own status.
    assert body["ocr"]["engine"] == engines[0]["name"]
