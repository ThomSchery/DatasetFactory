import { describe, expect, it } from "vitest";
import { describeDependency } from "./systemMessages";
import { describeOcrWarning } from "./ocrQuality";

describe("English system presentation", () => {
  it.each([
    ["verified", "Operator installation verified"],
    ["missing_installation", "No verified operator installation"],
    ["checksum_mismatch", "SHA-256 checksum does not match"],
    ["runtime_timeout", "runtime: The dependency did not respond in time"],
    ["ffmpeg_not_found", "ffmpeg: The executable was not found"],
    ["ffprobe_unavailable", "ffprobe: The local dependency is unavailable"],
  ])("presents %s without parsing localized detail", (code, text) => {
    const result = describeDependency({ code, detail: "Stan zdegradowany.", available: false, critical: false });
    expect(result).toContain(text);
    expect(result).toContain(`Code: ${code}`);
    expect(result).not.toContain("Stan zdegradowany");
  });
  it("handles older diagnostics without a reason code", () => {
    expect(describeDependency({ available: true, critical: false, detail: "Zweryfikowana instalacja operatora." })).toBe("Available.");
  });
  it.each([
    [true, "passed", "experimental"],
    [false, "failed", "has not passed its quality gate"],
    [false, "unknown", "has not passed its quality gate"],
    [false, "passed", "carries an OCR warning"],
  ])("retains warning meaning for experimental=%s gate=%s", (experimental, quality_gate, message) => {
    expect(describeOcrWarning({ experimental, quality_gate, warning: "Sprawdź propozycje." })).toContain(message);
  });
});
