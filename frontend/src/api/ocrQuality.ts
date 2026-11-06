import type { FrameSummary, PipelineRun } from "./types";

/*
 * Whether the OCR behind a run's annotations may be presented as trustworthy.
 *
 * This lives in the API layer for the same reason the run status machine does:
 * a screen must not decide for itself what "good enough OCR" means. Two screens
 * render the warning in FE-001-F2 and more will in F4; one predicate keeps them
 * from drifting apart, and `docs/tickets/FE-001/log.md` records why it must not
 * quietly disappear.
 *
 * TECH_PLAN §4 makes Tesseract an `experimental` adapter that also writes
 * `quality_gate=failed` (CORE_FLOWS CF-03.4), so today every run satisfies the
 * condition and the warning is always visible. That is the intended state, not
 * a bug: it is the user's only signal that the proposals need checking.
 */

/** The single value of `quality_gate` that clears the gate (TECH_PLAN §4). */
const QUALITY_GATE_PASSED = "passed";

export interface OcrProvenanceView {
  experimental: boolean;
  quality_gate: string;
  /** Legacy localized text; presentation is derived from provenance below. */
  warning: string;
}

export function describeOcrWarning(provenance: OcrProvenanceView | null): string | null {
  if (provenance === null) return null;
  const parts: string[] = [];
  if (provenance.experimental) parts.push("This OCR engine is experimental.");
  if (provenance.quality_gate !== QUALITY_GATE_PASSED) parts.push("This OCR engine has not passed its quality gate.");
  if (parts.length === 0 && provenance.warning !== "") parts.push("This run carries an OCR warning. Review every proposal before accepting it.");
  return parts.length === 0 ? null : parts.join(" ");
}

/**
 * `true` when the OCR is experimental or its quality gate is anything other
 * than `passed`. `unknown` and `failed` both count as not passed.
 */
export function requiresOcrWarning(
  provenance: OcrProvenanceView | null | undefined,
): boolean {
  if (provenance === null || provenance === undefined) {
    return false;
  }
  return provenance.experimental || provenance.quality_gate !== QUALITY_GATE_PASSED;
}

/** Narrowing helper so callers can pass a run or a frame summary unchanged. */
export function ocrProvenanceOf(
  source: PipelineRun | FrameSummary | null | undefined,
): OcrProvenanceView | null {
  if (source === null || source === undefined) {
    return null;
  }
  return {
    experimental: source.experimental,
    quality_gate: source.quality_gate,
    warning: source.warning,
  };
}
