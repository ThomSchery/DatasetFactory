from __future__ import annotations

import hashlib
import json
import tempfile
from dataclasses import asdict
from pathlib import Path

from backend.app.access.ocr import (
    TesseractOcrEngine,
    TesseractProcessRunner,
    TesseractRuntimeIdentity,
)
from backend.app.access.store.workspace import Workspace
from backend.app.engines.definition import (
    EVALUATOR_VERSION,
    BBox,
    ExpectedOcrCharacter,
    OcrEvaluationCrop,
    OcrQualityThresholds,
    evaluate_ocr,
)

ROOT = Path(__file__).resolve().parent
GROUND_TRUTH = ROOT / "expected-ocr" / "synthetic-hud.json"
OUTPUT = ROOT / "expected-ocr" / "tesseract-5.5.3-evaluation-v2.json"
RUNTIME = Path("D:/tools/tesseract-5.5.3/tesseract.exe")
MODEL = Path("D:/tools/tesseract-5.5.3/tessdata/eng.traineddata")
RUNTIME_SHA256 = "c66f0f12ed76f6aa455dac97684bbc86756d6a732380bee09122454cfda3f420"
MODEL_SHA256 = "7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2"
ENGINE_VERSION = "v5.5.3.20260724"


def _fixture_manifest(ground_truth: dict[str, object]) -> dict[str, object]:
    samples = ground_truth["samples"]
    if not isinstance(samples, list):
        raise TypeError("ground truth samples must be a list")
    payload: dict[str, object] = {
        "ground_truth_sha256": hashlib.sha256(GROUND_TRUTH.read_bytes()).hexdigest(),
        "crops": [
            {
                "path": sample["crop"],
                "sha256": hashlib.sha256((ROOT / sample["crop"]).read_bytes()).hexdigest(),
            }
            for sample in samples
        ],
    }
    canonical = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    return {
        **payload,
        "manifest_sha256": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
    }


def main() -> None:
    expected = json.loads(GROUND_TRUTH.read_text(encoding="utf-8"))
    thresholds = OcrQualityThresholds()
    with tempfile.TemporaryDirectory(prefix="tk003-eval-", dir=ROOT) as temporary:
        temporary_root = Path(temporary)
        workspace = Workspace(temporary_root / "workspace", temporary_root / "cache")
        workspace.prepare()
        runtime = TesseractRuntimeIdentity(
            RUNTIME,
            MODEL,
            ENGINE_VERSION,
            RUNTIME_SHA256,
            MODEL_SHA256,
        )
        engine = TesseractOcrEngine(workspace, runtime, 30, TesseractProcessRunner())
        crops: list[OcrEvaluationCrop] = []
        observations: list[dict[str, object]] = []
        for sample in expected["samples"]:
            crop_relpath = Path("runs/evaluation") / Path(sample["crop"]).name
            crop_path = workspace.resolve_relpath(crop_relpath)
            crop_path.parent.mkdir(parents=True, exist_ok=True)
            crop_path.write_bytes((ROOT / sample["crop"]).read_bytes())
            candidates = engine.detect_characters(crop_relpath, expected["allowed_chars"])
            expected_characters = tuple(
                ExpectedOcrCharacter(character["char"], BBox(*character["bbox"]))
                for character in sample["characters"]
            )
            crops.append(OcrEvaluationCrop(sample["id"], expected_characters, candidates))
            observations.append(
                {
                    "id": sample["id"],
                    "text": "".join(candidate.char for candidate in candidates),
                    "characters": [
                        {
                            "char": candidate.char,
                            "bbox": list(asdict(candidate.bbox_local).values()),
                            "confidence": candidate.confidence,
                        }
                        for candidate in candidates
                    ],
                }
            )
        result = evaluate_ocr(tuple(crops), thresholds)
        first_candidate = next(candidate for crop in crops for candidate in crop.observed)
        report = {
            "schema_version": "tk003-ocr-evaluation-observation-v2",
            "evaluator_version": EVALUATOR_VERSION,
            "fixture_kind": "synthetic",
            "fixture_manifest": _fixture_manifest(expected),
            "runtime": {
                "engine_id": first_candidate.provenance.engine_id,
                "engine_version": first_candidate.provenance.engine_version,
                "runtime_sha256": first_candidate.provenance.runtime_sha256,
                "model_sha256": first_candidate.provenance.model_sha256,
                "config_hash": first_candidate.provenance.config_hash,
                "experimental": first_candidate.provenance.experimental,
                "quality_gate": first_candidate.provenance.quality_gate,
            },
            "thresholds": asdict(thresholds),
            "expected_quality_gate": "failed",
            "observations": observations,
            "evaluation": {
                "quality_gate": result.quality_gate,
                "metrics": asdict(result.metrics),
                "checks": [asdict(check) for check in result.checks],
            },
        }
        OUTPUT.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )


if __name__ == "__main__":
    main()
