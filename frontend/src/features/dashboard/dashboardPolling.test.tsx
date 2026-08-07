import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RUN_POLL_INTERVAL_MS, TERMINAL_RUN_STATUSES } from "../../api";
import type { RunStatus } from "../../api";
import { dashboardFixture, emptyDashboard, runFixture } from "../../test/fixtures";
import { renderApp, stubFetch } from "../../test/harness";
import { dashboardPollInterval } from "./dashboardQuery";

/*
 * FE-001-F2 §Logika.3 and §Done Criteria: poll every 2 s while the run can
 * still change on its own, and go quiet the moment it cannot.
 */

function dashboardCalls(spy: ReturnType<typeof stubFetch>): number {
  return spy.mock.calls.filter(([url]) => String(url).includes("/api/v1/dashboard")).length;
}

describe("dashboardPollInterval", () => {
  it.each(["queued", "running", "paused"] as RunStatus[])(
    "polls every 2 s while the run is %s",
    (status) => {
      expect(dashboardPollInterval(runFixture({ status }))).toBe(RUN_POLL_INTERVAL_MS);
    },
  );

  it.each(TERMINAL_RUN_STATUSES)("goes quiet once the run is %s", (status) => {
    expect(dashboardPollInterval(runFixture({ status }))).toBe(false);
  });

  it("never starts when there is no run to watch", () => {
    expect(dashboardPollInterval(null)).toBe(false);
    expect(dashboardPollInterval(undefined)).toBe(false);
  });

  it("keeps polling a failed run's dashboard entry off the frontend's terminal set", () => {
    // The backend still calls `failed` active — only `completed` is terminal in
    // RUN_TRANSITIONS — so the run stays on screen with its `error_code`. The
    // polling predicate answers the narrower question and stops anyway.
    const failed = runFixture({ status: "failed", error_code: "source_missing" });
    expect(dashboardPollInterval(failed)).toBe(false);
  });
});

describe("the dashboard's polling in the running application", () => {
  /**
   * Advances the fake clock and lets everything it woke up settle. Testing
   * Library's own `waitFor` cannot be used here: it drives fake timers itself
   * and deadlocks against the ones this test controls.
   */
  async function tick(ms = 0): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
      // Real `setImmediate`, so the response body finishes being read before
      // the assertion — see the `toFake` list below.
      await new Promise((resolve) => setImmediate(resolve));
      // TanStack Query notifies subscribers through a zero-delay timer, and a
      // fake clock only runs those once it actually moves. Nudging it forward
      // is what turns a settled cache into a re-rendered screen.
      await vi.advanceTimersByTimeAsync(1);
      await new Promise((resolve) => setImmediate(resolve));
    });
  }

  beforeEach(() => {
    // Only the scheduling primitives `refetchInterval` uses are faked. Faking
    // the microtask queue as well would stall reading the stubbed response
    // body, and the test would be measuring its own deadlock.
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("polls a nonterminal run, then stops when it turns terminal", async () => {
    let current = dashboardFixture({ run: runFixture({ status: "running" }) });
    const spy = stubFetch(() => ({ status: 200, body: current }));

    renderApp(["/"]);
    await tick();
    expect(dashboardCalls(spy)).toBe(1);
    expect(screen.getByText("W toku")).toBeInTheDocument();

    await tick(RUN_POLL_INTERVAL_MS);
    expect(dashboardCalls(spy)).toBe(2);

    await tick(RUN_POLL_INTERVAL_MS);
    expect(dashboardCalls(spy)).toBe(3);

    // The worker finishes the run; the next poll brings back a terminal status.
    current = dashboardFixture({ run: runFixture({ status: "review_ready" }) });
    await tick(RUN_POLL_INTERVAL_MS);
    expect(dashboardCalls(spy)).toBe(4);
    expect(screen.getByText("Gotowy do weryfikacji")).toBeInTheDocument();

    // And then it goes quiet: ten more intervals produce no further request.
    await tick(RUN_POLL_INTERVAL_MS * 10);
    expect(dashboardCalls(spy)).toBe(4);
  });

  it("does not poll at all when there is no run", async () => {
    const spy = stubFetch(() => ({ status: 200, body: emptyDashboard() }));

    renderApp(["/"]);
    await tick();
    expect(dashboardCalls(spy)).toBe(1);
    expect(screen.getByText("Brak aktywnego runu")).toBeInTheDocument();

    await tick(RUN_POLL_INTERVAL_MS * 10);
    expect(dashboardCalls(spy)).toBe(1);
  });
});
