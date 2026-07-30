from __future__ import annotations

import pytest

from backend.app.engines.definition import (
    BBox,
    CategoryDefinition,
    DatasetDefinitionEngine,
    DefinitionValidationError,
    ProfileDefinition,
    RegionDefinition,
)


def _profile(
    *,
    regions: tuple[RegionDefinition, ...] | None = None,
    categories: tuple[CategoryDefinition, ...] | None = None,
) -> ProfileDefinition:
    return ProfileDefinition(
        name="Example",
        source_width=1920,
        source_height=1080,
        regions=regions or (RegionDefinition("Health", BBox(0, 0, 100, 50)),),
        categories=categories or (CategoryDefinition("0", "character"),),
    )


def test_bbox_exactly_on_source_edges_is_valid() -> None:
    engine = DatasetDefinitionEngine()
    definition = _profile(regions=(RegionDefinition("edge", BBox(1820, 980, 100, 100)),))

    assert engine.validate_profile(definition).regions == definition.regions


@pytest.mark.parametrize(
    "bbox,code",
    [
        (BBox(-1, 0, 1, 1), "invalid_region_bbox"),
        (BBox(0, -1, 1, 1), "invalid_region_bbox"),
        (BBox(0, 0, 0, 1), "invalid_region_bbox"),
        (BBox(0, 0, 1, 0), "invalid_region_bbox"),
        (BBox(0, 0, -1, 1), "invalid_region_bbox"),
        (BBox(0, 0, 1, -1), "invalid_region_bbox"),
        (BBox(1920, 0, 1, 1), "region_out_of_bounds"),
        (BBox(0, 1080, 1, 1), "region_out_of_bounds"),
    ],
)
def test_invalid_bbox_is_rejected_independently_of_api(bbox: BBox, code: str) -> None:
    with pytest.raises(DefinitionValidationError) as error:
        DatasetDefinitionEngine().validate_profile(
            _profile(regions=(RegionDefinition("invalid", bbox),))
        )

    assert error.value.code == code


def test_duplicate_region_and_category_names_are_case_insensitive() -> None:
    engine = DatasetDefinitionEngine()
    with pytest.raises(DefinitionValidationError) as region_error:
        engine.validate_profile(
            _profile(
                regions=(
                    RegionDefinition("Score", BBox(0, 0, 10, 10)),
                    RegionDefinition(" score ", BBox(10, 0, 10, 10)),
                )
            )
        )
    assert region_error.value.code == "duplicate_region_name"

    with pytest.raises(DefinitionValidationError) as category_error:
        engine.validate_profile(
            _profile(
                categories=(
                    CategoryDefinition("health", "game"),
                    CategoryDefinition(" HEALTH ", "game"),
                )
            )
        )
    assert category_error.value.code == "duplicate_category_name"


def test_character_category_allowlist_is_enforced() -> None:
    with pytest.raises(DefinitionValidationError) as error:
        DatasetDefinitionEngine().validate_profile(
            _profile(categories=(CategoryDefinition("health", "character"),))
        )

    assert error.value.code == "invalid_character_category"
