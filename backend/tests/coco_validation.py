from __future__ import annotations

import math
from collections.abc import Iterable
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, StrictStr
from pydantic import ValidationError as PydanticValidationError

Number = StrictInt | StrictFloat


class CocoComplianceError(ValueError):
    """A stable, actionable failure from strict COCO export validation."""


class _CocoImage(BaseModel):
    model_config = ConfigDict(extra="allow", strict=True)

    id: StrictInt
    file_name: Annotated[StrictStr, Field(min_length=1)]
    width: Annotated[StrictInt, Field(gt=0)]
    height: Annotated[StrictInt, Field(gt=0)]


class _CocoCategory(BaseModel):
    model_config = ConfigDict(extra="allow", strict=True)

    id: StrictInt
    name: Annotated[StrictStr, Field(min_length=1)]


class _CocoAnnotation(BaseModel):
    model_config = ConfigDict(extra="allow", strict=True)

    id: StrictInt
    image_id: StrictInt
    category_id: StrictInt
    bbox: Annotated[list[Number], Field(min_length=4, max_length=4)]
    area: Number
    iscrowd: StrictInt


class _CocoDocument(BaseModel):
    model_config = ConfigDict(extra="allow", strict=True)

    images: list[_CocoImage]
    annotations: list[_CocoAnnotation]
    categories: list[_CocoCategory]


def validate_coco_document(document: object) -> None:
    """Validate structural and referential COCO invariants without a golden file."""
    try:
        parsed = _CocoDocument.model_validate(document, strict=True)
    except PydanticValidationError as error:
        first = error.errors(include_url=False)[0]
        location = ".".join(str(part) for part in first["loc"])
        raise CocoComplianceError(f"schema:{location}:{first['type']}") from error

    _require_unique_ids(parsed.images, "images")
    _require_unique_ids(parsed.annotations, "annotations")
    _require_unique_ids(parsed.categories, "categories")

    images = {image.id: image for image in parsed.images}
    category_ids = {category.id for category in parsed.categories}
    for index, annotation in enumerate(parsed.annotations):
        image = images.get(annotation.image_id)
        if image is None:
            raise CocoComplianceError(
                f"annotations[{index}].image_id:missing:{annotation.image_id}"
            )
        if annotation.category_id not in category_ids:
            raise CocoComplianceError(
                f"annotations[{index}].category_id:missing:{annotation.category_id}"
            )

        x, y, width, height = annotation.bbox
        if x < 0 or y < 0:
            raise CocoComplianceError(f"annotations[{index}].bbox:negative_origin")
        if width <= 0 or height <= 0:
            raise CocoComplianceError(f"annotations[{index}].bbox:non_positive_size")
        if x + width > image.width or y + height > image.height:
            raise CocoComplianceError(f"annotations[{index}].bbox:outside_image")
        if not math.isclose(
            float(annotation.area),
            float(width * height),
            rel_tol=1e-9,
            abs_tol=1e-9,
        ):
            raise CocoComplianceError(f"annotations[{index}].area:bbox_mismatch")
        if annotation.iscrowd not in {0, 1}:
            raise CocoComplianceError(f"annotations[{index}].iscrowd:expected_0_or_1")


def _require_unique_ids(
    records: Iterable[_CocoImage | _CocoAnnotation | _CocoCategory], collection: str
) -> None:
    seen: set[int] = set()
    for record in records:
        if record.id in seen:
            raise CocoComplianceError(f"{collection}.id:duplicate:{record.id}")
        seen.add(record.id)
