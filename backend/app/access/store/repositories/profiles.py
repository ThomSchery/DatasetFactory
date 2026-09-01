from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.access.store.database import Database
from backend.app.access.store.models import (
    Category,
    GameProfile,
    HudRegion,
    PipelineRun,
    Project,
    ReferenceAsset,
)


class ProfileNameExistsError(RuntimeError):
    pass


class ProfilePersistenceError(RuntimeError):
    pass


class ProfileNotFoundError(LookupError):
    pass


class ProfileSelectionBlockedError(RuntimeError):
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


@dataclass(frozen=True)
class ProfileSummaryRecord:
    id: str
    name: str
    reference_asset_id: str
    source_width: int
    source_height: int
    region_count: int
    category_count: int
    created_at: datetime
    active: bool


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
                project = session.get(Project, draft.project_id)
                if project is not None and project.active_profile_id is None:
                    project.active_profile_id = draft.id
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
            project = session.scalar(
                select(Project).order_by(Project.created_at, Project.id).limit(1)
            )
            if project is None:
                return None
            profile = (
                session.get(GameProfile, project.active_profile_id)
                if project.active_profile_id is not None
                else None
            )
            if profile is None:
                profile = session.scalar(
                    select(GameProfile)
                    .where(GameProfile.project_id == project.id)
                    .order_by(GameProfile.created_at.desc(), GameProfile.id.desc())
                    .limit(1)
                )
            if profile is None:
                return None
            return self._record(session, profile)

    def list(self) -> tuple[ProfileSummaryRecord, ...]:
        with self._database.session() as session:
            project = session.scalar(
                select(Project).order_by(Project.created_at, Project.id).limit(1)
            )
            if project is None:
                return ()
            profiles = tuple(
                session.scalars(
                    select(GameProfile)
                    .where(GameProfile.project_id == project.id)
                    .order_by(GameProfile.created_at.desc(), GameProfile.id.desc())
                )
            )
            fallback_id = profiles[0].id if project.active_profile_id is None and profiles else None
            active_id = project.active_profile_id or fallback_id
            return tuple(
                ProfileSummaryRecord(
                    id=profile.id,
                    name=profile.name,
                    reference_asset_id=profile.reference_asset_id,
                    source_width=profile.source_width,
                    source_height=profile.source_height,
                    region_count=int(
                        session.scalar(
                            select(func.count())
                            .select_from(HudRegion)
                            .where(HudRegion.profile_id == profile.id)
                        )
                        or 0
                    ),
                    category_count=int(
                        session.scalar(
                            select(func.count())
                            .select_from(Category)
                            .where(Category.profile_id == profile.id)
                        )
                        or 0
                    ),
                    created_at=profile.created_at,
                    active=profile.id == active_id,
                )
                for profile in profiles
            )

    def activate(self, profile_id: str) -> ProfileRecord:
        with self._database.session() as session:
            session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            profile = session.get(GameProfile, profile_id)
            if profile is None:
                raise ProfileNotFoundError
            slot_owner = session.scalar(
                select(PipelineRun.id).where(PipelineRun.workflow_slot == 1).limit(1)
            )
            if slot_owner is not None:
                raise ProfileSelectionBlockedError
            project = session.get(Project, profile.project_id)
            if project is None:
                raise ProfileNotFoundError
            project.active_profile_id = profile.id
            session.flush()
            return self._record(session, profile)

    def get(self, profile_id: str) -> ProfileRecord:
        with self._database.session() as session:
            profile = session.get(GameProfile, profile_id)
            if profile is None:
                raise ProfileNotFoundError
            return self._record(session, profile)

    @staticmethod
    def _record(session: Session, profile: GameProfile) -> ProfileRecord:
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
                select(Category).where(Category.profile_id == profile.id).order_by(Category.ordinal)
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
