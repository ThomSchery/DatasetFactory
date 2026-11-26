from __future__ import annotations

import unicodedata
from collections.abc import Collection, Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import TYPE_CHECKING, Final, Literal

from backend.app.engines.definition import class_rules
from backend.app.engines.definition.class_rules import ClassMove, ClassSnapshot

if TYPE_CHECKING:
    from backend.app.engines.definition.ocr_mapping import OcrCandidate, OcrMappingResult

CategoryKind = Literal["character", "game"]
_CHARACTER_CATEGORIES = frozenset("-/0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ")
# How the text sits in a region, in the operator's words and in no engine's: each OCR
# adapter turns the layout into whatever its engine understands. `auto` leaves the
# choice to the adapter.
OCR_TEXT_LAYOUTS: Final[tuple[str, ...]] = ("auto", "line", "word", "block", "sparse")
DEFAULT_OCR_TEXT_LAYOUT: Final = "auto"


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
    text_layout: str | None = None


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

    # Region ↔ class rules (FE-026, FE-030). The decisions live in `class_rules`; these
    # methods are the engine's public face, the one persistence is handed.

    @staticmethod
    def classes_to_remove(
        existing: Sequence[ClassSnapshot],
        kept_ids: Collection[str],
        region_names: Iterable[str],
    ) -> tuple[ClassSnapshot, ...]:
        return class_rules.classes_to_remove(existing, kept_ids, region_names)

    @staticmethod
    def next_class_ordinal(current_max: int | None, *, floor: int = 0) -> int:
        return class_rules.next_class_ordinal(current_max, floor=floor)

    @staticmethod
    def class_moves_for_region_renames(
        classes: Sequence[ClassSnapshot],
        active_region_names: Iterable[str],
        renamed: Sequence[tuple[str, str]],
    ) -> tuple[ClassMove, ...]:
        return class_rules.class_moves_for_region_renames(classes, active_region_names, renamed)

    @staticmethod
    def unused_classes_to_drop(
        classes: Sequence[ClassSnapshot],
        retired_names: Iterable[str],
        active_region_names: Iterable[str],
        used_ids: Collection[str],
    ) -> tuple[str, ...]:
        return class_rules.unused_classes_to_drop(
            classes, retired_names, active_region_names, used_ids
        )

    @staticmethod
    def missing_region_classes(
        class_names: Iterable[str],
        stored_region_names: Sequence[str],
        request_order: Sequence[str] = (),
    ) -> tuple[str, ...]:
        return class_rules.missing_region_classes(class_names, stored_region_names, request_order)

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
        text_layout = region.text_layout
        if (allowed_chars is None) != (text_layout is None):
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
            if text_layout not in OCR_TEXT_LAYOUTS:
                raise DefinitionValidationError(
                    "invalid_region_text_layout",
                    field="text_layout",
                    index=index,
                )
            allowed_chars = tuple(
                char for char in ordered_character_categories if char in normalized
            )
        return RegionDefinition(
            name=name,
            bbox=bbox,
            allowed_chars=allowed_chars,
            text_layout=text_layout,
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
