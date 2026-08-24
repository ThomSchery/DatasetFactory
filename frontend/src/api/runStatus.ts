import type { ExportStatus, RunStatus } from "./types";

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

/** The four run mutations FE-001-F2 exposes, one per TECH_PLAN §5 endpoint. */
export type RunAction = "start" | "pause" | "resume" | "cancel";

/**
 * Which controls to offer for a status. This is an affordance hint, not a
 * client-side state machine: the backend stays the only authority and still
 * answers `409 invalid_transition` if a request arrives at the wrong moment,
 * which the UI surfaces through the central dictionary. It lives here because
 * `src/test/architecture.test.ts` keeps status literals out of components, and
 * because a screen must not decide for itself what a status permits.
 *
 * Mirrors `RUN_TRANSITIONS` and the `allowed_from` sets in
 * `backend/app/managers/workflow/manager.py`: `start` only from `queued`,
 * `resume` from `paused`, `failed` and `cancelled`, `pause` from `running`,
 * and `cancel` from anything that can still reach `cancelled`.
 */
const RUN_ACTIONS: Readonly<Record<RunStatus, readonly RunAction[]>> = {
  queued: ["start", "cancel"],
  running: ["pause", "cancel"],
  paused: ["resume", "cancel"],
  // Only `completed` follows, and no §5 endpoint performs that transition.
  review_ready: [],
  completed: [],
  failed: ["resume", "cancel"],
  cancelled: ["resume"],
};

export function availableRunActions(status: RunStatus): readonly RunAction[] {
  return RUN_ACTIONS[status];
}

/** Export statuses written by the backend (`repositories/exports.py`). */
export const TERMINAL_EXPORT_STATUSES = ["completed", "failed"] as const satisfies readonly ExportStatus[];

export function isTerminalExportStatus(status: ExportStatus): boolean {
  return (TERMINAL_EXPORT_STATUSES as readonly ExportStatus[]).includes(status);
}

/** Same contract as `runPollInterval`, for the export status query. */
export function exportPollInterval(status: ExportStatus | undefined): number | false {
  if (status === undefined) {
    return RUN_POLL_INTERVAL_MS;
  }
  return isTerminalExportStatus(status) ? false : RUN_POLL_INTERVAL_MS;
}

export function isCompletedExportStatus(status: ExportStatus): boolean {
  return status === "completed";
}

export function isFailedExportStatus(status: ExportStatus): boolean {
  return status === "failed";
}

export function isRunningExportStatus(status: ExportStatus): boolean {
  return status === "running";
}

export function isCompletedRunStatus(status: RunStatus): boolean {
  return status === "completed";
}

/** UI affordance only; the backend still owns and atomically validates the transition. */
export function canCompleteExportedRun(runStatus: RunStatus, exportStatus: ExportStatus): boolean {
  return runStatus === "review_ready" && isCompletedExportStatus(exportStatus);
}
