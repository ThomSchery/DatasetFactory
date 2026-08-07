import { useMutation, useQueryClient } from "@tanstack/react-query";

import { cancelRun, invalidateFor, pauseRun, resumeRun, startRun } from "../../api";
import type { PipelineRun, RunAction } from "../../api";

/*
 * The four run transitions as one mutation.
 *
 * Every one of them carries `expected_version` read from the run the user is
 * looking at, so a stale screen loses the race with `409 version_conflict`
 * rather than overwriting someone else's state. Nothing is written into the
 * cache by hand and nothing is applied before the response: the affected keys
 * are invalidated and refetched, so what the user sees is what the backend
 * confirmed (FE-06).
 */

const TRANSITIONS = {
  start: startRun,
  pause: pauseRun,
  resume: resumeRun,
  cancel: cancelRun,
} as const satisfies Record<
  RunAction,
  (runId: string, body: { expected_version: number }) => Promise<PipelineRun>
>;

export interface RunActionVariables {
  action: RunAction;
  /** The version the user's screen was showing when they clicked. */
  expectedVersion: number;
  runId: string;
}

export function useRunActions(onTransitioned?: (run: PipelineRun, action: RunAction) => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ action, expectedVersion, runId }: RunActionVariables) =>
      TRANSITIONS[action](runId, { expected_version: expectedVersion }),
    onSuccess: async (run, variables) => {
      await invalidateFor(queryClient, { type: "run-transitioned", runId: run.id });
      onTransitioned?.(run, variables.action);
    },
  });
}
