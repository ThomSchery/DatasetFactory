import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { getDashboard, queryKeys, runPollInterval } from "../../api";
import type { Dashboard, PipelineRun } from "../../api";

/*
 * One query feeds both FE-001-F2 screens. `GET /dashboard` already carries the
 * active run, the frame counts and the system status, so neither screen needs
 * to fan out to `GET /runs/{id}` and `GET /health` alongside it.
 */

/**
 * How often to refetch, given what is currently cached.
 *
 * Two different notions of "active" meet here and must not be confused:
 *
 *  - the backend calls a run active while it has any lifecycle move left, so
 *    only `completed` is terminal and a `failed` or `cancelled` run is still
 *    returned, with its `error_code` (TECH_PLAN §5, CF-07);
 *  - `TERMINAL_RUN_STATUSES` answers the narrower question this predicate
 *    needs — will the status change without the user doing anything.
 *
 * Polling follows the second. `review_ready`, `completed`, `failed` and
 * `cancelled` all stop it (FE-001-F2 §Logika.3). With no run at all there is
 * nothing to watch, so it does not start.
 */
export function dashboardPollInterval(run: PipelineRun | null | undefined): number | false {
  if (run === null || run === undefined) {
    return false;
  }
  return runPollInterval(run.status);
}

export function useDashboard(): UseQueryResult<Dashboard> {
  return useQuery({
    queryKey: queryKeys.dashboard(),
    queryFn: ({ signal }) => getDashboard(signal),
    refetchInterval: (query) => dashboardPollInterval(query.state.data?.run),
  });
}
