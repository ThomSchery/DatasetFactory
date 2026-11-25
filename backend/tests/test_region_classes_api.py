"""FE-026. Every active HUD region is also a class the operator can draw.

The user defines a profile so OCR reads its regions, and draws a region by hand
where OCR missed it. That needs a class of the region's name in review, so the
rule holds on every route that writes regions — creating a profile, adding one
region, saving a whole definition — and survives renaming either side. These
tests read the profile through the API, the same document review loads.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app.access.store.models import Annotation, Category
from backend.app.composition import CompositionRoot
from backend.app.main import create_app
from backend.tests.test_profile_definition_save_api import (
    REFERENCE_HEIGHT,
    REFERENCE_WIDTH,
    _create_payload,
    _definition,
    _named,
    _seed_run,
)
from backend.tests.test_profile_workflow_api import _write_png


def _classes(profile: dict[str, Any]) -> list[tuple[str, str]]:
    return [(category["name"], category["kind"]) for category in profile["categories"]]


def _ordinals(composition: CompositionRoot, profile_id: str) -> list[tuple[str, int]]:
    with composition.database.session() as session:
        rows = session.execute(
            select(Category.name, Category.ordinal)
            .where(Category.profile_id == profile_id)
            .order_by(Category.ordinal)
        ).all()
    return [(row.name, row.ordinal) for row in rows]


def _annotate(composition: CompositionRoot, *, frame_id: str, category_id: str) -> str:
    """One box drawn by hand under `category_id`, the way review stores it."""
    annotation_id = str(uuid4())
    with composition.database.session() as session:
        session.add(
            Annotation(
                id=annotation_id,
                frame_id=frame_id,
                category_id=category_id,
                x=1,
                y=1,
                width=2,
                height=2,
                confidence=None,
                source="manual",
                observation_id=None,
                status="accepted",
                version=1,
            )
        )
    return annotation_id


def _reference(tmp_path: Path) -> Path:
    source = tmp_path / "reference.png"
    _write_png(source, width=REFERENCE_WIDTH, height=REFERENCE_HEIGHT)
    return source


def test_a_new_profile_offers_every_region_as_a_class(
    composition: CompositionRoot, tmp_path: Path
) -> None:
    payload = _create_payload(_reference(tmp_path))
    # `HUD` has no class; `timer` folds onto an existing class and adds none.
    payload["categories"].append({"name": " TIMER ", "kind": "game"})

    with TestClient(create_app(composition.settings, composition=composition)) as client:
        created = client.post("/api/v1/profiles", json=payload)
        reloaded = client.get(f"/api/v1/profiles/{created.json()['id']}").json()

    assert created.status_code == 201, created.text
    assert _classes(created.json()) == [
        ("0", "character"),
        ("1", "character"),
        ("health", "game"),
        ("TIMER", "game"),
        ("HUD", "game"),
    ]
    assert reloaded == created.json()


def test_adding_a_region_adds_its_class(composition: CompositionRoot, tmp_path: Path) -> None:
    with TestClient(create_app(composition.settings, composition=composition)) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(_reference(tmp_path))).json()
        response = client.post(
            f"/api/v1/profiles/{profile['id']}/regions",
            json={
                "name": "kill",
                "x": 0,
                "y": 12,
                "width": 8,
                "height": 8,
                "allowed_chars": "0",
                "page_segmentation_mode": 7,
                "expected_version": profile["version"],
            },
        )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["version"] == profile["version"] + 1
    assert _classes(body)[-1] == ("kill", "game")
    assert _ordinals(composition, profile["id"])[-1] == ("kill", 5)


def test_a_region_drawn_in_a_save_gets_its_class(
    composition: CompositionRoot, tmp_path: Path
) -> None:
    with TestClient(create_app(composition.settings, composition=composition)) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(_reference(tmp_path))).json()
        draft = _definition(profile)
        draft["regions"].append(
            {
                "id": None,
                "name": "score_left",
                "x": 0,
                "y": 12,
                "width": 8,
                "height": 8,
                "allowed_chars": "01",
                "page_segmentation_mode": 7,
            }
        )
        response = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft)

    assert response.status_code == 200, response.text
    assert ("score_left", "game") in _classes(response.json())


def test_a_renamed_region_takes_its_class_and_its_boxes_along(
    composition: CompositionRoot, tmp_path: Path
) -> None:
    with TestClient(create_app(composition.settings, composition=composition)) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(_reference(tmp_path))).json()
        hud_class = _named(profile["categories"], "HUD")
        ids = _seed_run(composition, profile=profile, tmp_path=tmp_path)
        annotation_id = _annotate(composition, frame_id=ids["frame"], category_id=hud_class["id"])
        draft = _definition(profile)
        _named(draft["regions"], "HUD")["name"] = "kill"
        response = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft)

    assert response.status_code == 200, response.text
    body = response.json()
    renamed = _named(body["categories"], "kill")
    assert renamed["id"] == hud_class["id"]
    assert all(category["name"] != "HUD" for category in body["categories"])
    with composition.database.session() as session:
        annotation = session.get(Annotation, annotation_id)
        assert annotation is not None
        assert annotation.category_id == hud_class["id"]
    # Same row, same ordinal: an export identifier does not move.
    assert ("kill", 3) in _ordinals(composition, profile["id"])


def test_a_region_renamed_onto_an_existing_class_adopts_it(
    composition: CompositionRoot, tmp_path: Path
) -> None:
    with TestClient(create_app(composition.settings, composition=composition)) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(_reference(tmp_path))).json()
        draft = _definition(profile)
        _named(draft["regions"], "HUD")["name"] = "Health"
        response = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft)

    assert response.status_code == 200, response.text
    names = [name for name, _ in _classes(response.json())]
    # `health` already was a class, so nothing is renamed onto it and the old
    # region class stays a plain class the operator may remove.
    assert names == ["0", "1", "health", "HUD", "timer"]


def test_swapped_region_names_keep_both_classes_where_they_are(
    composition: CompositionRoot, tmp_path: Path
) -> None:
    with TestClient(create_app(composition.settings, composition=composition)) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(_reference(tmp_path))).json()
        draft = _definition(profile)
        _named(draft["regions"], "HUD")["name"] = "timer-new"
        _named(draft["regions"], "timer")["name"] = "HUD"
        _named(draft["regions"], "timer-new")["name"] = "timer"
        response = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft)

    assert response.status_code == 200, response.text
    assert response.json()["categories"] == profile["categories"]


def test_a_draft_that_drops_a_region_class_keeps_it(
    composition: CompositionRoot, tmp_path: Path
) -> None:
    with TestClient(create_app(composition.settings, composition=composition)) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(_reference(tmp_path))).json()
        hud_class = _named(profile["categories"], "HUD")
        draft = _definition(profile)
        draft["categories"] = [
            category for category in draft["categories"] if category["id"] != hud_class["id"]
        ]
        response = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft)

    assert response.status_code == 200, response.text
    # The same row, not a fresh one with a new ordinal.
    assert _named(response.json()["categories"], "HUD") == hud_class


def test_removing_a_region_lets_its_unused_class_go(
    composition: CompositionRoot, tmp_path: Path
) -> None:
    with TestClient(create_app(composition.settings, composition=composition)) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(_reference(tmp_path))).json()
        draft = _definition(profile)
        draft["regions"] = [region for region in draft["regions"] if region["name"] != "timer"]
        draft["categories"] = [
            category for category in draft["categories"] if category["name"] != "timer"
        ]
        response = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft)

    assert response.status_code == 200, response.text
    assert [name for name, _ in _classes(response.json())] == ["0", "1", "health", "HUD"]


def test_renaming_a_region_class_gives_the_region_its_class_back(
    composition: CompositionRoot, tmp_path: Path
) -> None:
    with TestClient(create_app(composition.settings, composition=composition)) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(_reference(tmp_path))).json()
        hud_class = _named(profile["categories"], "HUD")
        response = client.patch(
            f"/api/v1/profiles/{profile['id']}/categories/{hud_class['id']}",
            json={"name": "overlay", "kind": "game", "expected_version": profile["version"]},
        )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["version"] == profile["version"] + 1
    assert _named(body["categories"], "overlay")["id"] == hud_class["id"]
    assert _named(body["categories"], "HUD")["kind"] == "game"


def test_a_region_class_never_takes_the_ordinal_of_a_class_dropped_in_the_same_save(
    composition: CompositionRoot, tmp_path: Path
) -> None:
    """Cold review P3-1: the ordinal floor is read before the save removes anything."""
    with TestClient(create_app(composition.settings, composition=composition)) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(_reference(tmp_path))).json()
        draft = _definition(profile)
        # `timer` holds the highest ordinal (4); it goes, region and class.
        draft["regions"] = [region for region in draft["regions"] if region["name"] != "timer"]
        draft["categories"] = [
            category for category in draft["categories"] if category["name"] != "timer"
        ]
        draft["regions"].append(
            {
                "id": None,
                "name": "frag",
                "x": 0,
                "y": 12,
                "width": 8,
                "height": 8,
                "allowed_chars": "0",
                "page_segmentation_mode": 7,
            }
        )
        response = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft)

    assert response.status_code == 200, response.text
    assert _ordinals(composition, profile["id"]) == [
        ("0", 0),
        ("1", 1),
        ("health", 2),
        ("HUD", 3),
        ("frag", 5),
    ]


# --- FE-030: removing a region removes its class unless a box uses it --------


def test_removing_a_region_removes_its_unused_class(
    composition: CompositionRoot, tmp_path: Path
) -> None:
    """The draft still sends the stored class; the save drops it anyway."""
    with TestClient(create_app(composition.settings, composition=composition)) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(_reference(tmp_path))).json()
        draft = _definition(profile)
        draft["regions"] = [region for region in draft["regions"] if region["name"] != "timer"]
        response = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft)

    assert response.status_code == 200, response.text
    assert [name for name, _ in _classes(response.json())] == ["0", "1", "health", "HUD"]


def test_removing_a_region_keeps_a_class_that_boxes_use(
    composition: CompositionRoot, tmp_path: Path
) -> None:
    with TestClient(create_app(composition.settings, composition=composition)) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(_reference(tmp_path))).json()
        timer_class = _named(profile["categories"], "timer")
        ids = _seed_run(composition, profile=profile, tmp_path=tmp_path)
        annotation_id = _annotate(composition, frame_id=ids["frame"], category_id=timer_class["id"])
        draft = _definition(profile)
        draft["regions"] = [region for region in draft["regions"] if region["name"] != "timer"]
        response = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft)

    assert response.status_code == 200, response.text
    assert _named(response.json()["categories"], "timer") == timer_class
    with composition.database.session() as session:
        annotation = session.get(Annotation, annotation_id)
        assert annotation is not None
        assert annotation.category_id == timer_class["id"]


def test_a_box_redrawn_under_the_removed_name_keeps_the_class(
    composition: CompositionRoot, tmp_path: Path
) -> None:
    with TestClient(create_app(composition.settings, composition=composition)) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(_reference(tmp_path))).json()
        timer_class = _named(profile["categories"], "timer")
        draft = _definition(profile)
        old = _named(draft["regions"], "timer")
        draft["regions"] = [region for region in draft["regions"] if region["name"] != "timer"]
        draft["regions"].append(old | {"id": None, "x": 0, "y": 12})
        response = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft)

    assert response.status_code == 200, response.text
    # Same class row and ordinal: the redrawn region simply carries it on.
    assert _named(response.json()["categories"], "timer") == timer_class


def test_removing_a_region_never_touches_an_ocr_character_class(
    composition: CompositionRoot, tmp_path: Path
) -> None:
    payload = _create_payload(_reference(tmp_path))
    payload["regions"][1]["name"] = "1"
    with TestClient(create_app(composition.settings, composition=composition)) as client:
        profile = client.post("/api/v1/profiles", json=payload).json()
        draft = _definition(profile)
        draft["regions"] = [region for region in draft["regions"] if region["name"] != "1"]
        response = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft)

    assert response.status_code == 200, response.text
    assert ("1", "character") in _classes(response.json())
