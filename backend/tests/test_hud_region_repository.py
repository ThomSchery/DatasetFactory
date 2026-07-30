from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from backend.app.access.store.models import GameProfile, HudRegion, Project, ReferenceAsset
from backend.app.access.store.repository import HudRegionDraft, InvalidHudRegionError
from backend.app.composition import CompositionRoot


def _profile_id() -> str:
    return str(uuid4())


def _create_profile(composition: CompositionRoot) -> str:
    project_id = str(uuid4())
    profile_id = _profile_id()
    with composition.database.session() as session:
        session.add(
            Project(
                id=project_id, name="Bounds test", workspace_path=str(composition.workspace.root)
            )
        )
        session.flush()
        asset_id = str(uuid4())
        session.add(
            ReferenceAsset(
                id=asset_id,
                relpath=f"assets/references/{asset_id}.png",
                content_type="image/png",
                size_bytes=1,
            )
        )
        session.flush()
        session.add(
            GameProfile(
                id=profile_id,
                project_id=project_id,
                name=f"profile-{profile_id}",
                normalized_name=f"profile-{profile_id}",
                reference_asset_id=asset_id,
                source_width=1920,
                source_height=1080,
                version=1,
            )
        )
    return profile_id


def _draft(profile_id: str, **overrides: int) -> HudRegionDraft:
    values = {"x": 100, "y": 100, "width": 200, "height": 100} | overrides
    return HudRegionDraft(
        id=str(uuid4()),
        profile_id=profile_id,
        name=f"region-{uuid4()}",
        **values,
    )


def test_region_at_source_edge_is_persisted(composition: CompositionRoot) -> None:
    profile_id = _create_profile(composition)
    draft = _draft(profile_id, x=1820, y=980, width=100, height=100)

    region = composition.project_store.add_hud_region(draft)

    assert region.id == draft.id
    with composition.database.session() as session:
        assert session.get(HudRegion, draft.id) is not None


def test_region_outside_parent_bounds_never_reaches_storage(
    composition: CompositionRoot,
) -> None:
    invalid_geometries = [
        {"x": -1},
        {"y": -1},
        {"width": 0},
        {"height": 0},
        {"width": -1},
        {"height": -1},
        {"x": 1821, "width": 100},
        {"y": 981, "height": 100},
    ]
    profile_id = _create_profile(composition)

    for overrides in invalid_geometries:
        with pytest.raises(InvalidHudRegionError):
            composition.project_store.add_hud_region(_draft(profile_id, **overrides))

    with composition.database.session() as session:
        assert session.scalar(select(func.count()).select_from(HudRegion)) == 0


def test_database_checks_reject_invalid_standalone_geometry(
    composition: CompositionRoot,
) -> None:
    invalid_geometries = [{"x": -1}, {"y": -1}, {"width": 0}, {"height": 0}]
    profile_id = _create_profile(composition)
    for overrides in invalid_geometries:
        draft = _draft(profile_id, **overrides)
        region = HudRegion(
            id=draft.id,
            profile_id=draft.profile_id,
            name=draft.name,
            x=draft.x,
            y=draft.y,
            width=draft.width,
            height=draft.height,
        )

        with pytest.raises(IntegrityError), composition.database.session() as session:
            session.add(region)
            session.flush()
