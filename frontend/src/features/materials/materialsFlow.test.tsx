import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  dashboardFixture,
  emptyDashboard,
  errorEnvelope,
  framePageFixture,
  materialFixture,
  profileFixture,
  runFixture,
} from "../../test/fixtures";
import { renderApp, stubFetch } from "../../test/harness";
import type { Dashboard, Material, PipelineRun } from "../../api";

/*
 * FE-001-F2 §Done Criteria: import a material, create a run, start it, and see
 * the run screen take over.
 *
 * The stub answers with fixtures and records what was asked; it does not
 * reimplement a backend rule. Where a test needs a state change it makes it
 * explicit — the version bump on a transition is written by the test, not
 * inferred by a fake workflow engine.
 */

interface BackendState {
  dashboard: Dashboard;
  materials: Material[];
  run: PipelineRun | null;
  startResponse: { status: number; body: unknown } | null;
}

function stubBackend(state: BackendState) {
  return stubFetch((url, init) => {
    const method = init?.method ?? "GET";

    if (url.includes("/api/v1/materials") && method === "POST") {
      const created = materialFixture();
      state.materials = [created];
      return { status: 201, body: created };
    }
    if (url.includes("/api/v1/materials")) {
      return {
        status: 200,
        body: {
          items: state.materials,
          page: 1,
          page_size: 100,
          total: state.materials.length,
        },
      };
    }
    if (url.includes("/api/v1/profiles/current")) {
      return { status: 200, body: profileFixture() };
    }
    if (url.includes("/api/v1/profiles/profile-1")) {
      return { status: 200, body: profileFixture() };
    }
    if (url.includes("/api/v1/runs") && url.endsWith("/start")) {
      return state.startResponse ?? { status: 202, body: state.run };
    }
    if (url.includes("/api/v1/runs") && method === "POST") {
      const created = runFixture();
      state.run = created;
      state.dashboard = dashboardFixture({ run: created });
      return { status: 201, body: created };
    }
    if (url.includes("/api/v1/runs/run-1/frames")) {
      return { status: 200, body: framePageFixture({ items: [], total: 0 }) };
    }
    if (url.endsWith("/api/v1/runs/run-1")) {
      return { status: 200, body: state.run };
    }
    return { status: 200, body: state.dashboard };
  });
}

let state: BackendState;

beforeEach(() => {
  state = {
    dashboard: emptyDashboard(),
    materials: [],
    run: null,
    startResponse: null,
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("materials: from a file to a started run", () => {
  it("imports a material, creates a run and starts it", async () => {
    const user = userEvent.setup();
    const fetchSpy = stubBackend(state);
    renderApp(["/materials"]);

    // --- import ----------------------------------------------------------
    expect(await screen.findByText("Brak materiałów")).toBeInTheDocument();

    await user.type(
      screen.getByLabelText("Ścieżka pliku wideo"),
      "D:\\wideo\\mecz.mp4",
    );
    await user.click(screen.getByRole("button", { name: "Zaimportuj materiał" }));

    expect(await screen.findByText("mecz.mp4")).toBeInTheDocument();

    const importCall = fetchSpy.mock.calls.find(
      ([url, init]) => String(url).includes("/materials") && init?.method === "POST",
    );
    expect(importCall).toBeDefined();
    expect(JSON.parse(String(importCall?.[1]?.body))).toEqual({
      local_path: "D:\\wideo\\mecz.mp4",
    });

    // --- create the run --------------------------------------------------
    await user.selectOptions(await screen.findByLabelText("Materiał"), "video-1");
    await user.selectOptions(screen.getByLabelText("Profil gry"), "profile-1");
    await user.clear(screen.getByLabelText("Interwał próbkowania (ms)"));
    await user.type(screen.getByLabelText("Interwał próbkowania (ms)"), "500");
    await user.click(screen.getByRole("button", { name: "Utwórz run" }));

    await waitFor(() => {
      const createCall = fetchSpy.mock.calls.find(
        ([url, init]) => String(url).endsWith("/api/v1/runs") && init?.method === "POST",
      );
      expect(createCall).toBeDefined();
      expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
        profile_id: "profile-1",
        video_id: "video-1",
        interval_ms: 500,
      });
    });

    // --- start it --------------------------------------------------------
    const startButton = await screen.findByRole("button", { name: "Uruchom" });
    state.startResponse = {
      status: 202,
      body: runFixture({ status: "running", version: 2, current_stage: "sampling" }),
    };
    await user.click(startButton);

    // §Logika.2: starting the run is what puts `runId` in the URL.
    expect(await screen.findByRole("heading", { level: 1, name: "Anotacje" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Klatki runu" })).toHaveTextContent(
      "run-1",
    );

    const startCall = fetchSpy.mock.calls.find(([url]) => String(url).endsWith("/start"));
    expect(JSON.parse(String(startCall?.[1]?.body))).toEqual({ expected_version: 1 });
  });

  it("rejects a relative path before the request leaves the browser", async () => {
    const user = userEvent.setup();
    const fetchSpy = stubBackend(state);
    renderApp(["/materials"]);

    await user.type(await screen.findByLabelText("Ścieżka pliku wideo"), "wideo/mecz.mp4");
    await user.click(screen.getByRole("button", { name: "Zaimportuj materiał" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ścieżka musi być bezwzględna");
    expect(
      fetchSpy.mock.calls.some(
        ([url, init]) => String(url).includes("/materials") && init?.method === "POST",
      ),
    ).toBe(false);
  });

  it("shows the backend's own verdict without reinterpreting the code", async () => {
    const user = userEvent.setup();
    stubFetch((url, init) => {
      if (url.includes("/api/v1/materials") && init?.method === "POST") {
        // TECH_PLAN §5 lists only 400/404 here; the backend also answers 503.
        return { status: 503, body: errorEnvelope("ffprobe_unavailable") };
      }
      if (url.includes("/api/v1/materials")) {
        return { status: 200, body: { items: [], page: 1, page_size: 100, total: 0 } };
      }
      if (url.includes("/api/v1/profiles/current")) {
        return { status: 200, body: null };
      }
      return { status: 200, body: emptyDashboard() };
    });
    renderApp(["/materials"]);

    await user.type(await screen.findByLabelText("Ścieżka pliku wideo"), "D:\\wideo\\mecz.mp4");
    await user.click(screen.getByRole("button", { name: "Zaimportuj materiał" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("FFmpeg/ffprobe jest niedostępny");
    expect(alert).toHaveTextContent("Zainstaluj FFmpeg");
    expect(screen.getByText("ffprobe_unavailable")).toBeInTheDocument();
  });

  it("disables the submit control and shows a spinner while the import is in flight", async () => {
    const user = userEvent.setup();
    // Definite assignment: the executor runs synchronously, but TypeScript's
    // control flow analysis cannot see that through the callback.
    let resolveImport!: () => void;
    const pending = new Promise<void>((resolve) => {
      resolveImport = resolve;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/v1/materials") && init?.method === "POST") {
          await pending;
          return new Response(JSON.stringify(materialFixture()), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          });
        }
        const body = url.includes("/api/v1/materials")
          ? { items: [], page: 1, page_size: 100, total: 0 }
          : url.includes("/profiles/current")
            ? null
            : emptyDashboard();
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    renderApp(["/materials"]);
    await user.type(await screen.findByLabelText("Ścieżka pliku wideo"), "D:\\wideo\\mecz.mp4");
    await user.click(screen.getByRole("button", { name: "Zaimportuj materiał" }));

    const button = await screen.findByRole("button", { name: "Importowanie materiału…" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");

    resolveImport();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Zaimportuj materiał" })).toBeEnabled();
    });
  });
});
