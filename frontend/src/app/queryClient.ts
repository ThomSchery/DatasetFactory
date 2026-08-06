import { QueryClient } from "@tanstack/react-query";

/**
 * One shared cache configuration.
 *
 * There is no `onMutate` anywhere in the application and there never should be
 * for dataset data (FE-06): every mutation changes durable state that the
 * backend must confirm first, so the UI waits for the response and then
 * refetches through `invalidateFor`. `src/test/architecture.test.ts` pins that.
 *
 * Mutations do not retry. Every write endpoint is guarded by
 * `expected_version`, so a blind replay would either be a no-op or race the
 * user's own next action.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // The API is loopback-local; a failed call is a real failure, not a
        // flaky network worth hiding behind retries.
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
