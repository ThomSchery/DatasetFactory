import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import * as endpoints from "./endpoints";
import { describeErrorCode, hasErrorCopy } from "./messages";

/*
 * Pins the client against the two documents it has to obey, so drift shows up
 * as a failing test rather than as a missing screen three tickets later.
 */

const techPlan = readFileSync("../docs/TECH_PLAN.md", "utf8");

/**
 * Every TECH_PLAN §5 endpoint the backend implements, and the exported function
 * that covers it. `GET /dashboard` joined the list in FE-001-F2: TK-008 added
 * `backend/app/api/dashboard.py`, which is what FE-001-F1 was waiting for.
 */
const IMPLEMENTED_ENDPOINTS: readonly [string, keyof typeof endpoints][] = [
  ["GET /health", "getHealth"],
  ["GET /dashboard", "getDashboard"],
  ["GET /assets/references/{asset_id}", "referenceAssetUrl"],
  ["POST /profiles/reference-preview", "createReferencePreview"],
  ["POST /profiles", "createProfile"],
  ["GET /profiles", "listProfiles"],
  ["GET /profiles/current", "getCurrentProfile"],
  ["POST /profiles/{profile_id}/activate", "activateProfile"],
  ["GET /profiles/{profile_id}", "getProfile"],
  ["POST /materials", "createMaterial"],
  ["GET /materials", "listMaterials"],
  ["POST /runs", "createRun"],
  ["GET /runs", "listRuns"],
  ["POST /runs/{id}/start", "startRun"],
  ["POST /runs/{id}/pause", "pauseRun"],
  ["POST /runs/{id}/resume", "resumeRun"],
  ["POST /runs/{id}/cancel", "cancelRun"],
  ["POST /runs/{id}/complete", "completeRun"],
  ["GET /runs/{id}", "getRun"],
  ["GET /runs/{id}/frames", "listRunFrames"],
  ["GET /frames/{id}/image", "frameImageUrl"],
  ["GET /frames/{id}", "getFrame"],
  ["POST /frames/{id}/annotations", "createAnnotation"],
  ["PATCH /annotations/{id}", "updateAnnotation"],
  ["DELETE /annotations/{id}", "deleteAnnotation"],
  ["POST /frames/{id}/review", "reviewFrame"],
  ["POST /exports", "createExport"],
  ["GET /exports/latest", "getLatestExport"],
  ["GET /exports/{id}", "getExport"],
];

describe("TECH_PLAN §5 coverage", () => {
  it.each(IMPLEMENTED_ENDPOINTS)("covers %s", (endpoint, exportName) => {
    expect(techPlan).toContain(`\`${endpoint}\``);
    expect(typeof endpoints[exportName]).toBe("function");
  });

  it("leaves no §5 endpoint without a client function", () => {
    const documented = [...techPlan.matchAll(/^\| `((?:GET|POST|PATCH|DELETE) [^`]+)`/gm)].map(
      (match) => match[1],
    );
    const covered = new Set(IMPLEMENTED_ENDPOINTS.map(([endpoint]) => endpoint));
    expect(documented.filter((endpoint) => !covered.has(endpoint))).toEqual([]);
  });
});

/**
 * FE-001-F1 §Logika.6 names the minimum set. `export_process_interrupted` comes
 * from the parent handoff; the first three export codes are `error_code` values
 * on `GET /exports/{id}`, never envelope codes.
 */
const REQUIRED_ERROR_CODES = [
  "version_conflict",
  "review_locked",
  "frame_not_reviewable",
  "bbox_invalid",
  "no_annotations",
  "active_run",
  "export_running",
  "no_accepted_frames",
  "ocr_provenance_unknown",
  "ocr_provenance_mismatch",
  "ocr_configuration_invalid",
  "export_revision_conflict",
  "export_source_missing",
  "export_process_interrupted",
];

describe("central error code dictionary", () => {
  it.each(REQUIRED_ERROR_CODES)("translates %s into a message and an action", (code) => {
    expect(hasErrorCopy(code)).toBe(true);
    const copy = describeErrorCode(code);
    expect(copy.message.length).toBeGreaterThan(0);
    expect(copy.action.length).toBeGreaterThan(0);
    expect(copy.message).not.toContain(code);
  });

  it("falls back rather than throwing on an unknown code", () => {
    const copy = describeErrorCode("something_new_from_the_backend");
    expect(copy.message).toBe("Operacja nie powiodła się.");
    expect(copy.action.length).toBeGreaterThan(0);
  });

  it("falls back on a null export error_code", () => {
    expect(describeErrorCode(null).message).toBe("Operacja nie powiodła się.");
  });

  it.each([
    "ocr_provenance_unknown",
    "ocr_provenance_mismatch",
    "ocr_configuration_invalid",
  ])("explains how to repair non-retryable OCR error %s", (code) => {
    const copy = describeErrorCode(code);
    expect(`${copy.message} ${copy.action}`).toContain("Tesseract");
    expect(copy.action).toContain("TD-015");
    expect(copy.action).not.toMatch(/spróbuj|ponow/i);
  });
});
