import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  dashboardFixture,
  emptyDashboard,
  errorEnvelope,
  framePageFixture,
  materialFixture,
  profileFixture,
  profileSummaryFixture,
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
  /** What the native file dialog answers; `null` is a cancelled dialog. */
  pickedPath: string | null;
}

function stubBackend(state: BackendState) {
  return stubFetch((url, init) => {
    const method = init?.method ?? "GET";

    if (url.includes("/api/v1/local-files/pick")) {
      return { status: 200, body: { path: state.pickedPath } };
    }
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
    if (url.endsWith("/api/v1/profiles")) {
      return { status: 200, body: [profileSummaryFixture()] };
    }
    if (url.includes("/api/v1/runs") && url.endsWith("/start")) {
      return state.startResponse ?? { status: 202, body: state.run };
    }
    if (url.endsWith("/runs/run-1/cancel")) {
      state.run = runFixture({ status: "cancelled", version: 2 });
      return { status: 200, body: state.run };
    }
    if (url.includes("/api/v1/runs") && method === "POST") {
      const created = runFixture();
      state.run = created;
      // The backend prioritizes the workflow slot owner over a new queued run.
      if (state.dashboard.run === null) state.dashboard = dashboardFixture({ run: created });
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
    pickedPath: null,
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Opens a combobox by its filter field and picks the option. */
async function choose(
  user: ReturnType<typeof userEvent.setup>,
  field: string,
  option: RegExp,
) {
  await user.click(await screen.findByRole("combobox", { name: field }));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("Upload: the Figma tile", () => {
  it("opens the system dialog from the tile and imports the chosen file in place", async () => {
    const user = userEvent.setup();
    state.pickedPath = "D:\\wideo\\mecz.mp4";
    const fetchSpy = stubBackend(state);
    renderApp(["/materials"]);

    await user.click(screen.getByRole("button", { name: "Upload Video" }));

    expect(await screen.findByText(/mecz\.mp4 · 1920×1080/)).toBeInTheDocument();
    const pickCall = fetchSpy.mock.calls.find(([url]) => String(url).includes("/local-files/pick"));
    expect(JSON.parse(String(pickCall?.[1]?.body))).toEqual({ kind: "video" });
    const importCall = fetchSpy.mock.calls.find(
      ([url, init]) => String(url).includes("/materials") && init?.method === "POST",
    );
    expect(JSON.parse(String(importCall?.[1]?.body))).toEqual({
      local_path: "D:\\wideo\\mecz.mp4",
    });
  });

  it("opens the dialog from the keyboard too", async () => {
    const user = userEvent.setup();
    state.pickedPath = "D:\\wideo\\mecz.mp4";
    const fetchSpy = stubBackend(state);
    renderApp(["/materials"]);

    screen.getByRole("button", { name: "Upload Video" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.some(([url]) => String(url).includes("/local-files/pick")),
      ).toBe(true);
    });
  });

  it("treats a cancelled dialog as no choice: no import, no message", async () => {
    const user = userEvent.setup();
    state.pickedPath = null;
    const fetchSpy = stubBackend(state);
    renderApp(["/materials"]);

    await user.click(screen.getByRole("button", { name: "Upload Video" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Upload Video/ })).toBeEnabled();
    });
    expect(
      fetchSpy.mock.calls.some(
        ([url, init]) => String(url).includes("/materials") && init?.method === "POST",
      ),
    ).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("points at Enter path when no dialog can open", async () => {
    const user = userEvent.setup();
    stubFetch((url) => {
      if (url.includes("/local-files/pick")) {
        return { status: 503, body: errorEnvelope("file_picker_unavailable") };
      }
      return { status: 200, body: emptyDashboard() };
    });
    renderApp(["/materials"]);

    await user.click(screen.getByRole("button", { name: "Upload Video" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Use Enter path");
  });

  it("answers a dropped file with where to click", async () => {
    stubBackend(state);
    renderApp(["/materials"]);

    const tile = screen.getByRole("button", { name: "Upload Video" }).parentElement as HTMLElement;
    fireEvent.drop(tile, { dataTransfer: { files: [] } });
    expect(await screen.findByRole("status")).toHaveTextContent("Click to choose a file");
  });

  it("rejects a relative path before the request leaves the browser", async () => {
    const user = userEvent.setup();
    const fetchSpy = stubBackend(state);
    renderApp(["/materials"]);

    await user.click(screen.getByRole("button", { name: "Enter path" }));
    await user.type(await screen.findByLabelText("Video file path"), "wideo/mecz.mp4");
    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The path must be absolute");
    expect(
      fetchSpy.mock.calls.some(
        ([url, init]) => String(url).includes("/materials") && init?.method === "POST",
      ),
    ).toBe(false);
  });

  it("shows the backend's own verdict without reinterpreting the code", async () => {
    const user = userEvent.setup();
    stubFetch((url, init) => {
      if (url.includes("/materials") && init?.method === "POST") {
        return {
          status: 503,
          body: errorEnvelope("ffprobe_unavailable"),
        };
      }
      return { status: 200, body: emptyDashboard() };
    });
    renderApp(["/materials"]);

    await user.click(screen.getByRole("button", { name: "Enter path" }));
    await user.type(await screen.findByLabelText("Video file path"), "D:\\wideo\\mecz.mp4");
    await user.click(screen.getByRole("button", { name: "Open" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("FFmpeg/ffprobe is unavailable");
    expect(alert).toHaveTextContent("ffprobe_unavailable");
  });

  it("marks the tile busy while the import is in flight", async () => {
    const user = userEvent.setup();
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
        return new Response(JSON.stringify(emptyDashboard()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    renderApp(["/materials"]);
    await user.click(screen.getByRole("button", { name: "Enter path" }));
    await user.type(await screen.findByLabelText("Video file path"), "D:\\wideo\\mecz.mp4");
    await user.click(screen.getByRole("button", { name: "Open" }));

    const button = await screen.findByRole("button", { name: "Importing the video…" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");

    resolveImport();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Upload Video/ })).toBeEnabled();
    });
  });
});

describe("Run Setup: from a file to a started run", () => {
  it("explains a profile conflict while creating a run", async () => {
    const user = userEvent.setup();
    state.materials = [materialFixture()];
    stubFetch((url, init) => {
      if (url.endsWith("/api/v1/runs") && init?.method === "POST") {
        return { status: 409, body: errorEnvelope("profile_changed_during_run_creation") };
      }
      if (url.includes("/materials")) {
        return { status: 200, body: { items: state.materials, page: 1, page_size: 100, total: 1 } };
      }
      if (url.endsWith("/profiles")) return { status: 200, body: [profileSummaryFixture()] };
      if (url.includes("/profiles/profile-1")) return { status: 200, body: profileFixture() };
      return { status: 200, body: emptyDashboard() };
    });
    renderApp(["/run"]);

    await choose(user, "Source file", /mecz\.mp4/);
    await choose(user, "Profile", /Gra testowa/);
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The profile changed while the run was being created",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Try again");
  });

  it("offers saved profiles in a combobox and previews the chosen profile", async () => {
    const user = userEvent.setup();
    stubFetch((url) => {
      if (url.endsWith("/profiles")) {
        return {
          status: 200,
          body: [profileSummaryFixture(), profileSummaryFixture({ id: "profile-2", name: "Druga gra" })],
        };
      }
      if (url.endsWith("/profiles/profile-2")) {
        return {
          status: 200,
          body: profileFixture({
            id: "profile-2",
            name: "Druga gra",
            reference_asset_url: "/api/v1/assets/references/asset-2",
          }),
        };
      }
      if (url.includes("/profiles/")) return { status: 200, body: profileFixture() };
      if (url.includes("/materials")) {
        return { status: 200, body: { items: [materialFixture()], page: 1, page_size: 100, total: 1 } };
      }
      return { status: 200, body: emptyDashboard() };
    });
    renderApp(["/run"]);

    expect(document.querySelector("select")).toBeNull();
    await choose(user, "Profile", /Druga gra/);
    expect(screen.getByRole("combobox", { name: "Profile" })).toHaveValue("Druga gra");
    expect(
      await screen.findByAltText("Reference screenshot of profile Druga gra"),
    ).toHaveAttribute("src", "/api/v1/assets/references/asset-2");
  });

  it("takes the profile from the address when Profile sends the operator here", async () => {
    stubBackend(state);
    renderApp(["/run?profile=profile-1"]);
    const field = await screen.findByRole("combobox", { name: "Profile" });
    await waitFor(() => {
      expect(field).toHaveValue("Gra testowa");
    });
  });

  it("creates the run, starts it and opens its review", async () => {
    const user = userEvent.setup();
    state.materials = [materialFixture()];
    const fetchSpy = stubBackend(state);
    renderApp(["/run"]);

    await choose(user, "Source file", /mecz\.mp4/);
    await choose(user, "Profile", /Gra testowa/);
    await user.clear(screen.getByLabelText("Sample rate"));
    await user.type(screen.getByLabelText("Sample rate"), "500");
    state.startResponse = {
      status: 202,
      body: runFixture({ status: "running", version: 2, current_stage: "sampling" }),
    };
    await user.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() => {
      const createCall = fetchSpy.mock.calls.find(
        ([url, init]) => String(url).endsWith("/api/v1/runs") && init?.method === "POST",
      );
      expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
        profile_id: "profile-1",
        video_id: "video-1",
        interval_ms: 500,
      });
    });

    // §Logika.2: starting the run is what puts `runId` in the URL.
    expect(
      await screen.findByRole("group", { name: "Frame status filter" }),
    ).toBeInTheDocument();
    const startCall = fetchSpy.mock.calls.find(([url]) => String(url).endsWith("/start"));
    expect(JSON.parse(String(startCall?.[1]?.body))).toEqual({ expected_version: 1 });
  });

  it.each(["Start", "Cancel"])("retains the created run after 409 and binds %s to its own id/version", async (action) => {
    const user = userEvent.setup();
    state.materials = [materialFixture()];
    state.startResponse = { status: 409, body: errorEnvelope("active_run") };
    state.dashboard = dashboardFixture({ run: runFixture({ id: "slot-owner", status: "running", version: 3 }) });
    const fetchSpy = stubBackend(state);
    renderApp(["/run"]);

    await choose(user, "Source file", /mecz\.mp4/);
    expect(screen.getByRole("combobox", { name: "Source file" })).toHaveValue("mecz.mp4");
    await choose(user, "Profile", /Gra testowa/);
    await user.click(screen.getByRole("button", { name: "Run" }));

    expect(await screen.findByText(/Another run is already active/)).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Active run" })).toBeInTheDocument();
    const created = screen.getByRole("region", { name: "Created run" });
    expect(created).toHaveTextContent("run-1");
    expect(within(screen.getByRole("region", { name: "Active run" })).getByRole("button", { name: "Pause" })).toBeInTheDocument();
    await user.click(within(created).getByRole("button", { name: action }));
    const call = fetchSpy.mock.calls.filter(([url]) => String(url).endsWith(`/runs/run-1/${action.toLowerCase()}`)).at(-1);
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ expected_version: 1 });
    expect(fetchSpy.mock.calls.some(([url, init]) => String(url).includes("/runs/slot-owner/") && init?.method === "POST")).toBe(false);
    if (action === "Cancel") {
      await waitFor(() => expect(created).toHaveTextContent("Cancelled"));
      expect(within(created).queryByRole("button", { name: "Cancel" })).toBeNull();
    }
  });

  it("asks for a source file before creating anything", async () => {
    const user = userEvent.setup();
    const fetchSpy = stubBackend(state);
    renderApp(["/run"]);

    await screen.findByLabelText("Source file");
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(await screen.findByText("Choose a source file.")).toBeInTheDocument();
    expect(
      fetchSpy.mock.calls.some(
        ([url, init]) => String(url).endsWith("/api/v1/runs") && init?.method === "POST",
      ),
    ).toBe(false);
  });
});
