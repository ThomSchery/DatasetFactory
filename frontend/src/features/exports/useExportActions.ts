import { useMutation, useQueryClient } from "@tanstack/react-query";

import { completeRun, createExport, invalidateFor } from "../../api";
import type { Export, PipelineRun } from "../../api";

export function useCreateExport(onCreated: (created: Export) => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (runId: string) => createExport({ run_id: runId }),
    onSuccess: async (created) => {
      onCreated(created);
      await invalidateFor(queryClient, { type: "export-started" });
    },
  });
}

export interface CompleteRunVariables {
  expectedVersion: number;
  runId: string;
}

export function useCompleteRun(onCompleted?: (run: PipelineRun) => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ expectedVersion, runId }: CompleteRunVariables) =>
      completeRun(runId, { expected_version: expectedVersion }),
    onSuccess: async (run) => {
      await invalidateFor(queryClient, { type: "run-transitioned", runId: run.id });
      onCompleted?.(run);
    },
  });
}
