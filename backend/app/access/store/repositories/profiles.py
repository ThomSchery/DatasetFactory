from __future__ import annotations

from collections.abc import Collection, Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol
from uuid import uuid4

from sqlalchemy import func, literal_column, select
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
from backend.app.engines.definition import ClassMove, ClassSnapshot

# The statuses whose work still reads the profile definition: a queued run may
# start, and paused, failed and cancelled runs may all resume. Only `completed`
# and `review_ready` have nothing left to crop, which is why editing is allowed
# there and refused everywhere else.
BLOCKING_RUN_STATUSES = ("queued", "running", "paused", "failed", "cancelled")


def _folded(name: str) -> str:
    """The one name folding every profile-scoped uniqueness rule here uses."""
    return name.strip().casefold()


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
    ocr_text_layout: str | None = None


@dataclass(frozen=True)
class NewRegionDraft:
    id: str
    name: str
    x: int
    y: int
    width: int
    height: int
    ocr_allowed_chars: str
    ocr_text_layout: str
    expected_version: int


@dataclass(frozen=True)
class RegionOcrConfigDraft:
    ocr_allowed_chars: str
    ocr_text_layout: str
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
    ocr_text_layout: str | None


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


class ProfileClassRules(Protocol):
    """How a profile's regions and classes belong together (FE-026, FE-030).

    The repository reads the state, asks, and applies the answer inside its own
    transaction. The rules themselves are the definition engine's — the
    composition root injects them, so this module holds no decision about which
    class to add, rename or drop.
    """

    def classes_to_remove(
        self,
        existing: Sequence[ClassSnapshot],
        kept_ids: Collection[str],
        region_names: Iterable[str],
    ) -> tuple[ClassSnapshot, ...]: ...

    def next_class_ordinal(self, current_max: int | None, *, floor: int = 0) -> int: ...

    def class_moves_for_region_renames(
        self,
        classes: Sequence[ClassSnapshot],
        active_region_names: Iterable[str],
        renamed: Sequence[tuple[str, str]],
    ) -> tuple[ClassMove, ...]: ...

    def unused_classes_to_drop(
        self,
        classes: Sequence[ClassSnapshot],
        retired_names: Iterable[str],
        active_region_names: Iterable[str],
        used_ids: Collection[str],
    ) -> tuple[str, ...]: ...

    def missing_region_classes(
        self,
        class_names: Iterable[str],
        stored_region_names: Sequence[str],
        request_order: Sequence[str] = (),
    ) -> tuple[str, ...]: ...


def _snapshot(category: Category) -> ClassSnapshot:
    return ClassSnapshot(category.id, category.name, category.kind)


class ProfileRepository:
    """Persist and hydrate a profile aggregate in one database transaction."""

    def __init__(self, database: Database, rules: ProfileClassRules) -> None:
        self._database = database
        self._rules = rules

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
                            ocr_text_layout=region.ocr_text_layout,
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
                self._ensure_region_categories(
                    session, draft.id, order=tuple(region.name for region in draft.regions)
                )
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
                profile = session.get(GameProfile, profile_id)
                if profile is None:
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
                profile.version += 1
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
                        ocr_text_layout=draft.ocr_text_layout,
                    )
                )
                session.flush()
                self._ensure_region_categories(session, profile_id)
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
                region.ocr_text_layout = draft.ocr_text_layout
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

        FE-026: every active region keeps a class of its own name. A class the
        draft dropped is kept when a region in the same draft still carries its
        name, a renamed region takes its class along, and a region without a
        class gets one appended — in that order, so the class that already holds
        annotations is the one that follows the region.

        FE-030: a region the save removes takes its class with it when no box
        uses that class and no region of the same save carries its name. The
        same goes for the class a renamed region left behind (it adopted an
        existing class of the new name instead of taking its own along).
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

                region_names = tuple(region.name for region in draft.regions)
                next_ordinal = self._save_categories(
                    session, profile_id, draft.categories, region_names=region_names
                )
                renamed, retired = self._save_regions(session, profile_id, draft.regions)
                self._follow_region_renames(session, profile_id, renamed)
                self._drop_unused_classes_of(
                    session, profile_id, (*retired, *(old for old, _ in renamed))
                )
                self._ensure_region_categories(
                    session,
                    profile_id,
                    order=tuple(region.name for region in draft.regions),
                    floor=next_ordinal,
                )
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
    ) -> tuple[tuple[tuple[str, str], ...], tuple[str, ...]]:
        """Apply the region half of a save.

        Answers the renames as `(old, new)` and the names of the regions this
        save retired, in that order.
        """
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
        retired_names: list[str] = []
        for region_id, region in existing.items():
            if region_id not in kept:
                region.retired_at = retired_at
                retired_names.append(region.name)
        # Retirement frees the names first, so a replacement region may reuse
        # one in the very same save.
        session.flush()

        renamed = [
            (existing[region_id], item)
            for region_id, item in kept.items()
            if existing[region_id].name != item.name
        ]
        old_names = tuple((region.name, item.name) for region, item in renamed)
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
            region.ocr_text_layout = item.ocr_text_layout
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
                    ocr_text_layout=item.ocr_text_layout,
                )
            )
        session.flush()
        return old_names, tuple(retired_names)

    @staticmethod
    def _active_region_names(session: Session, profile_id: str) -> tuple[str, ...]:
        return tuple(
            session.scalars(
                select(HudRegion.name).where(
                    HudRegion.profile_id == profile_id,
                    HudRegion.retired_at.is_(None),
                )
            )
        )

    def _drop_unused_classes_of(
        self,
        session: Session,
        profile_id: str,
        retired: tuple[str, ...],
    ) -> None:
        """Delete the classes the rules say a removed region left behind (FE-030).

        `retired` holds the names of removed regions and the old names of renamed
        ones. Runs after the renames have moved their classes. "Used" is any
        annotation row, deleted ones included: `annotations.category_id` is
        RESTRICT, so a row the reviewer discarded still anchors the class.
        """
        if not retired:
            return
        categories = tuple(
            session.scalars(select(Category).where(Category.profile_id == profile_id))
        )
        used_ids = frozenset(
            session.scalars(
                select(Annotation.category_id)
                .where(Annotation.category_id.in_([category.id for category in categories]))
                .distinct()
            )
        )
        doomed = frozenset(
            self._rules.unused_classes_to_drop(
                tuple(_snapshot(category) for category in categories),
                retired,
                self._active_region_names(session, profile_id),
                used_ids,
            )
        )
        for category in categories:
            if category.id in doomed:
                session.delete(category)
        session.flush()

    def _save_categories(
        self,
        session: Session,
        profile_id: str,
        drafts: tuple[SavedCategoryDraft, ...],
        *,
        region_names: Sequence[str] = (),
    ) -> int:
        """Apply the class half of a save; answer the next free ordinal.

        `region_names` are the names of the regions the same save keeps: the
        rules keep a class that carries one of them (FE-026) even when the draft
        leaves it out. The ordinal answered is counted from the maximum read
        *before* any removal, so a region class appended later in the same save
        cannot take the ordinal of a class this save dropped.
        """
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

        removed = self._rules.classes_to_remove(
            tuple(_snapshot(category) for category in existing.values()),
            kept.keys(),
            region_names,
        )
        # The database refuses to drop a class an annotation still points to, so
        # asking for it is an error the operator can act on, not a silent skip.
        in_use = tuple(
            (dropped.id, dropped.name)
            for dropped in removed
            if session.scalar(
                select(Annotation.id).where(Annotation.category_id == dropped.id).limit(1)
            )
            is not None
        )
        if in_use:
            raise CategoryInUseError(in_use)
        for dropped in removed:
            session.delete(existing[dropped.id])
        session.flush()

        renamed = [
            (existing[category_id], item)
            for category_id, item in kept.items()
            if existing[category_id].name != item.name
        ]
        for category, _ in renamed:
            category.name = self._staging_name(category.id)
        session.flush()
        for category, item in renamed:
            category.name = item.name
        for category_id, item in kept.items():
            # `ordinal` is never rewritten: the identifier an export derives
            # from it has to survive every later save.
            existing[category_id].kind = item.kind
        session.flush()

        ordinal = self._rules.next_class_ordinal(current_max)
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
        return ordinal

    def _follow_region_renames(
        self,
        session: Session,
        profile_id: str,
        renamed: tuple[tuple[str, str], ...],
    ) -> None:
        """Rename the classes the rules say follow their renamed regions (FE-026).

        Renaming the class row keeps its identifier, so every annotation drawn
        under the old name follows the region.
        """
        if not renamed:
            return
        categories = {
            category.id: category
            for category in session.scalars(
                select(Category).where(Category.profile_id == profile_id)
            )
        }
        moves = self._rules.class_moves_for_region_renames(
            tuple(_snapshot(category) for category in categories.values()),
            self._active_region_names(session, profile_id),
            renamed,
        )
        for move in moves:
            categories[move.id].name = self._staging_name(move.id)
        session.flush()
        for move in moves:
            categories[move.id].name = move.new_name
        session.flush()

    def _ensure_region_categories(
        self,
        session: Session,
        profile_id: str,
        *,
        order: tuple[str, ...] = (),
        floor: int = 0,
    ) -> None:
        """Add the classes the rules say the active regions lack (FE-026).

        `order` is the region order of the request being written. Regions
        inserted in one flush can share a timestamp, so stored regions break
        that tie by `rowid` (insertion order), never by the random id. `floor`
        is the lowest ordinal a new class may take; a whole-definition save
        passes the next ordinal counted before it removed any class.
        """
        class_names = tuple(
            session.scalars(select(Category.name).where(Category.profile_id == profile_id))
        )
        stored = tuple(
            session.scalars(
                select(HudRegion.name)
                .where(HudRegion.profile_id == profile_id, HudRegion.retired_at.is_(None))
                .order_by(HudRegion.created_at, literal_column("hud_regions.rowid"))
            )
        )
        missing = self._rules.missing_region_classes(class_names, stored, order)
        if not missing:
            return
        current_max = session.scalar(
            select(func.max(Category.ordinal)).where(Category.profile_id == profile_id)
        )
        ordinal = self._rules.next_class_ordinal(current_max, floor=floor)
        for name in missing:
            session.add(
                Category(
                    id=str(uuid4()),
                    profile_id=profile_id,
                    name=name,
                    kind="game",
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
                session.flush()
                # Renaming a region's class leaves the region without one, so
                # it gets its class back (FE-026). The renamed row keeps the
                # annotations; the region's name is free to be drawn again.
                self._ensure_region_categories(session, profile_id)
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
                item.ocr_text_layout,
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
