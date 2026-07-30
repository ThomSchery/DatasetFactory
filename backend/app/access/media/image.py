from __future__ import annotations

import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import ClassVar

from PIL import Image, UnidentifiedImageError


class ImageProbeError(ValueError):
    pass


@dataclass(frozen=True)
class ImageMetadata:
    width: int
    height: int
    content_type: str
    extension: str


class ReferenceImageProbe:
    """Fully decode a staged PNG/JPEG and return metadata for that exact file."""

    _FORMATS: ClassVar[dict[str, tuple[str, str]]] = {
        "PNG": ("image/png", ".png"),
        "JPEG": ("image/jpeg", ".jpg"),
    }

    def inspect(self, source: Path) -> ImageMetadata:
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(source) as image:
                    image_format = image.format
                    image.verify()
                with Image.open(source) as decoded:
                    decoded.load()
                    width, height = decoded.size
                    decoded_format = decoded.format
        except FileNotFoundError as exc:
            raise ImageProbeError("reference_image_unreadable") from exc
        except (
            Image.DecompressionBombError,
            Image.DecompressionBombWarning,
            IndexError,
            OSError,
            RuntimeError,
            SyntaxError,
            ValueError,
            UnidentifiedImageError,
        ) as exc:
            raise ImageProbeError("invalid_reference_image") from exc
        if image_format != decoded_format or image_format not in self._FORMATS:
            raise ImageProbeError("unsupported_reference_image")
        if width <= 0 or height <= 0:
            raise ImageProbeError("invalid_reference_image")
        content_type, extension = self._FORMATS[image_format]
        return ImageMetadata(width, height, content_type, extension)
