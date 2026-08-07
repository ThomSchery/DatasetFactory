import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RunAction, RunStatus } from "../../api";
import { dashboardFixture, errorEnvelope, runFixture } from "../../test/fixtures";
import { renderApp, stubFetch } from "../../test/harness";

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
  ["pause", "Wstrzymaj", "running"],
  ["resume", "Wznów", "paused"],
  ["cancel", "Anuluj", "running"],
];

describe("expected_version travels with every run transition", () => {
  it.each(CONTROLS)("%s sends the version the screen was showing", async (_action, label, status) => {
    const user = userEvent.setup();
    const spy = stubFetch((url) => {
      if (url.includes("/api/v1/runs/")) {
        return { status: 202, body: runFixture({ status, version: 8 }) };
      }
      return { status: 200, body: dashboardFixture({ run: runFixture({ status, version: 7 }) }) };
    });

    renderApp(["/"]);
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
      stubFetch((url) => {
        if (url.includes("/api/v1/runs/")) {
          return { status: 409, body: errorEnvelope("version_conflict") };
        }
        return {
          status: 200,
          body: dashboardFixture({ run: runFixture({ status, version: 7 }) }),
        };
      });

      renderApp(["/"]);
      await user.click(await screen.findByRole("button", { name: label }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Dane zmieniły się w międzyczasie");
      expect(alert).toHaveTextContent("Odśwież widok");
      // The run panel is still there and still operable.
      expect(screen.getByRole("region", { name: "Aktywny run" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: label })).toBeEnabled();
    },
  );
});

describe("a second run", () => {
  it("reports 409 active_run as a message", async () => {
    const user = userEvent.setup();
    stubFetch((url) => {
      if (url.endsWith("/start")) {
        return { status: 409, body: errorEnvelope("active_run") };
      }
      return { status: 200, body: dashboardFixture({ run: runFixture({ status: "queued" }) }) };
    });

    renderApp(["/"]);
    await user.click(await screen.findByRole("button", { name: "Uruchom" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Inny run jest już aktywny.");
    expect(alert).toHaveTextContent("Zatrzymaj lub dokończ bieżący run");

    // A message, not a failure state: nothing navigated and nothing crashed.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Dashboard");
    expect(screen.getByRole("button", { name: "Uruchom" })).toBeEnabled();
  });

  it("offers no start control once the run is already running", async () => {
    stubFetch(() => ({
      status: 200,
      body: dashboardFixture({ run: runFixture({ status: "running" }) }),
    }));

    renderApp(["/"]);
    expect(await screen.findByRole("button", { name: "Wstrzymaj" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Uruchom" })).toBeNull();
  });
});

describe("a failed run", () => {
  it("stays on the dashboard with its stable error code", async () => {
    stubFetch(() => ({
      status: 200,
      body: dashboardFixture({
        run: runFixture({ status: "failed", error_code: "source_missing" }),
      }),
    }));

    renderApp(["/"]);

    expect(await screen.findByText("Nieudany")).toBeInTheDocument();
    expect(screen.getByText("source_missing")).toBeInTheDocument();
    expect(screen.getByText(/Plik źródłowy nie istnieje/)).toBeInTheDocument();
    // The backend still calls this run active, so resuming it is offered.
    expect(screen.getByRole("button", { name: "Wznów" })).toBeInTheDocument();
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

    renderApp(["/"]);
    await user.click(await screen.findByRole("button", { name: "Wstrzymaj" }));

    // FE-06: the control disables and shows a spinner. Every sibling disables
    // too, because all four would send the same `expected_version`.
    const busy = await screen.findByRole("button", { name: "Ładowanie…" });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Anuluj" })).toBeDisabled();

    releasePause();
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Ładowanie…" })).toBeNull();
    });
  });
});
