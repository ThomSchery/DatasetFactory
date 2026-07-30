from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from backend.app.access.store.database import Database
from backend.app.access.store.models import Category, GameProfile, HudRegion, ReferenceAsset


class ProfileNameExistsError(RuntimeError):
    pass


class ProfilePersistenceError(RuntimeError):
    pass


class AssetPublication(Protocol):
    asset_id: str
    relpath: str
    content_type: str
    size_bytes: int

    def publish(self) -> None: ...

    def discard(self) -> None: ...


@dataclass(frozen=True)
class RegionDraft:
    id: str
    name: str
    x: int
    y: int
    width: int
    height: int


@dataclass(frozen=True)
class CategoryDraft:
    id: str
    name: str
    kind: str
    ordinal: int


@dataclass(frozen=True)
class ProfileAggregateDraft:
    id: str
    project_id: str
    name: str
    normalized_name: str
    source_width: int
    source_height: int
    regions: tuple[RegionDraft, ...]
    categories: tuple[CategoryDraft, ...]


@dataclass(frozen=True)
class ProfileRecord:
    id: str
    name: str
    reference_asset_id: str
    source_width: int
    source_height: int
    version: int
    regions: tuple[RegionDraft, ...]
    categories: tuple[CategoryDraft, ...]


class ProfileRepository:
    """Persist and hydrate a profile aggregate in one database transaction."""

    def __init__(self, database: Database) -> None:
        self._database = database

    def create(self, draft: ProfileAggregateDraft, asset: AssetPublication) -> ProfileRecord:
        published = False
        try:
            with self._database.session() as session:
                session.add(
                    ReferenceAsset(
                        id=asset.asset_id,
                        relpath=asset.relpath,
                        content_type=asset.content_type,
                        size_bytes=asset.size_bytes,
                    )
                )
                session.flush()
                session.add(
                    GameProfile(
                        id=draft.id,
                        project_id=draft.project_id,
                        name=draft.name,
                        normalized_name=draft.normalized_name,
                        reference_asset_id=asset.asset_id,
                        source_width=draft.source_width,
                        source_height=draft.source_height,
                        version=1,
                    )
                )
                session.flush()
                session.add_all(
                    [
                        HudRegion(
                            id=region.id,
                            profile_id=draft.id,
                            name=region.name,
                            x=region.x,
                            y=region.y,
                            width=region.width,
                            height=region.height,
                        )
                        for region in draft.regions
                    ]
                )
                session.add_all(
                    [
                        Category(
                            id=category.id,
                            profile_id=draft.id,
                            name=category.name,
                            kind=category.kind,
                            ordinal=category.ordinal,
                        )
                        for category in draft.categories
                    ]
                )
                session.flush()
                asset.publish()
                published = True
        except ProfileNameExistsError:
            asset.discard()
            raise
        except IntegrityError as exc:
            asset.discard()
            if "UNIQUE constraint failed: game_profiles.normalized_name" in str(exc.orig):
                raise ProfileNameExistsError from exc
            raise ProfilePersistenceError from exc
        except Exception:
            asset.discard()
            raise
        if not published:
            asset.discard()
        return ProfileRecord(
            id=draft.id,
            name=draft.name,
            reference_asset_id=asset.asset_id,
            source_width=draft.source_width,
            source_height=draft.source_height,
            version=1,
            regions=draft.regions,
            categories=draft.categories,
        )

    def current(self) -> ProfileRecord | None:
        with self._database.session() as session:
            profile = session.scalar(
                select(GameProfile)
                .order_by(GameProfile.created_at.desc(), GameProfile.id.desc())
                .limit(1)
            )
            if profile is None:
                return None
            regions = tuple(
                RegionDraft(item.id, item.name, item.x, item.y, item.width, item.height)
                for item in session.scalars(
                    select(HudRegion)
                    .where(HudRegion.profile_id == profile.id)
                    .order_by(HudRegion.created_at, HudRegion.id)
                )
            )
            categories = tuple(
                CategoryDraft(item.id, item.name, item.kind, item.ordinal)
                for item in session.scalars(
                    select(Category)
                    .where(Category.profile_id == profile.id)
                    .order_by(Category.ordinal)
                )
            )
            return ProfileRecord(
                id=profile.id,
                name=profile.name,
                reference_asset_id=profile.reference_asset_id,
                source_width=profile.source_width,
                source_height=profile.source_height,
                version=profile.version,
                regions=regions,
                categories=categories,
            )
