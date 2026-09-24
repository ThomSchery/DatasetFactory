from __future__ import annotations

import json

import pytest

from backend.app.access.store.ocr_regions import decode_region_ocr_snapshots


def test_empty_allowed_chars_are_valid_only_for_profile_fallback_snapshot() -> None:
    document = _snapshot_document(uses_profile_fallback=True)

    snapshots = decode_region_ocr_snapshots(document)

    assert snapshots[0].allowed_chars == ()
    assert snapshots[0].uses_profile_fallback is True


def test_empty_allowed_chars_are_rejected_for_explicit_snapshot() -> None:
    document = _snapshot_document(uses_profile_fallback=False)

    with pytest.raises(ValueError, match="invalid region OCR snapshot"):
        decode_region_ocr_snapshots(document)


def _snapshot_document(*, uses_profile_fallback: bool) -> str:
    return json.dumps(
        [
            {
                "allowed_chars": "",
                "page_segmentation_mode": 7,
                "provenance": {
                    "config_hash": "3" * 64,
                    "engine_id": "tesseract",
                    "engine_version": "5.5.3",
                    "experimental": True,
                    "language": "eng",
                    "model_sha256": "2" * 64,
                    "page_segmentation_mode": 7,
                    "quality_gate": "failed",
                    "runtime_sha256": "1" * 64,
                },
                "region_id": "region",
                "region_name": "status",
                "uses_profile_fallback": uses_profile_fallback,
            }
        ]
    )
