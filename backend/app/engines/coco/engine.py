from __future__ import annotations

import json
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any


class CocoValidationError(ValueError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class CocoImageInput:
    frame_id: str
    frame_index: int
    file_name: str
    width: int
    height: int


@dataclass(frozen=True)
class CocoCategoryInput:
    category_id: str
    ordinal: int
    name: str


@dataclass(frozen=True)
class CocoAnnotationInput:
    annotation_id: str
    frame_id: str
    category_id: str
    x: int
    y: int
    width: int
    height: int


class CocoExportEngine:
    """Build a deterministic COCO document without persistence or filesystem access."""

    def build(
        self,
        *,
        images: tuple[CocoImageInput, ...],
        categories: tuple[CocoCategoryInput, ...],
        annotations: tuple[CocoAnnotationInput, ...],
    ) -> bytes:
        sorted_images = tuple(sorted(images, key=lambda item: (item.frame_index, item.frame_id)))
        sorted_categories = tuple(
            sorted(categories, key=lambda item: (item.ordinal, item.category_id))
        )
        self._require_unique((item.frame_id for item in sorted_images), "duplicate_frame")
        self._require_unique((item.category_id for item in sorted_categories), "duplicate_category")
        self._require_unique((item.annotation_id for item in annotations), "duplicate_annotation")

        image_ids = {item.frame_id: index for index, item in enumerate(sorted_images, start=1)}
        category_ids = {
            item.category_id: index for index, item in enumerate(sorted_categories, start=1)
        }
        image_by_frame = {item.frame_id: item for item in sorted_images}

        for image in sorted_images:
            if image.frame_index < 0 or image.width <= 0 or image.height <= 0:
                raise CocoValidationError("invalid_image")
            path_parts = image.file_name.split("/")
            if (
                not image.file_name
                or image.file_name.startswith(("/", "\\"))
                or "\\" in image.file_name
                or ":" in image.file_name
                or any(part in {"", ".", ".."} for part in path_parts)
            ):
                raise CocoValidationError("invalid_image_path")
        for category in sorted_categories:
            if category.ordinal < 0 or not category.name:
                raise CocoValidationError("invalid_category")

        def annotation_key(item: CocoAnnotationInput) -> tuple[int, int, int, int, str]:
            image_id = image_ids.get(item.frame_id)
            category_id = category_ids.get(item.category_id)
            if image_id is None:
                raise CocoValidationError("annotation_image_missing")
            if category_id is None:
                raise CocoValidationError("annotation_category_missing")
            return image_id, category_id, item.x, item.y, item.annotation_id

        sorted_annotations = tuple(sorted(annotations, key=annotation_key))
        annotation_documents: list[dict[str, Any]] = []
        for annotation_id, annotation in enumerate(sorted_annotations, start=1):
            image = image_by_frame[annotation.frame_id]
            self._validate_bbox(annotation, image)
            annotation_documents.append(
                {
                    "area": annotation.width * annotation.height,
                    "bbox": [
                        annotation.x,
                        annotation.y,
                        annotation.width,
                        annotation.height,
                    ],
                    "category_id": category_ids[annotation.category_id],
                    "id": annotation_id,
                    "image_id": image_ids[annotation.frame_id],
                    "iscrowd": 0,
                }
            )

        document: dict[str, Any] = {
            "annotations": annotation_documents,
            "categories": [
                {"id": category_ids[item.category_id], "name": item.name}
                for item in sorted_categories
            ],
            "images": [
                {
                    "file_name": item.file_name,
                    "height": item.height,
                    "id": image_ids[item.frame_id],
                    "width": item.width,
                }
                for item in sorted_images
            ],
        }
        self._validate_document(document)
        return json.dumps(
            document,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")

    @staticmethod
    def _validate_bbox(annotation: CocoAnnotationInput, image: CocoImageInput) -> None:
        if (
            annotation.x < 0
            or annotation.y < 0
            or annotation.width <= 0
            or annotation.height <= 0
            or annotation.x + annotation.width > image.width
            or annotation.y + annotation.height > image.height
        ):
            raise CocoValidationError("invalid_bbox")

    @staticmethod
    def _validate_document(document: dict[str, Any]) -> None:
        image_ids = [item["id"] for item in document["images"]]
        category_ids = [item["id"] for item in document["categories"]]
        annotation_ids = [item["id"] for item in document["annotations"]]
        if len(image_ids) != len(set(image_ids)):
            raise CocoValidationError("duplicate_image_id")
        if len(category_ids) != len(set(category_ids)):
            raise CocoValidationError("duplicate_category_id")
        if len(annotation_ids) != len(set(annotation_ids)):
            raise CocoValidationError("duplicate_annotation_id")
        for annotation in document["annotations"]:
            bbox = annotation["bbox"]
            if (
                len(bbox) != 4
                or annotation["area"] != bbox[2] * bbox[3]
                or annotation["iscrowd"] != 0
            ):
                raise CocoValidationError("invalid_annotation")

    @staticmethod
    def _require_unique(values: Iterable[str], code: str) -> None:
        materialized = tuple(values)
        if len(materialized) != len(set(materialized)):
            raise CocoValidationError(code)
