from __future__ import annotations

import unicodedata
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:
    from backend.app.engines.definition.ocr_mapping import OcrCandidate, OcrMappingResult

CategoryKind = Literal["character", "game"]
_CHARACTER_CATEGORIES = frozenset("-/0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ")
OCR_PAGE_SEGMENTATION_MODES = frozenset({3, 4, 6, 7, 8, 10, 11, 12, 13})


def normalize_profile_name(name: str) -> str:
    return unicodedata.normalize("NFKC", name.strip()).casefold()


class DefinitionValidationError(ValueError):
    """Stable domain validation failure independent of transport and persistence."""

    def __init__(self, code: str, *, field: str, index: int | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.field = field
        self.index = index


@dataclass(frozen=True)
class BBox:
    x: int
    y: int
    width: int
    height: int


@dataclass(frozen=True)
class RegionDefinition:
    name: str
    bbox: BBox
    allowed_chars: tuple[str, ...] | None = None
    page_segmentation_mode: int | None = None


@dataclass(frozen=True)
class CategoryDefinition:
    name: str
    kind: CategoryKind


@dataclass(frozen=True)
class ProfileDefinition:
    name: str
    source_width: int
    source_height: int
    regions: tuple[RegionDefinition, ...]
    categories: tuple[CategoryDefinition, ...]


class DatasetDefinitionEngine:
    """Validate and normalize the semantic definition of one game profile."""

    def validate_category(self, category: CategoryDefinition) -> CategoryDefinition:
        """Validate one category with the same rules used by profile creation."""
        return self._validate_category(category, index=None)

    def validate_region(
        self,
        region: RegionDefinition,
        *,
        source_width: int,
        source_height: int,
        character_categories: Iterable[str] | None = None,
    ) -> RegionDefinition:
        """Validate one region with the same rules used by profile creation.

        The bounds check is the point: `crop_regions` raises `crop_out_of_bounds`
        when `x + width` leaves the frame, and that failure would otherwise
        surface an hour into the next run instead of at the moment the operator
        drew the rectangle.
        """
        return self._validate_region(
            region,
            source_width,
            source_height,
            index=None,
            character_categories=character_categories,
        )

    def validate_profile(self, profile: ProfileDefinition) -> ProfileDefinition:
        name = profile.name.strip()
        if not name:
            raise DefinitionValidationError("profile_name_required", field="name")
        if len(name) > 200:
            raise DefinitionValidationError("profile_name_too_long", field="name")
        if profile.source_width <= 0 or profile.source_height <= 0:
            raise DefinitionValidationError(
                "invalid_source_dimensions", field="reference_image_path"
            )
        if not profile.regions:
            raise DefinitionValidationError("regions_required", field="regions")
        if not profile.categories:
            raise DefinitionValidationError("categories_required", field="categories")

        categories = tuple(
            self._validate_category(category, index)
            for index, category in enumerate(profile.categories)
        )
        character_categories = tuple(
            category.name for category in categories if category.kind == "character"
        )
        regions = tuple(
            self._validate_region(
                region,
                profile.source_width,
                profile.source_height,
                index,
                character_categories=character_categories,
            )
            for index, region in enumerate(profile.regions)
        )
        self._require_unique(
            (region.name for region in regions), "duplicate_region_name", "regions"
        )
        self._require_unique(
            (category.name for category in categories),
            "duplicate_category_name",
            "categories",
        )
        return ProfileDefinition(
            name=name,
            source_width=profile.source_width,
            source_height=profile.source_height,
            regions=regions,
            categories=categories,
        )

    def map_ocr_candidates(
        self,
        candidates: tuple[OcrCandidate, ...],
        *,
        region_bbox: BBox,
        crop_width: int,
        crop_height: int,
        frame_width: int,
        frame_height: int,
        category_ids: Mapping[str, str],
    ) -> OcrMappingResult:
        from backend.app.engines.definition.ocr_mapping import map_ocr_candidates

        return map_ocr_candidates(
            candidates,
            region_bbox=region_bbox,
            crop_width=crop_width,
            crop_height=crop_height,
            frame_width=frame_width,
            frame_height=frame_height,
            category_ids=category_ids,
        )

    @staticmethod
    def _validate_region(
        region: RegionDefinition,
        source_width: int,
        source_height: int,
        index: int | None,
        *,
        character_categories: Iterable[str] | None = None,
    ) -> RegionDefinition:
        name = region.name.strip()
        if not name or len(name) > 200:
            raise DefinitionValidationError("invalid_region_name", field="regions", index=index)
        bbox = region.bbox
        if bbox.x < 0 or bbox.y < 0 or bbox.width <= 0 or bbox.height <= 0:
            raise DefinitionValidationError("invalid_region_bbox", field="regions", index=index)
        if bbox.x + bbox.width > source_width or bbox.y + bbox.height > source_height:
            raise DefinitionValidationError("region_out_of_bounds", field="regions", index=index)
        allowed_chars = region.allowed_chars
        page_segmentation_mode = region.page_segmentation_mode
        if (allowed_chars is None) != (page_segmentation_mode is None):
            raise DefinitionValidationError(
                "incomplete_region_ocr_config", field="regions", index=index
            )
        if allowed_chars is not None:
            ordered_character_categories = tuple(character_categories or ())
            available = frozenset(ordered_character_categories)
            normalized = tuple(dict.fromkeys(allowed_chars))
            if not normalized:
                raise DefinitionValidationError(
                    "region_allowed_chars_required", field="allowed_chars", index=index
                )
            if any(len(char) != 1 or char not in available for char in normalized):
                raise DefinitionValidationError(
                    "region_allowed_chars_not_in_profile", field="allowed_chars", index=index
                )
            if page_segmentation_mode not in OCR_PAGE_SEGMENTATION_MODES:
                raise DefinitionValidationError(
                    "invalid_region_page_segmentation_mode",
                    field="page_segmentation_mode",
                    index=index,
                )
            allowed_chars = tuple(
                char for char in ordered_character_categories if char in normalized
            )
        return RegionDefinition(
            name=name,
            bbox=bbox,
            allowed_chars=allowed_chars,
            page_segmentation_mode=page_segmentation_mode,
        )

    @staticmethod
    def _validate_category(category: CategoryDefinition, index: int | None) -> CategoryDefinition:
        name = category.name.strip()
        if not name or len(name) > 200:
            raise DefinitionValidationError(
                "invalid_category_name", field="categories", index=index
            )
        if category.kind not in ("character", "game"):
            raise DefinitionValidationError(
                "invalid_category_kind", field="categories", index=index
            )
        if category.kind == "character" and name not in _CHARACTER_CATEGORIES:
            raise DefinitionValidationError(
                "invalid_character_category", field="categories", index=index
            )
        return CategoryDefinition(name=name, kind=category.kind)

    @staticmethod
    def _require_unique(values: Iterable[str], code: str, field: str) -> None:
        seen: set[str] = set()
        for index, value in enumerate(values):
            normalized = value.casefold()
            if normalized in seen:
                raise DefinitionValidationError(code, field=field, index=index)
            seen.add(normalized)
