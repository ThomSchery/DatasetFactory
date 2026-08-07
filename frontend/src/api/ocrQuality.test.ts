import { describe, expect, it } from "vitest";

import { ocrProvenanceOf, requiresOcrWarning } from "./ocrQuality";
import type { PipelineRun } from "./types";

/*
 * FE-001-F2 §Logika.5. The screens render the warning; this pins the decision
 * itself, so a later refactor that changes the condition has to change a test
 * that says out loud what the condition is.
 */

function run(overrides: Partial<PipelineRun> = {}): PipelineRun {
  return {
    id: "run-1",
    profile_id: "profile-1",
    video_id: "video-1",
    interval_ms: 1000,
    status: "running",
    error_code: null,
    last_heartbeat_at: null,
    attempt: 1,
    total_frames: 10,
    completed_frames: 0,
    current_stage: "sample",
    current_frame_index: 0,
    version: 1,
    review_revision: 0,
    ocr_engine: "tesseract",
    ocr_engine_version: "5.4.1",
    ocr_runtime_sha256: "a".repeat(64),
    ocr_model_sha256: "b".repeat(64),
    ocr_config_hash: "c".repeat(64),
    ocr_language: "eng",
    ocr_page_segmentation_mode: 6,
    experimental: true,
    quality_gate: "failed",
    warning: "Tesseract is an experimental OCR adapter.",
    ...overrides,
  };
}

describe("requiresOcrWarning", () => {
  it("warns when the engine is experimental", () => {
    expect(requiresOcrWarning(ocrProvenanceOf(run({ quality_gate: "passed" })))).toBe(true);
  });

  it.each(["failed", "unknown", ""])("warns when the quality gate is %o", (gate) => {
    expect(
      requiresOcrWarning(ocrProvenanceOf(run({ experimental: false, quality_gate: gate }))),
    ).toBe(true);
  });

  it("stays silent only for a non-experimental engine that passed the gate", () => {
    expect(
      requiresOcrWarning(
        ocrProvenanceOf(run({ experimental: false, quality_gate: "passed" })),
      ),
    ).toBe(false);
  });

  it("does not warn when there is no run to judge", () => {
    expect(requiresOcrWarning(ocrProvenanceOf(null))).toBe(false);
    expect(requiresOcrWarning(null)).toBe(false);
    expect(requiresOcrWarning(undefined)).toBe(false);
  });

  it("warns for the Tesseract provenance the backend writes today", () => {
    // CORE_FLOWS CF-03.4: every v1 run is experimental with a failed gate, so
    // the warning is always on. If this ever goes green the adapter changed.
    expect(requiresOcrWarning(ocrProvenanceOf(run()))).toBe(true);
  });
});
