import type { QueryClient } from "@tanstack/react-query";

import type { ListFramesQuery, ListMaterialsQuery } from "./types";

/*
 * Every query key and every post-mutation invalidation in one module (FE-001-F1
 * §Logika.3). A feature that adds a query adds its key here rather than
 * spelling an array literal at the call site, so invalidation stays derivable
 * from one file.
 *
 * There are no optimistic updates for dataset data (FE-06): a mutation settles,
 * the affected keys are invalidated, and the refetched backend state is what
 * the user sees.
 */

export const queryKeys = {
  health: () => ["health"] as const,
  dashboard: () => ["dashboard"] as const,

  profiles: () => ["profiles"] as const,
  currentProfile: () => ["profiles", "current"] as const,
  profile: (profileId: string) => ["profiles", "detail", profileId] as const,

  materials: () => ["materials"] as const,
  materialList: (query: ListMaterialsQuery = {}) => ["materials", "list", query] as const,

  runs: () => ["runs"] as const,
  run: (runId: string) => ["runs", runId] as const,
  runFrames: (runId: string, query: ListFramesQuery = {}) =>
    ["runs", runId, "frames", query] as const,

  frames: () => ["frames"] as const,
  frame: (frameId: string) => ["frames", frameId] as const,

  exports: () => ["exports"] as const,
  export: (exportId: string) => ["exports", exportId] as const,
} as const;

/**
 * What changed on the backend. Named after the mutation, not after the keys —
 * the mapping from event to keys is this module's job.
 */
export type MutationEvent =
  | { type: "profile-created" }
  | { type: "material-imported" }
  | { type: "run-created" }
  | { type: "run-transitioned"; runId: string }
  | { type: "annotation-changed"; frameId: string; runId?: string }
  | { type: "frame-reviewed"; frameId: string; runId?: string }
  | { type: "export-started" }
  | { type: "export-finished"; exportId: string };

function keysFor(event: MutationEvent): readonly (readonly unknown[])[] {
  switch (event.type) {
    case "profile-created":
      return [queryKeys.profiles()];
    case "material-imported":
      return [queryKeys.materials()];
    case "run-created":
      // The new run becomes the dashboard's active run straight away.
      return [queryKeys.runs(), queryKeys.dashboard()];
    case "run-transitioned":
      // A transition moves the run's own version and can change its frames.
      return [queryKeys.run(event.runId), queryKeys.dashboard()];
    case "annotation-changed":
      // Annotating bumps the frame aggregate and the run's `review_revision`,
      // which the frame list reads back through its summaries.
      return event.runId === undefined
        ? [queryKeys.frame(event.frameId)]
        : [queryKeys.frame(event.frameId), queryKeys.run(event.runId)];
    case "frame-reviewed":
      // A review decision moves the frame between the three `frame_counts`
      // buckets the dashboard groups by `review_status`.
      return event.runId === undefined
        ? [queryKeys.frame(event.frameId), queryKeys.dashboard()]
        : [queryKeys.frame(event.frameId), queryKeys.run(event.runId), queryKeys.dashboard()];
    case "export-started":
      return [queryKeys.exports()];
    case "export-finished":
      // A finished export freezes; the run itself is untouched by it.
      return [queryKeys.exports(), queryKeys.export(event.exportId)];
  }
}

/** Query keys an event invalidates. Exported so tests can assert the mapping. */
export function invalidationKeys(event: MutationEvent): readonly (readonly unknown[])[] {
  return keysFor(event);
}

/** Invalidates everything an event touches. Returns once refetches are queued. */
export async function invalidateFor(
  queryClient: QueryClient,
  event: MutationEvent,
): Promise<void> {
  await Promise.all(
    keysFor(event).map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}
