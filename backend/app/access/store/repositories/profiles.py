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


class CategoryNameExistsError(RuntimeError):
    def __init__(
        self,
        *,
        category_id: str | None = None,
        category_name: str | None = None,
    ) -> None:
        super().__init__(category_name)
        self.category_id = category_id
        self.category_name = category_name


class CategoryNotFoundError(LookupError):
    pass


class CategoryUsedByRegionsError(RuntimeError):
    def __init__(self, regions: tuple[tuple[str, str], ...]) -> None:
        super().__init__(", ".join(name for _, name in regions))
        self.regions = regions


class RegionNameExistsError(RuntimeError):
    def __init__(
        self,
        *,
        region_id: str | None = None,
        region_name: str | None = None,
    ) -> None:
        super().__init__(region_name)
        self.region_id = region_id
        self.region_name = region_name


class RegionNotFoundError(LookupError):
    pass


class ProfileRegionBlockedError(RuntimeError):
    """A run bound to this profile may still execute cropping work."""


class ProfileVersionConflictError(RuntimeError):
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
    ocr_allowed_chars: str | None = None
    ocr_page_segmentation_mode: int | None = None


@dataclass(frozen=True)
class NewRegionDraft:
    id: str
    name: str
    x: int
    y: int
    width: int
    height: int
    ocr_allowed_chars: str
    ocr_page_segmentation_mode: int
    expected_version: int


@dataclass(frozen=True)
class RegionOcrConfigDraft:
    ocr_allowed_chars: str
    ocr_page_segmentation_mode: int
    expected_version: int


@dataclass(frozen=True)
class CategoryDraft:
    id: str
    name: str
    kind: str
    ordinal: int


@dataclass(frozen=True)
class NewCategoryDraft:
    id: str
    name: str
    kind: str


@dataclass(frozen=True)
class RenamedCategoryDraft:
    name: str
    kind: str
    expected_version: int


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
                            ocr_allowed_chars=region.ocr_allowed_chars,
                            ocr_page_segmentation_mode=region.ocr_page_segmentation_mode,
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

    def add_category(self, profile_id: str, draft: NewCategoryDraft) -> CategoryDraft:
        """Append one category while holding SQLite's writer reservation."""
        try:
            with self._database.session() as session:
                # The reservation must precede both reads. Two callers cannot
                # observe the same maximum ordinal or pass the duplicate check
                # concurrently and then race at INSERT time.
                session.connection().exec_driver_sql("BEGIN IMMEDIATE")
                if session.get(GameProfile, profile_id) is None:
                    raise ProfileNotFoundError

                duplicate = self._duplicate_category(session, profile_id, draft.name)
                if duplicate is not None:
                    raise CategoryNameExistsError(
                        category_id=duplicate.id,
                        category_name=duplicate.name,
                    )

                current_max = session.scalar(
                    select(func.max(Category.ordinal)).where(Category.profile_id == profile_id)
                )
                ordinal = (current_max if current_max is not None else -1) + 1
                session.add(
                    Category(
                        id=draft.id,
                        profile_id=profile_id,
                        name=draft.name,
                        kind=draft.kind,
                        ordinal=ordinal,
                    )
                )
                session.flush()
                return CategoryDraft(draft.id, draft.name, draft.kind, ordinal)
        except (CategoryNameExistsError, ProfileNotFoundError):
            raise
        except IntegrityError as exc:
            if "UNIQUE constraint failed: categories.profile_id, categories.name" in str(exc.orig):
                raise CategoryNameExistsError from exc
            raise ProfilePersistenceError from exc

    def add_region(self, profile_id: str, draft: NewRegionDraft) -> ProfileRecord:
        """Append one HUD region under the same writer reservation as a rename.

        The reservation precedes every read, so the version check, the active-run
        check and the duplicate-name check all see the state the INSERT will land
        on. A region is appended, never replaced: `region_samples` reference
        `hud_regions.id`, and nothing here touches an existing identifier.
        """
        try:
            with self._database.session() as session:
                session.connection().exec_driver_sql("BEGIN IMMEDIATE")
                profile = session.get(GameProfile, profile_id)
                if profile is None:
                    raise ProfileNotFoundError
                if profile.version != draft.expected_version:
                    raise ProfileVersionConflictError
                # Not the same gate as `activate`: that one refuses whenever the
                # single workflow slot is taken at all. Here only unfinished work
                # bound to *this* profile matters, because only that work's crop
                # stage reads these regions (`FrameRepository._processing_record`).
                # Paused, failed and cancelled runs release the slot but may all
                # resume; queued runs may start. Letting any of them survive this
                # write would make "from the next run onwards" false.
                blocking_run = session.scalar(
                    select(PipelineRun.id)
                    .where(
                        PipelineRun.profile_id == profile_id,
                        PipelineRun.status.in_(
                            ("queued", "running", "paused", "failed", "cancelled")
                        ),
                    )
                    .limit(1)
                )
                if blocking_run is not None:
                    raise ProfileRegionBlockedError

                duplicate = self._duplicate_region(session, profile_id, draft.name)
                if duplicate is not None:
                    raise RegionNameExistsError(
                        region_id=duplicate.id,
                        region_name=duplicate.name,
                    )

                session.add(
                    HudRegion(
                        id=draft.id,
                        profile_id=profile_id,
                        name=draft.name,
                        x=draft.x,
                        y=draft.y,
                        width=draft.width,
                        height=draft.height,
                        ocr_allowed_chars=draft.ocr_allowed_chars,
                        ocr_page_segmentation_mode=draft.ocr_page_segmentation_mode,
                    )
                )
                profile.version += 1
                session.flush()
                return self._record(session, profile)
        except (
            ProfileNotFoundError,
            ProfileRegionBlockedError,
            ProfileVersionConflictError,
            RegionNameExistsError,
        ):
            raise
        except IntegrityError as exc:
            if "UNIQUE constraint failed: hud_regions.profile_id, hud_regions.name" in str(
                exc.orig
            ):
                raise RegionNameExistsError from exc
            raise ProfilePersistenceError from exc

    def update_region_ocr_config(
        self,
        profile_id: str,
        region_id: str,
        draft: RegionOcrConfigDraft,
    ) -> ProfileRecord:
        """Update only OCR settings; geometry and prior samples stay immutable."""
        try:
            with self._database.session() as session:
                session.connection().exec_driver_sql("BEGIN IMMEDIATE")
                profile = session.get(GameProfile, profile_id)
                if profile is None:
                    raise ProfileNotFoundError
                if profile.version != draft.expected_version:
                    raise ProfileVersionConflictError
                region = session.scalar(
                    select(HudRegion).where(
                        HudRegion.id == region_id,
                        HudRegion.profile_id == profile_id,
                    )
                )
                if region is None:
                    raise RegionNotFoundError
                blocking_run = session.scalar(
                    select(PipelineRun.id)
                    .where(
                        PipelineRun.profile_id == profile_id,
                        PipelineRun.status.in_(
                            ("queued", "running", "paused", "failed", "cancelled")
                        ),
                    )
                    .limit(1)
                )
                if blocking_run is not None:
                    raise ProfileRegionBlockedError
                region.ocr_allowed_chars = draft.ocr_allowed_chars
                region.ocr_page_segmentation_mode = draft.ocr_page_segmentation_mode
                profile.version += 1
                session.flush()
                return self._record(session, profile)
        except (
            ProfileNotFoundError,
            ProfileRegionBlockedError,
            ProfileVersionConflictError,
            RegionNotFoundError,
        ):
            raise
        except IntegrityError as exc:
            raise ProfilePersistenceError from exc

    def rename_category(
        self,
        profile_id: str,
        category_id: str,
        draft: RenamedCategoryDraft,
    ) -> ProfileRecord:
        """Rename one category under the same writer reservation as creation."""
        try:
            with self._database.session() as session:
                # Same ordering rationale as `add_category`: the reservation
                # precedes the version read, so two tabs cannot both observe the
                # same profile version and then both write a name.
                session.connection().exec_driver_sql("BEGIN IMMEDIATE")
                profile = session.get(GameProfile, profile_id)
                if profile is None:
                    raise ProfileNotFoundError
                category = session.get(Category, category_id)
                if category is None or category.profile_id != profile_id:
                    raise CategoryNotFoundError
                if profile.version != draft.expected_version:
                    raise ProfileVersionConflictError
                if category.name == draft.name and category.kind == draft.kind:
                    # Renaming a class to the name it already carries is a
                    # no-op, not a conflict. Nothing is written, so the profile
                    # version stays where every other tab expects it.
                    return self._record(session, profile)

                duplicate = self._duplicate_category(
                    session, profile_id, draft.name, exclude_id=category_id
                )
                if duplicate is not None:
                    raise CategoryNameExistsError(
                        category_id=duplicate.id,
                        category_name=duplicate.name,
                    )
                if category.kind == "character" and (
                    draft.kind != "character" or draft.name != category.name
                ):
                    blocking_regions = tuple(
                        (region.id, region.name)
                        for region in session.scalars(
                            select(HudRegion)
                            .where(HudRegion.profile_id == profile_id)
                            .order_by(HudRegion.created_at, HudRegion.id)
                        )
                        if region.ocr_allowed_chars is not None
                        and category.name in region.ocr_allowed_chars
                    )
                    if blocking_regions:
                        raise CategoryUsedByRegionsError(blocking_regions)
                category.name = draft.name
                category.kind = draft.kind
                # `ordinal` is deliberately untouched: the identifier an export
                # derives from it must survive a rename.
                profile.version += 1
                session.flush()
                return self._record(session, profile)
        except (
            CategoryNameExistsError,
            CategoryNotFoundError,
            CategoryUsedByRegionsError,
            ProfileNotFoundError,
            ProfileVersionConflictError,
        ):
            raise
        except IntegrityError as exc:
            if "UNIQUE constraint failed: categories.profile_id, categories.name" in str(exc.orig):
                raise CategoryNameExistsError from exc
            raise ProfilePersistenceError from exc

    @staticmethod
    def _duplicate_category(
        session: Session,
        profile_id: str,
        name: str,
        *,
        exclude_id: str | None = None,
    ) -> Category | None:
        """The single profile-scoped uniqueness rule shared by create and rename."""
        normalized_name = name.strip().casefold()
        return next(
            (
                category
                for category in session.scalars(
                    select(Category).where(Category.profile_id == profile_id)
                )
                if category.id != exclude_id and category.name.strip().casefold() == normalized_name
            ),
            None,
        )

    @staticmethod
    def _duplicate_region(session: Session, profile_id: str, name: str) -> HudRegion | None:
        """The profile-scoped region name rule, folded exactly like categories."""
        normalized_name = name.strip().casefold()
        return next(
            (
                region
                for region in session.scalars(
                    select(HudRegion).where(HudRegion.profile_id == profile_id)
                )
                if region.name.strip().casefold() == normalized_name
            ),
            None,
        )

    @staticmethod
    def _record(session: Session, profile: GameProfile) -> ProfileRecord:
        regions = tuple(
            RegionDraft(
                item.id,
                item.name,
                item.x,
                item.y,
                item.width,
                item.height,
                item.ocr_allowed_chars,
                item.ocr_page_segmentation_mode,
            )
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
