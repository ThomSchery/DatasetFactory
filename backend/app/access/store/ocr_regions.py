from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Literal, cast

from backend.app.engines.definition import BBox, OcrProvenance


@dataclass(frozen=True)
class RegionOcrSnapshot:
    """One region exactly as the owning run saw it, geometry included.

    The geometry lives here rather than being read back from `hud_regions`
    because a profile may legitimately be edited after a run finished. Cropping,
    sample dimensions and every later read of a historical run resolve against
    this snapshot, so a resize changes the next run and nothing before it.
    """

    region_id: str
    region_name: str
    bbox: BBox
    allowed_chars: tuple[str, ...]
    page_segmentation_mode: int
    provenance: OcrProvenance
    uses_profile_fallback: bool = False


def encode_region_ocr_snapshots(snapshots: tuple[RegionOcrSnapshot, ...]) -> str:
    payload = [
        {
            "region_id": snapshot.region_id,
            "region_name": snapshot.region_name,
            "x": snapshot.bbox.x,
            "y": snapshot.bbox.y,
            "width": snapshot.bbox.width,
            "height": snapshot.bbox.height,
            "allowed_chars": "".join(snapshot.allowed_chars),
            "page_segmentation_mode": snapshot.page_segmentation_mode,
            "uses_profile_fallback": snapshot.uses_profile_fallback,
            "provenance": {
                "engine_id": snapshot.provenance.engine_id,
                "engine_version": snapshot.provenance.engine_version,
                "runtime_sha256": snapshot.provenance.runtime_sha256,
                "model_sha256": snapshot.provenance.model_sha256,
                "config_hash": snapshot.provenance.config_hash,
                "experimental": snapshot.provenance.experimental,
                "quality_gate": snapshot.provenance.quality_gate,
                "language": snapshot.provenance.language,
                "page_segmentation_mode": snapshot.provenance.page_segmentation_mode,
            },
        }
        for snapshot in snapshots
    ]
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def decode_region_ocr_snapshots(document: str) -> tuple[RegionOcrSnapshot, ...]:
    payload: Any = json.loads(document)
    if not isinstance(payload, list):
        raise ValueError("invalid region OCR snapshot")
    snapshots: list[RegionOcrSnapshot] = []
    for raw in payload:
        if not isinstance(raw, dict) or not isinstance(raw.get("provenance"), dict):
            raise ValueError("invalid region OCR snapshot")
        provenance = cast(dict[str, Any], raw["provenance"])
        quality_gate = provenance.get("quality_gate")
        if quality_gate not in {"passed", "failed", "unknown"}:
            raise ValueError("invalid region OCR snapshot")
        allowed_chars = raw.get("allowed_chars")
        psm = raw.get("page_segmentation_mode")
        provenance_psm = provenance.get("page_segmentation_mode")
        uses_profile_fallback = raw.get("uses_profile_fallback", False)
        if (
            not isinstance(allowed_chars, str)
            or (not allowed_chars and uses_profile_fallback is not True)
            or type(psm) is not int
            or type(provenance_psm) is not int
            or psm != provenance_psm
            or type(uses_profile_fallback) is not bool
        ):
            raise ValueError("invalid region OCR snapshot")
        snapshots.append(
            RegionOcrSnapshot(
                region_id=_required_string(raw, "region_id"),
                region_name=_required_string(raw, "region_name"),
                bbox=_required_bbox(raw),
                allowed_chars=tuple(allowed_chars),
                page_segmentation_mode=psm,
                provenance=OcrProvenance(
                    engine_id=_required_string(provenance, "engine_id"),
                    engine_version=_required_string(provenance, "engine_version"),
                    runtime_sha256=_required_string(provenance, "runtime_sha256"),
                    model_sha256=_required_string(provenance, "model_sha256"),
                    config_hash=_required_string(provenance, "config_hash"),
                    experimental=_required_bool(provenance, "experimental"),
                    quality_gate=cast(Literal["passed", "failed", "unknown"], quality_gate),
                    language=_required_string(provenance, "language"),
                    page_segmentation_mode=provenance_psm,
                ),
                uses_profile_fallback=uses_profile_fallback,
            )
        )
    return tuple(snapshots)


def _required_string(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value:
        raise ValueError("invalid region OCR snapshot")
    return value


def _required_bbox(payload: dict[str, Any]) -> BBox:
    """Geometry is mandatory: migration 0008 backfills every pre-existing run."""
    values: list[int] = []
    for key in ("x", "y", "width", "height"):
        value = payload.get(key)
        if type(value) is not int:
            raise ValueError("invalid region OCR snapshot")
        values.append(value)
    x, y, width, height = values
    if x < 0 or y < 0 or width <= 0 or height <= 0:
        raise ValueError("invalid region OCR snapshot")
    return BBox(x=x, y=y, width=width, height=height)


def _required_bool(payload: dict[str, Any], key: str) -> bool:
    value = payload.get(key)
    if type(value) is not bool:
        raise ValueError("invalid region OCR snapshot")
    return value
