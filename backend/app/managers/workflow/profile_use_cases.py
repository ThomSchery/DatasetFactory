from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import uuid4

from backend.app.access.media.image import ImageProbeError, ReferenceImageProbe
from backend.app.access.store.reference_assets import (
    ReferenceAssetStore,
    ReferenceAssetWriteError,
)
from backend.app.access.store.repositories.assets import (
    AssetNotFoundError,
    AssetRecord,
    AssetRepository,
)
from backend.app.access.store.repositories.profiles import (
    CategoryDraft,
    ProfileAggregateDraft,
    ProfileNameExistsError,
    ProfileNotFoundError,
    ProfilePersistenceError,
    ProfileRecord,
    ProfileRepository,
    ProfileSelectionBlockedError,
    ProfileSummaryRecord,
    RegionDraft,
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


@dataclass(frozen=True)
class _EphemeralReferenceAsset:
    relpath: str
    content_type: str


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
    ) -> None:
        self._engine = engine
        self._image_probe = image_probe
        self._projects = project_repository
        self._profiles = profile_repository
        self._assets = asset_repository
        self._asset_store = reference_asset_store
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
                relpath=staged_asset.relpath,
                content_type=staged_asset.content_type,
            )
            return ReferencePreview(asset_id=asset_id, width=metadata.width, height=metadata.height)
        except ImageProbeError as exc:
            raise ProfileUseCaseError(str(exc), details={"field": "reference_image_path"}) from exc
        except ReferenceAssetWriteError as exc:
            raise ProfileUseCaseError("reference_asset_copy_failed") from exc
        finally:
            if not published:
                staged_asset.discard()

    def create_profile(
        self,
        *,
        name: str,
        reference_image_path: str,
        regions: tuple[RegionDefinition, ...],
        categories: tuple[CategoryDefinition, ...],
    ) -> ProfileRecord:
        source = Path(reference_image_path)
        if not source.is_absolute():
            raise ProfileUseCaseError(
                "reference_path_not_absolute", details={"field": "reference_image_path"}
            )
        if not source.is_file():
            raise ProfileUseCaseError("source_missing", details={"field": "reference_image_path"})
        profile_id = str(uuid4())
        asset_id = str(uuid4())
        try:
            staged_asset = self._asset_store.stage(source, asset_id=asset_id)
        except ReferenceAssetWriteError as exc:
            raise ProfileUseCaseError("reference_asset_copy_failed") from exc
        created = False
        try:
            metadata = self._image_probe.inspect(staged_asset.temporary_path)
            staged_asset.configure(
                extension=metadata.extension,
                content_type=metadata.content_type,
            )
            definition = self._engine.validate_profile(
                ProfileDefinition(
                    name=name,
                    source_width=metadata.width,
                    source_height=metadata.height,
                    regions=regions,
                    categories=categories,
                )
            )
        except ImageProbeError as exc:
            raise ProfileUseCaseError(str(exc), details={"field": "reference_image_path"}) from exc
        except DefinitionValidationError as exc:
            details: dict[str, Any] = {"field": exc.field}
            if exc.index is not None:
                details["index"] = exc.index
            raise ProfileUseCaseError(exc.code, details=details) from exc
        else:
            try:
                project_id = self._projects.get_or_create_current_id()
                profile = self._profiles.create(
                    ProfileAggregateDraft(
                        id=profile_id,
                        project_id=project_id,
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
                    staged_asset,
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
                staged_asset.discard()

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


def region_definition(*, name: str, x: int, y: int, width: int, height: int) -> RegionDefinition:
    return RegionDefinition(name=name, bbox=BBox(x=x, y=y, width=width, height=height))
