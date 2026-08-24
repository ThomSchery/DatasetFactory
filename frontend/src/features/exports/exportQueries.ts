import { useQuery } from "@tanstack/react-query";

import { exportPollInterval, getExport, getRun, queryKeys } from "../../api";

export function useTrackedExport(exportId: string | null) {
  return useQuery({
    enabled: exportId !== null,
    queryKey: exportId === null ? queryKeys.exports() : queryKeys.export(exportId),
    queryFn: ({ signal }) => {
      if (exportId === null) {
        throw new Error("export_id is required when the export query is enabled");
      }
      return getExport(exportId, signal);
    },
    refetchInterval: (query) => exportPollInterval(query.state.data?.status),
  });
}

export function useTrackedRun(runId: string | null) {
  return useQuery({
    enabled: runId !== null,
    queryKey: runId === null ? queryKeys.runs() : queryKeys.run(runId),
    queryFn: ({ signal }) => {
      if (runId === null) {
        throw new Error("run_id is required when the run query is enabled");
      }
      return getRun(runId, signal);
    },
  });
}
