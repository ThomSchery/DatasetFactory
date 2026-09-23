from __future__ import annotations

import hashlib
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import uuid4

from backend.app.access.media.image import ImageProbeError, ReferenceImageProbe
from backend.app.access.media.processing import MediaProcessingAccess, MediaProcessingError
from backend.app.access.store.reference_assets import (
    ReferenceAssetStore,
    ReferenceAssetWriteError,
)
from backend.app.access.store.repositories.assets import (
    AssetNotFoundError,
    AssetRecord,
    AssetRepository,
)
from backend.app.access.store.repositories.materials import (
    MaterialNotFoundError,
    MaterialRepository,
)
from backend.app.access.store.repositories.profiles import (
    AssetPublication,
    CategoryDraft,
    CategoryNameExistsError,
    CategoryNotFoundError,
    CategoryUsedByRegionsError,
    NewCategoryDraft,
    NewRegionDraft,
    ProfileAggregateDraft,
    ProfileNameExistsError,
    ProfileNotFoundError,
    ProfilePersistenceError,
    ProfileRecord,
    ProfileRegionBlockedError,
    ProfileRepository,
    ProfileSelectionBlockedError,
    ProfileSummaryRecord,
    ProfileVersionConflictError,
    RegionDraft,
    RegionNameExistsError,
    RegionNotFoundError,
    RegionOcrConfigDraft,
    RenamedCategoryDraft,
)
from backend.app.access.store.repositories.projects import ProjectRepository
from backend.app.engines.definition import (
    BBox,
    CategoryDefinition,
    DatasetDefinitionEngine,
    DefinitionValidationError,
    ProfileDefinition,
    RegionDefinition,
    normalize_profile_name,
)


class ProfileUseCaseError(RuntimeError):
    def __init__(self, code: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.details = details or {}


@dataclass(frozen=True)
class ReferencePreview:
    asset_id: str
    width: int
    height: int


@dataclass
class _EphemeralReferenceAsset:
    asset_id: str
    relpath: str
    content_type: str
    size_bytes: int
    width: int
    height: int

    def publish(self) -> None:
        """The preview is already published inside the controlled workspace."""

    def discard(self) -> None:
        """Unused previews keep the existing process-local preview lifecycle."""


class ProfileUseCases:
    """Coordinate validated profile creation, retrieval, and opaque asset lookup."""

    def __init__(
        self,
        engine: DatasetDefinitionEngine,
        image_probe: ReferenceImageProbe,
        project_repository: ProjectRepository,
        profile_repository: ProfileRepository,
        asset_repository: AssetRepository,
        reference_asset_store: ReferenceAssetStore,
        material_repository: MaterialRepository,
        media_processing: MediaProcessingAccess,
    ) -> None:
        self._engine = engine
        self._image_probe = image_probe
        self._projects = project_repository
        self._profiles = profile_repository
        self._assets = asset_repository
        self._asset_store = reference_asset_store
        self._materials = material_repository
        self._media_processing = media_processing
        self._reference_previews: dict[str, _EphemeralReferenceAsset] = {}

    def create_reference_preview(self, *, reference_image_path: str) -> ReferencePreview:
        """Publish a verified preview without creating a durable profile or asset row."""
        source = Path(reference_image_path)
        if not source.is_absolute():
            raise ProfileUseCaseError(
                "reference_path_not_absolute", details={"field": "reference_image_path"}
            )
        if not source.is_file():
            raise ProfileUseCaseError("source_missing", details={"field": "reference_image_path"})

        asset_id = str(uuid4())
        try:
            staged_asset = self._asset_store.stage(source, asset_id=asset_id)
        except ReferenceAssetWriteError as exc:
            raise ProfileUseCaseError("reference_asset_copy_failed") from exc

        published = False
        try:
            metadata = self._image_probe.inspect(staged_asset.temporary_path)
            staged_asset.configure(
                extension=metadata.extension,
                content_type=metadata.content_type,
            )
            staged_asset.publish()
            published = True
            self._reference_previews[asset_id] = _EphemeralReferenceAsset(
                asset_id=asset_id,
                relpath=staged_asset.relpath,
                content_type=staged_asset.content_type,
                size_bytes=staged_asset.size_bytes,
                width=metadata.width,
                height=metadata.height,
            )
            return ReferencePreview(asset_id=asset_id, width=metadata.width, height=metadata.height)
        except ImageProbeError as exc:
            raise ProfileUseCaseError(str(exc), details={"field": "reference_image_path"}) from exc
        except ReferenceAssetWriteError as exc:
            raise ProfileUseCaseError("reference_asset_copy_failed") from exc
        finally:
            if not published:
                staged_asset.discard()

    def create_reference_frame(self, *, video_id: str, timestamp_ms: int) -> ReferencePreview:
        try:
            material = self._materials.source(video_id)
        except MaterialNotFoundError as exc:
            raise ProfileUseCaseError("video_not_found") from exc
        if timestamp_ms < 0 or timestamp_ms >= material.duration_ms:
            raise ProfileUseCaseError(
                "invalid_frame_timestamp",
                details={"field": "timestamp_ms", "duration_ms": material.duration_ms},
            )
        try:
            stat = material.path.stat()
        except OSError as exc:
            raise ProfileUseCaseError("source_missing") from exc
        fingerprint = hashlib.sha256(f"{stat.st_size}:{stat.st_mtime_ns}".encode()).hexdigest()
        if stat.st_size != material.size_bytes or fingerprint != material.fingerprint:
            raise ProfileUseCaseError("source_changed")

        asset_id = str(uuid4())
        try:
            sampled = self._media_processing.sample_frame(
                material.path,
                timestamp_ms,
                Path(f"assets/references/{asset_id}.jpg"),
            )
        except MediaProcessingError as exc:
            exposed_code = (
                exc.code
                if exc.code
                in {
                    "ffmpeg_unavailable",
                    "frame_extraction_timeout",
                    "invalid_frame_timestamp",
                    "source_missing",
                }
                else "reference_frame_extraction_failed"
            )
            raise ProfileUseCaseError(exposed_code) from exc
        asset = self._assets.get_ephemeral_reference(
            relpath=sampled.relpath.as_posix(),
            content_type="image/jpeg",
        )
        if sampled.width != material.width or sampled.height != material.height:
            asset.path.unlink(missing_ok=True)
            raise ProfileUseCaseError("reference_frame_resolution_mismatch")
        size_bytes = asset.path.stat().st_size
        self._reference_previews[asset_id] = _EphemeralReferenceAsset(
            asset_id=asset_id,
            relpath=sampled.relpath.as_posix(),
            content_type="image/jpeg",
            size_bytes=size_bytes,
            width=sampled.width,
            height=sampled.height,
        )
        return ReferencePreview(asset_id=asset_id, width=sampled.width, height=sampled.height)

    def create_profile(
        self,
        *,
        name: str,
        reference_image_path: str | None,
        reference_asset_id: str | None = None,
        regions: tuple[RegionDefinition, ...],
        categories: tuple[CategoryDefinition, ...],
    ) -> ProfileRecord:
        if (reference_image_path is None) == (reference_asset_id is None):
            raise ProfileUseCaseError("reference_source_required")
        if reference_asset_id is not None:
            preview = self._reference_previews.get(reference_asset_id)
            if preview is None:
                raise ProfileUseCaseError("asset_not_found")
            asset = self._assets.get_ephemeral_reference(
                relpath=preview.relpath,
                content_type=preview.content_type,
            )
            try:
                metadata = self._image_probe.inspect(asset.path)
            except ImageProbeError as exc:
                raise ProfileUseCaseError(
                    str(exc), details={"field": "reference_asset_id"}
                ) from exc
            profile = self._create_profile(
                name=name,
                publication=preview,
                source_width=metadata.width,
                source_height=metadata.height,
                regions=regions,
                categories=categories,
            )
            self._reference_previews.pop(reference_asset_id, None)
            return profile

        assert reference_image_path is not None
        source = Path(reference_image_path)
        if not source.is_absolute():
            raise ProfileUseCaseError(
                "reference_path_not_absolute", details={"field": "reference_image_path"}
            )
        if not source.is_file():
            raise ProfileUseCaseError("source_missing", details={"field": "reference_image_path"})
        asset_id = str(uuid4())
        try:
            staged_asset = self._asset_store.stage(source, asset_id=asset_id)
        except ReferenceAssetWriteError as exc:
            raise ProfileUseCaseError("reference_asset_copy_failed") from exc
        inspected = False
        try:
            metadata = self._image_probe.inspect(staged_asset.temporary_path)
            staged_asset.configure(
                extension=metadata.extension,
                content_type=metadata.content_type,
            )
            inspected = True
        except ImageProbeError as exc:
            raise ProfileUseCaseError(str(exc), details={"field": "reference_image_path"}) from exc
        finally:
            # An unexpected probe failure must not leave the staged temp file
            # behind either, so the cleanup hangs off the flag, not the handler.
            if not inspected:
                staged_asset.discard()
        return self._create_profile(
            name=name,
            publication=staged_asset,
            source_width=metadata.width,
            source_height=metadata.height,
            regions=regions,
            categories=categories,
        )

    def _create_profile(
        self,
        *,
        name: str,
        publication: AssetPublication,
        source_width: int,
        source_height: int,
        regions: tuple[RegionDefinition, ...],
        categories: tuple[CategoryDefinition, ...],
    ) -> ProfileRecord:
        created = False
        try:
            definition = self._engine.validate_profile(
                ProfileDefinition(
                    name=name,
                    source_width=source_width,
                    source_height=source_height,
                    regions=regions,
                    categories=categories,
                )
            )
        except DefinitionValidationError as exc:
            publication.discard()
            details: dict[str, Any] = {"field": exc.field}
            if exc.index is not None:
                details["index"] = exc.index
            raise ProfileUseCaseError(exc.code, details=details) from exc
        try:
            profile = self._profiles.create(
                ProfileAggregateDraft(
                    id=str(uuid4()),
                    project_id=self._projects.get_or_create_current_id(),
                    name=definition.name,
                    normalized_name=normalize_profile_name(definition.name),
                    source_width=definition.source_width,
                    source_height=definition.source_height,
                    regions=tuple(
                        RegionDraft(
                            id=str(uuid4()),
                            name=region.name,
                            x=region.bbox.x,
                            y=region.bbox.y,
                            width=region.bbox.width,
                            height=region.bbox.height,
                            ocr_allowed_chars=(
                                "".join(region.allowed_chars)
                                if region.allowed_chars is not None
                                else None
                            ),
                            ocr_page_segmentation_mode=region.page_segmentation_mode,
                        )
                        for region in definition.regions
                    ),
                    categories=tuple(
                        CategoryDraft(
                            id=str(uuid4()),
                            name=category.name,
                            kind=category.kind,
                            ordinal=ordinal,
                        )
                        for ordinal, category in enumerate(definition.categories)
                    ),
                ),
                publication,
            )
            created = True
            return profile
        except ProfileNameExistsError as exc:
            raise ProfileUseCaseError("profile_name_exists") from exc
        except ProfilePersistenceError as exc:
            raise ProfileUseCaseError("profile_persistence_failed") from exc
        except ReferenceAssetWriteError as exc:
            raise ProfileUseCaseError("reference_asset_copy_failed") from exc
        finally:
            if not created:
                publication.discard()

    def get_current_profile(self) -> ProfileRecord | None:
        return self._profiles.current()

    def list_profiles(self) -> tuple[ProfileSummaryRecord, ...]:
        return self._profiles.list()

    def activate_profile(self, profile_id: str) -> ProfileRecord:
        try:
            return self._profiles.activate(profile_id)
        except ProfileNotFoundError as exc:
            raise ProfileUseCaseError("profile_not_found") from exc
        except ProfileSelectionBlockedError as exc:
            raise ProfileUseCaseError("active_run") from exc

    def get_profile(self, profile_id: str) -> ProfileRecord:
        try:
            return self._profiles.get(profile_id)
        except ProfileNotFoundError as exc:
            raise ProfileUseCaseError("profile_not_found") from exc

    def add_category(self, *, profile_id: str, category: CategoryDefinition) -> CategoryDraft:
        definition = self._validated_category(category)
        try:
            return self._profiles.add_category(
                profile_id,
                NewCategoryDraft(
                    id=str(uuid4()),
                    name=definition.name,
                    kind=definition.kind,
                ),
            )
        except ProfileNotFoundError as exc:
            raise ProfileUseCaseError("profile_not_found") from exc
        except CategoryNameExistsError as exc:
            raise self._category_name_conflict(exc) from exc
        except ProfilePersistenceError as exc:
            raise ProfileUseCaseError("category_persistence_failed") from exc

    def add_region(
        self,
        *,
        profile_id: str,
        region: RegionDefinition,
        expected_version: int,
    ) -> ProfileRecord:
        """Append one HUD region to a profile that already exists.

        The new region governs the next run and nothing before it: no
        `region_sample` is created for frames that already have one, and no frame
        returns to cropping or OCR. The whole profile answers, because appending
        bumps the profile version and the caller needs it for its next write.

        `source_width`/`source_height` are read outside the writing transaction
        on purpose: they are immutable for the life of a profile — no route
        changes them — so the only state the reservation has to protect is the
        version, the run gate and the name.
        """
        profile = self.get_profile(profile_id)
        definition = self._validated_region(
            region,
            source_width=profile.source_width,
            source_height=profile.source_height,
            character_categories=(
                category.name for category in profile.categories if category.kind == "character"
            ),
        )
        whitelist, mode = self._required_ocr_config(definition)
        try:
            return self._profiles.add_region(
                profile_id,
                NewRegionDraft(
                    id=str(uuid4()),
                    name=definition.name,
                    x=definition.bbox.x,
                    y=definition.bbox.y,
                    width=definition.bbox.width,
                    height=definition.bbox.height,
                    ocr_allowed_chars=whitelist,
                    ocr_page_segmentation_mode=mode,
                    expected_version=expected_version,
                ),
            )
        except ProfileNotFoundError as exc:
            raise ProfileUseCaseError("profile_not_found") from exc
        except ProfileVersionConflictError as exc:
            raise ProfileUseCaseError("version_conflict") from exc
        except ProfileRegionBlockedError as exc:
            raise ProfileUseCaseError("active_run") from exc
        except RegionNameExistsError as exc:
            raise self._region_name_conflict(exc) from exc
        except ProfilePersistenceError as exc:
            raise ProfileUseCaseError("region_persistence_failed") from exc

    def update_region_ocr_config(
        self,
        *,
        profile_id: str,
        region_id: str,
        allowed_chars: tuple[str, ...],
        page_segmentation_mode: int,
        expected_version: int,
    ) -> ProfileRecord:
        profile = self.get_profile(profile_id)
        existing = next((item for item in profile.regions if item.id == region_id), None)
        if existing is None:
            raise ProfileUseCaseError("region_not_found")
        definition = self._validated_region(
            RegionDefinition(
                name=existing.name,
                bbox=BBox(existing.x, existing.y, existing.width, existing.height),
                allowed_chars=allowed_chars,
                page_segmentation_mode=page_segmentation_mode,
            ),
            source_width=profile.source_width,
            source_height=profile.source_height,
            character_categories=(
                category.name for category in profile.categories if category.kind == "character"
            ),
        )
        whitelist, mode = self._required_ocr_config(definition)
        try:
            return self._profiles.update_region_ocr_config(
                profile_id,
                region_id,
                RegionOcrConfigDraft(
                    ocr_allowed_chars=whitelist,
                    ocr_page_segmentation_mode=mode,
                    expected_version=expected_version,
                ),
            )
        except ProfileNotFoundError as exc:
            raise ProfileUseCaseError("profile_not_found") from exc
        except RegionNotFoundError as exc:
            raise ProfileUseCaseError("region_not_found") from exc
        except ProfileVersionConflictError as exc:
            raise ProfileUseCaseError("version_conflict") from exc
        except ProfileRegionBlockedError as exc:
            raise ProfileUseCaseError("active_run") from exc
        except ProfilePersistenceError as exc:
            raise ProfileUseCaseError("region_persistence_failed") from exc

    def rename_category(
        self,
        *,
        profile_id: str,
        category_id: str,
        category: CategoryDefinition,
        expected_version: int,
    ) -> ProfileRecord:
        """Rename one existing category through the rules that govern creation.

        The category identifier and every annotation pointing at it survive:
        `Annotation.category_id` references `categories.id`, never the name.
        """
        definition = self._validated_category(category)
        try:
            return self._profiles.rename_category(
                profile_id,
                category_id,
                RenamedCategoryDraft(
                    name=definition.name,
                    kind=definition.kind,
                    expected_version=expected_version,
                ),
            )
        except ProfileNotFoundError as exc:
            raise ProfileUseCaseError("profile_not_found") from exc
        except CategoryNotFoundError as exc:
            raise ProfileUseCaseError("category_not_found") from exc
        except ProfileVersionConflictError as exc:
            raise ProfileUseCaseError("version_conflict") from exc
        except CategoryNameExistsError as exc:
            raise self._category_name_conflict(exc) from exc
        except CategoryUsedByRegionsError as exc:
            raise ProfileUseCaseError(
                "category_used_by_regions",
                details={
                    "regions": [
                        {"id": region_id, "name": region_name}
                        for region_id, region_name in exc.regions
                    ]
                },
            ) from exc
        except ProfilePersistenceError as exc:
            raise ProfileUseCaseError("category_persistence_failed") from exc

    def _validated_category(self, category: CategoryDefinition) -> CategoryDefinition:
        try:
            return self._engine.validate_category(category)
        except DefinitionValidationError as exc:
            details: dict[str, Any] = {"field": exc.field}
            if exc.index is not None:
                details["index"] = exc.index
            raise ProfileUseCaseError(exc.code, details=details) from exc

    def _validated_region(
        self,
        region: RegionDefinition,
        *,
        source_width: int,
        source_height: int,
        character_categories: Iterable[str] | None = None,
    ) -> RegionDefinition:
        """Validate a region the same way profile creation does."""
        try:
            return self._engine.validate_region(
                region,
                source_width=source_width,
                source_height=source_height,
                character_categories=character_categories,
            )
        except DefinitionValidationError as exc:
            details: dict[str, Any] = {"field": exc.field}
            if exc.index is not None:
                details["index"] = exc.index
            raise ProfileUseCaseError(exc.code, details=details) from exc

    @staticmethod
    def _required_ocr_config(definition: RegionDefinition) -> tuple[str, int]:
        """Every write path states both settings; a region never half-configures."""
        if definition.allowed_chars is None or definition.page_segmentation_mode is None:
            raise ProfileUseCaseError(
                "incomplete_region_ocr_config", details={"field": "allowed_chars"}
            )
        return "".join(definition.allowed_chars), definition.page_segmentation_mode

    @staticmethod
    def _region_name_conflict(error: RegionNameExistsError) -> ProfileUseCaseError:
        details: dict[str, Any] = {}
        if error.region_id is not None and error.region_name is not None:
            details = {"region_id": error.region_id, "region_name": error.region_name}
        return ProfileUseCaseError("region_name_exists", details=details)

    @staticmethod
    def _category_name_conflict(error: CategoryNameExistsError) -> ProfileUseCaseError:
        details: dict[str, Any] = {}
        if error.category_id is not None and error.category_name is not None:
            details = {
                "category_id": error.category_id,
                "category_name": error.category_name,
            }
        return ProfileUseCaseError("category_name_exists", details=details)

    def get_reference_asset(self, asset_id: str) -> AssetRecord:
        try:
            return self._assets.get_reference(asset_id)
        except AssetNotFoundError as exc:
            preview = self._reference_previews.get(asset_id)
            if preview is None:
                raise ProfileUseCaseError("asset_not_found") from exc
            try:
                return self._assets.get_ephemeral_reference(
                    relpath=preview.relpath,
                    content_type=preview.content_type,
                )
            except AssetNotFoundError as preview_error:
                self._reference_previews.pop(asset_id, None)
                raise ProfileUseCaseError("asset_not_found") from preview_error


def region_definition(
    *,
    name: str,
    x: int,
    y: int,
    width: int,
    height: int,
    allowed_chars: tuple[str, ...] | None = None,
    page_segmentation_mode: int | None = None,
) -> RegionDefinition:
    return RegionDefinition(
        name=name,
        bbox=BBox(x=x, y=y, width=width, height=height),
        allowed_chars=allowed_chars,
        page_segmentation_mode=page_segmentation_mode,
    )
