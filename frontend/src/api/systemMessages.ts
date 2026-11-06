import type { DependencyStatus } from "./types";

const REASONS: Readonly<Record<string, string>> = {
  available: "Available.",
  unavailable: "The local dependency is unavailable.",
  verified: "Operator installation verified (SHA-256).",
  missing_installation: "No verified operator installation. OCR is disabled (TD-015).",
  checksum_mismatch: "The runtime or model SHA-256 checksum does not match. OCR is disabled (TD-015).",
  not_found: "The executable was not found.",
  timeout: "The dependency did not respond in time.",
  error: "The dependency returned an error.",
  unexpected_output: "The dependency returned unexpected output.",
};

/** Controlled application copy never depends on a persisted/localized sentence. */
export function describeDependency(status: DependencyStatus): string {
  const code = status.code ?? (Object.hasOwn(REASONS, status.detail) ? status.detail : undefined);
  if (code === undefined) return status.available ? "Available." : "The local dependency is unavailable.";
  const prefix = ["ffmpeg_", "ffprobe_", "runtime_"].find((value) => code.startsWith(value));
  const reason = prefix === undefined ? code : code.slice(prefix.length);
  const text = REASONS[reason] ?? (status.available ? "Available." : "The local dependency is unavailable.");
  return `${prefix === undefined ? "" : `${prefix.slice(0, -1)}: `}${text} Code: ${code}.`;
}
