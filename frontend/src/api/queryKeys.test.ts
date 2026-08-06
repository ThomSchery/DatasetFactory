import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { invalidateFor, invalidationKeys, queryKeys } from "./queryKeys";
import {
  RUN_POLL_INTERVAL_MS,
  exportPollInterval,
  isTerminalRunStatus,
  runPollInterval,
} from "./runStatus";
import type { RunStatus } from "./types";

describe("query keys", () => {
  it("nests a run's frames under the run so one call invalidates both", () => {
    expect(queryKeys.runFrames("run-1", { page: 2 })).toEqual([
      "runs",
      "run-1",
      "frames",
      { page: 2 },
    ]);
    expect(queryKeys.run("run-1")).toEqual(["runs", "run-1"]);
  });

  it("keeps list filters inside the key so two filters do not share a cache slot", () => {
    expect(queryKeys.materialList({ page: 1 })).not.toEqual(queryKeys.materialList({ page: 2 }));
  });
});

describe("invalidation mapping", () => {
  it("invalidates the frame and its run after a review decision", () => {
    expect(invalidationKeys({ type: "frame-reviewed", frameId: "f1", runId: "r1" })).toEqual([
      ["frames", "f1"],
      ["runs", "r1"],
    ]);
  });

  it("invalidates only the frame when the run is unknown", () => {
    expect(invalidationKeys({ type: "annotation-changed", frameId: "f1" })).toEqual([
      ["frames", "f1"],
    ]);
  });

  it("drives the query client", async () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();

    await invalidateFor(queryClient, { type: "export-finished", exportId: "e1" });

    expect(spy).toHaveBeenCalledWith({ queryKey: ["exports"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["exports", "e1"] });
  });
});

describe("run status machine", () => {
  const nonTerminal: RunStatus[] = ["queued", "running", "paused"];
  const terminal: RunStatus[] = ["review_ready", "completed", "failed", "cancelled"];

  it.each(nonTerminal)("keeps polling while a run is %s", (status) => {
    expect(isTerminalRunStatus(status)).toBe(false);
    expect(runPollInterval(status)).toBe(RUN_POLL_INTERVAL_MS);
  });

  it.each(terminal)("stops polling once a run is %s", (status) => {
    expect(isTerminalRunStatus(status)).toBe(true);
    expect(runPollInterval(status)).toBe(false);
  });

  it("polls while the status is still unknown", () => {
    expect(runPollInterval(undefined)).toBe(RUN_POLL_INTERVAL_MS);
  });

  it("stops polling a finished export", () => {
    expect(exportPollInterval("running")).toBe(RUN_POLL_INTERVAL_MS);
    expect(exportPollInterval("completed")).toBe(false);
    expect(exportPollInterval("failed")).toBe(false);
  });
});
