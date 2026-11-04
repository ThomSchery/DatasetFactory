from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.access.store.database import Database
from backend.app.access.store.models import (
    Annotation,
    Category,
    GameProfile,
    HudRegion,
    PipelineRun,
    Project,
    ReferenceAsset,
    utc_now,
)

# The statuses whose work still reads the profile definition: a queued run may
# start, and paused, failed and cancelled runs may all resume. Only `completed`
# and `review_ready` have nothing left to crop, which is why editing is allowed
# there and refused everywhere else.
BLOCKING_RUN_STATUSES = ("queued", "running", "paused", "failed", "cancelled")


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


class CategoryInUseError(RuntimeError):
    """A save asked to drop a category that annotations still point at.

    `Annotation.category_id` is RESTRICT on purpose, so the only truthful
    answers are "keep it" or "save this definition under a new name". Deleting
    the row would destroy review work, and silently keeping it would make the
    answer disagree with what the operator asked for.
    """

    def __init__(self, categories: tuple[tuple[str, str], ...]) -> None:
        super().__init__(", ".join(name for _, name in categories))
        self.categories = categories


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
class SavedRegionDraft:
    """One region in a whole-profile save. `id` is None for a freshly drawn box."""

    id: str | None
    name: str
    x: int
    y: int
    width: int
    height: int
    ocr_allowed_chars: str | None
    ocr_page_segmentation_mode: int | None


@dataclass(frozen=True)
class SavedCategoryDraft:
    """One class in a whole-profile save. `id` is None for a new class."""

    id: str | None
    name: str
    kind: str


@dataclass(frozen=True)
class ProfileDefinitionDraft:
    """The whole definition of one existing profile, saved in a single step.

    The profile's name, reference image and dimensions are deliberately absent:
    this route rewrites the definition of the profile the operator selected, and
    a different name or image is a new profile created through `Save as`.
    """

    regions: tuple[SavedRegionDraft, ...]
    categories: tuple[SavedCategoryDraft, ...]
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
        record: ProfileRecord | None = None
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
                profile = GameProfile(
                    id=draft.id,
                    project_id=draft.project_id,
                    name=draft.name,
                    normalized_name=draft.normalized_name,
                    reference_asset_id=asset.asset_id,
                    source_width=draft.source_width,
                    source_height=draft.source_height,
                    version=1,
                )
                session.add(profile)
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
                # Read the aggregate back rather than echoing the draft, so the
                # order a client sees here is the order every later GET returns.
                record = self._record(session, profile)
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
        if not published or record is None:
            asset.discard()
            raise ProfilePersistenceError
        return record

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
                            .where(
                                HudRegion.profile_id == profile.id,
                                HudRegion.retired_at.is_(None),
                            )
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
                if self._blocking_run(session, profile_id) is not None:
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
                        HudRegion.retired_at.is_(None),
                    )
                )
                if region is None:
                    raise RegionNotFoundError
                if self._blocking_run(session, profile_id) is not None:
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

    def save_definition(self, profile_id: str, draft: ProfileDefinitionDraft) -> ProfileRecord:
        """Write a whole profile definition in one transaction, or write nothing.

        Identifiers decide what happens to a row, never position or name: a
        draft region carrying an existing `id` updates that row in place, one
        without an `id` is inserted, and an active region the draft no longer
        mentions is retired. Nothing is ever deleted and re-inserted, because
        `region_samples.region_id` cascades and `Annotation.category_id` is
        RESTRICT — a delete/re-insert cycle would take historical work with it.

        Renames land in two passes through a private staging name. SQLite
        enforces the active-name index per statement, so swapping two names, or
        freeing a name for a region added in the same save, would otherwise
        collide halfway through a save the operator asked for as one step.
        """
        try:
            with self._database.session() as session:
                # The reservation precedes every read for the same reason as
                # `add_region`: the version check, the run gate and the name
                # checks must all see the state these writes land on.
                session.connection().exec_driver_sql("BEGIN IMMEDIATE")
                profile = session.get(GameProfile, profile_id)
                if profile is None:
                    raise ProfileNotFoundError
                if profile.version != draft.expected_version:
                    raise ProfileVersionConflictError
                if self._blocking_run(session, profile_id) is not None:
                    raise ProfileRegionBlockedError

                self._save_categories(session, profile_id, draft.categories)
                self._save_regions(session, profile_id, draft.regions)
                profile.version += 1
                session.flush()
                return self._record(session, profile)
        except (
            CategoryInUseError,
            CategoryNameExistsError,
            CategoryNotFoundError,
            ProfileNotFoundError,
            ProfileRegionBlockedError,
            ProfileVersionConflictError,
            RegionNameExistsError,
            RegionNotFoundError,
        ):
            raise
        except IntegrityError as exc:
            message = str(exc.orig)
            if "hud_regions.profile_id, hud_regions.name" in message:
                raise RegionNameExistsError from exc
            if "categories.profile_id, categories.name" in message:
                raise CategoryNameExistsError from exc
            raise ProfilePersistenceError from exc

    @classmethod
    def _save_regions(
        cls,
        session: Session,
        profile_id: str,
        drafts: tuple[SavedRegionDraft, ...],
    ) -> None:
        existing = {
            region.id: region
            for region in session.scalars(
                select(HudRegion).where(
                    HudRegion.profile_id == profile_id,
                    HudRegion.retired_at.is_(None),
                )
            )
        }
        kept: dict[str, SavedRegionDraft] = {}
        added: list[SavedRegionDraft] = []
        for item in drafts:
            if item.id is None:
                added.append(item)
                continue
            if item.id not in existing or item.id in kept:
                raise RegionNotFoundError
            kept[item.id] = item

        retired_at = utc_now()
        for region_id, region in existing.items():
            if region_id not in kept:
                region.retired_at = retired_at
        # Retirement frees the names first, so a replacement region may reuse
        # one in the very same save.
        session.flush()

        renamed = [
            (existing[region_id], item)
            for region_id, item in kept.items()
            if existing[region_id].name != item.name
        ]
        for region, _ in renamed:
            region.name = cls._staging_name(region.id)
        session.flush()
        for region, item in renamed:
            region.name = item.name
        for region_id, item in kept.items():
            region = existing[region_id]
            region.x = item.x
            region.y = item.y
            region.width = item.width
            region.height = item.height
            region.ocr_allowed_chars = item.ocr_allowed_chars
            region.ocr_page_segmentation_mode = item.ocr_page_segmentation_mode
        session.flush()

        for item in added:
            session.add(
                HudRegion(
                    id=str(uuid4()),
                    profile_id=profile_id,
                    name=item.name,
                    x=item.x,
                    y=item.y,
                    width=item.width,
                    height=item.height,
                    ocr_allowed_chars=item.ocr_allowed_chars,
                    ocr_page_segmentation_mode=item.ocr_page_segmentation_mode,
                )
            )
        session.flush()

    @classmethod
    def _save_categories(
        cls,
        session: Session,
        profile_id: str,
        drafts: tuple[SavedCategoryDraft, ...],
    ) -> None:
        existing = {
            category.id: category
            for category in session.scalars(
                select(Category).where(Category.profile_id == profile_id)
            )
        }
        # Read before anything is removed: a dropped class must not free its
        # ordinal, or the class identifier an earlier export derived from it
        # would start meaning a different class.
        current_max = session.scalar(
            select(func.max(Category.ordinal)).where(Category.profile_id == profile_id)
        )
        kept: dict[str, SavedCategoryDraft] = {}
        added: list[SavedCategoryDraft] = []
        for item in drafts:
            if item.id is None:
                added.append(item)
                continue
            if item.id not in existing or item.id in kept:
                raise CategoryNotFoundError
            kept[item.id] = item

        removed = tuple(
            category for category_id, category in existing.items() if category_id not in kept
        )
        in_use = tuple(
            (category.id, category.name)
            for category in removed
            if session.scalar(
                select(Annotation.id).where(Annotation.category_id == category.id).limit(1)
            )
            is not None
        )
        if in_use:
            raise CategoryInUseError(in_use)
        for category in removed:
            session.delete(category)
        session.flush()

        renamed = [
            (existing[category_id], item)
            for category_id, item in kept.items()
            if existing[category_id].name != item.name
        ]
        for category, _ in renamed:
            category.name = cls._staging_name(category.id)
        session.flush()
        for category, item in renamed:
            category.name = item.name
        for category_id, item in kept.items():
            # `ordinal` is never rewritten: the identifier an export derives
            # from it has to survive every later save.
            existing[category_id].kind = item.kind
        session.flush()

        ordinal = (current_max if current_max is not None else -1) + 1
        for item in added:
            session.add(
                Category(
                    id=str(uuid4()),
                    profile_id=profile_id,
                    name=item.name,
                    kind=item.kind,
                    ordinal=ordinal,
                )
            )
            ordinal += 1
        session.flush()

    @staticmethod
    def _staging_name(row_id: str) -> str:
        """A name no operator can submit, used only between two flushes."""
        return f"\x00{row_id}"

    @staticmethod
    def _blocking_run(session: Session, profile_id: str) -> str | None:
        """Unfinished work bound to *this* profile, whose crop stage reads it."""
        return session.scalar(
            select(PipelineRun.id)
            .where(
                PipelineRun.profile_id == profile_id,
                PipelineRun.status.in_(BLOCKING_RUN_STATUSES),
            )
            .limit(1)
        )

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
                            .where(
                                HudRegion.profile_id == profile_id,
                                HudRegion.retired_at.is_(None),
                            )
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
        """The profile-scoped region name rule, folded exactly like categories.

        Retired regions are excluded, which is what makes "remove a region and
        draw a new one under the same name" work without disturbing the samples
        that still reference the retired identifier.
        """
        normalized_name = name.strip().casefold()
        return next(
            (
                region
                for region in session.scalars(
                    select(HudRegion).where(
                        HudRegion.profile_id == profile_id,
                        HudRegion.retired_at.is_(None),
                    )
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
                .where(HudRegion.profile_id == profile.id, HudRegion.retired_at.is_(None))
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
