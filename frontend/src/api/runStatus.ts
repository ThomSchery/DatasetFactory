import type { RunStatus } from "./types";

/*
 * The pipeline status machine lives here, once. No React component may hold a
 * run status in local state or decide for itself when a run is finished —
 * `src/test/architecture.test.ts` pins that, and FE-03 makes the backend the
 * only source of durable state.
 */

/** A run in one of these statuses will not change again without user action. */
export const TERMINAL_RUN_STATUSES = [
  "review_ready",
  "completed",
  "failed",
  "cancelled",
] as const satisfies readonly RunStatus[];

export type TerminalRunStatus = (typeof TERMINAL_RUN_STATUSES)[number];

const TERMINAL = new Set<string>(TERMINAL_RUN_STATUSES);

export function isTerminalRunStatus(status: RunStatus): status is TerminalRunStatus {
  return TERMINAL.has(status);
}

/** FE-03: poll the active run every 2 s. */
export const RUN_POLL_INTERVAL_MS = 2000;

/**
 * Poll interval for a run query, or `false` once the run is terminal.
 * Shaped for TanStack Query's `refetchInterval`.
 */
export function runPollInterval(status: RunStatus | undefined): number | false {
  if (status === undefined) {
    return RUN_POLL_INTERVAL_MS;
  }
  return isTerminalRunStatus(status) ? false : RUN_POLL_INTERVAL_MS;
}

/** Export statuses written by the backend (`repositories/exports.py`). */
export const TERMINAL_EXPORT_STATUSES = ["completed", "failed"] as const;

export function isTerminalExportStatus(status: string): boolean {
  return (TERMINAL_EXPORT_STATUSES as readonly string[]).includes(status);
}

/** Same contract as `runPollInterval`, for the export status query. */
export function exportPollInterval(status: string | undefined): number | false {
  if (status === undefined) {
    return RUN_POLL_INTERVAL_MS;
  }
  return isTerminalExportStatus(status) ? false : RUN_POLL_INTERVAL_MS;
}
