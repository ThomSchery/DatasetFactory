import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RunAction, RunStatus } from "../../api";
import { dashboardFixture, errorEnvelope, runFixture } from "../../test/fixtures";
import { renderApp, stubFetch } from "../../test/harness";

/** Run Setup also lists source files and profiles; answer those as empty. */
function stubRunScreen(respond: Parameters<typeof stubFetch>[0]) {
  return stubFetch((url, init) => {
    if (url.includes("/materials")) {
      return { status: 200, body: { items: [], page: 1, page_size: 100, total: 0 } };
    }
    if (url.endsWith("/profiles")) {
      return { status: 200, body: [] };
    }
    return respond(url, init);
  });
}

/*
 * FE-001-F2 §Done Criteria: `409 active_run` on a second run, and an
 * `expected_version` conflict on pause, resume and cancel.
 *
 * Both are conflicts the backend detects; neither is an application failure,
 * so both render as a message on a screen that still works.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The status each control is offered from, per `availableRunActions`. */
const CONTROLS: readonly [RunAction, string, RunStatus][] = [
  ["pause", "Pause", "running"],
  ["resume", "Resume", "paused"],
  ["cancel", "Cancel", "running"],
];

describe("expected_version travels with every run transition", () => {
  it.each(CONTROLS)("%s sends the version the screen was showing", async (_action, label, status) => {
    const user = userEvent.setup();
    const spy = stubRunScreen((url) => {
      if (url.includes("/api/v1/runs/")) {
        return { status: 202, body: runFixture({ status, version: 8 }) };
      }
      return { status: 200, body: dashboardFixture({ run: runFixture({ status, version: 7 }) }) };
    });

    renderApp(["/run"]);
    await user.click(await screen.findByRole("button", { name: label }));

    await waitFor(() => {
      const call = spy.mock.calls.find(([url]) => String(url).includes("/api/v1/runs/"));
      expect(call).toBeDefined();
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ expected_version: 7 });
    });
  });

  it.each(CONTROLS)(
    "%s surfaces a version conflict as a message, not a broken screen",
    async (_action, label, status) => {
      const user = userEvent.setup();
      stubRunScreen((url) => {
        if (url.includes("/api/v1/runs/")) {
          return { status: 409, body: errorEnvelope("version_conflict") };
        }
        return {
          status: 200,
          body: dashboardFixture({ run: runFixture({ status, version: 7 }) }),
        };
      });

      renderApp(["/run"]);
      await user.click(await screen.findByRole("button", { name: label }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("The data changed in the meantime");
      expect(alert).toHaveTextContent("Refresh the view");
      // The run panel is still there and still operable.
      expect(screen.getByRole("region", { name: "Active run" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: label })).toBeEnabled();
    },
  );
});

describe("a second run", () => {
  it("reports 409 active_run as a message", async () => {
    const user = userEvent.setup();
    stubRunScreen((url) => {
      if (url.endsWith("/start")) {
        return { status: 409, body: errorEnvelope("active_run") };
      }
      return { status: 200, body: dashboardFixture({ run: runFixture({ status: "queued" }) }) };
    });

    renderApp(["/run"]);
    await user.click(await screen.findByRole("button", { name: "Start" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Another run is already active.");
    expect(alert).toHaveTextContent("Pause or finish the current run");

    // A message, not a failure state: nothing navigated and nothing crashed.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Run Setup");
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
  });

  it("offers no start control once the run is already running", async () => {
    stubRunScreen(() => ({
      status: 200,
      body: dashboardFixture({ run: runFixture({ status: "running" }) }),
    }));

    renderApp(["/run"]);
    expect(await screen.findByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
  });
});

describe("a failed run", () => {
  it("stays on Run Setup with its stable error code", async () => {
    stubRunScreen(() => ({
      status: 200,
      body: dashboardFixture({
        run: runFixture({ status: "failed", error_code: "source_missing" }),
      }),
    }));

    renderApp(["/run"]);

    expect(await screen.findByText("Failed")).toBeInTheDocument();
    expect(screen.getByText(/source_missing/)).toBeInTheDocument();
    expect(screen.getByText(/The source file no longer exists/)).toBeInTheDocument();
    // The backend still calls this run active, so resuming it is offered.
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
  });
});

describe("run controls while a transition is in flight", () => {
  it("disables every control and marks the clicked one busy", async () => {
    const user = userEvent.setup();
    // Definite assignment: the executor runs synchronously, but TypeScript's
    // control flow analysis cannot see that through the callback.
    let releasePause!: () => void;
    const pending = new Promise<void>((resolve) => {
      releasePause = resolve;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/materials")) {
          return new Response(JSON.stringify({ items: [], page: 1, page_size: 100, total: 0 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.endsWith("/profiles")) {
          return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
        }
        if (url.includes("/api/v1/runs/")) {
          await pending;
          return new Response(JSON.stringify(runFixture({ status: "paused", version: 8 })), {
            status: 202,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify(dashboardFixture({ run: runFixture({ status: "running" }) })),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    renderApp(["/run"]);
    await user.click(await screen.findByRole("button", { name: "Pause" }));

    // FE-06: the control disables and shows a spinner. Every sibling disables
    // too, because all four would send the same `expected_version`.
    const busy = await screen.findByRole("button", { name: "Loading…" });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    releasePause();
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Loading…" })).toBeNull();
    });
  });
});
