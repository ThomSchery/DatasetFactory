import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RUN_POLL_INTERVAL_MS } from "../../api";
import type { Export, PipelineRun } from "../../api";
import {
  dashboardFixture,
  emptyDashboard,
  errorEnvelope,
  exportFixture,
  runFixture,
} from "../../test/fixtures";
import { renderApp, stubFetch } from "../../test/harness";

const reviewRun = () =>
  runFixture({
    status: "review_ready",
    version: 4,
    review_revision: 7,
    completed_frames: 12,
    total_frames: 12,
  });

const isLatestLookup = (url: string) => url.includes("/api/v1/exports/latest?");

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("export query states", () => {
  it.each(["running", "completed"] as const)(
    "reloads a %s export from export_id before loading its owning run",
    async (status) => {
      const ownedRun = reviewRun();
      const recovered = exportFixture({
        id: "foreign-export",
        run_id: "foreign-run",
        status,
        manifest: status === "completed" ? exportFixture().manifest : null,
        output_relpath: status === "completed" ? "exports/foreign-export" : null,
      });
      const spy = stubFetch((url, init) => {
        if (url.endsWith("/api/v1/exports/foreign-export")) {
          return { status: 200, body: recovered };
        }
        if (url.endsWith("/api/v1/runs/foreign-run")) {
          return { status: 200, body: { ...ownedRun, id: "foreign-run" } };
        }
        return { status: 500, body: errorEnvelope("unexpected_request") };
      });

      renderApp(["/exports?export_id=foreign-export"]);

      // The first iteration also crosses the lazy route boundary. Give only the
      // transition to the first screen-owned state a local budget, then verify
      // the dependent export -> run loading sequence with the normal timeout.
      expect(
        await screen.findByText("Loading the export status…", {}, { timeout: 2_000 }),
      ).toBeInTheDocument();
      expect(await screen.findByText("Loading the export run…")).toBeInTheDocument();
      expect(await screen.findByRole("region", { name: "Current export" })).toHaveTextContent(
        "foreign-export",
      );
      if (status === "completed") {
        expect(screen.getByRole("region", { name: "COCO export result" })).toBeInTheDocument();
      } else {
        expect(screen.getByText("Preparing the export…")).toBeInTheDocument();
      }
      expect(spy.mock.calls.some(([url]) => String(url).endsWith("/api/v1/dashboard"))).toBe(false);
      expect(spy.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    },
  );

  it("recovers the latest export for the dashboard run and never starts a replacement", async () => {
    const recovered = exportFixture();
    const spy = stubFetch((url, init) => {
      if (url.endsWith("/api/v1/dashboard")) {
        return { status: 200, body: dashboardFixture({ run: reviewRun() }) };
      }
      if (isLatestLookup(url)) {
        return { status: 200, body: recovered };
      }
      if (url.endsWith("/api/v1/exports/export-1")) {
        return { status: 200, body: recovered };
      }
      if (url.endsWith("/api/v1/runs/run-1")) {
        return { status: 200, body: reviewRun() };
      }
      return { status: 500, body: errorEnvelope("unexpected_request") };
    });

    renderApp(["/exports"]);

    expect(await screen.findByRole("region", { name: "COCO export result" })).toBeInTheDocument();
    expect(spy.mock.calls.some(([url]) => String(url).endsWith("/api/v1/exports/export-1"))).toBe(
      true,
    );
    expect(spy.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("shows an invalid locator without falling back to dashboard or POST", async () => {
    const spy = stubFetch(() => ({ status: 500, body: errorEnvelope("unexpected_request") }));
    renderApp(["/exports?export_id="]);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid export id",
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it("keeps an unknown export_id as a read error instead of using the dashboard run", async () => {
    const spy = stubFetch((url) =>
      url.endsWith("/api/v1/exports/missing")
        ? { status: 404, body: errorEnvelope("export_not_found") }
        : { status: 500, body: errorEnvelope("unexpected_request") },
    );
    renderApp(["/exports?export_id=missing"]);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The export status could not be loaded",
    );
    expect(spy.mock.calls.some(([url]) => String(url).endsWith("/api/v1/dashboard"))).toBe(false);
    expect(spy.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("shows loading, empty and HTTP error states separately", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await pending;
        return new Response(JSON.stringify(emptyDashboard()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    renderApp(["/exports"]);
    expect(await screen.findByText("Loading the run to export…")).toBeInTheDocument();
    release();
    expect(await screen.findByText("No run to export")).toBeInTheDocument();

    vi.unstubAllGlobals();
    stubFetch(() => ({ status: 500, body: errorEnvelope("internal_error") }));
    renderApp(["/exports"]);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The export source could not be loaded",
    );
  });

  it.each(["no_accepted_frames", "export_running"])(
    "renders the stable HTTP code %s without creating a local export",
    async (code) => {
      const user = userEvent.setup();
      stubFetch((url, init) => {
        if (isLatestLookup(url)) {
          return { status: 200, body: null };
        }
        if (url.endsWith("/api/v1/exports") && init?.method === "POST") {
          return { status: code === "export_running" ? 409 : 400, body: errorEnvelope(code) };
        }
        return { status: 200, body: dashboardFixture({ run: reviewRun() }) };
      });
      renderApp(["/exports"]);

      await user.click(await screen.findByRole("button", { name: "Start export" }));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(`Code: ${code}.`);
      expect(screen.getByRole("button", { name: "Start export" })).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Current export" })).toBeNull();
    },
  );

  it("keeps the start mutation disabled and non-optimistic until POST settles", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      let status = 200;
      let body: unknown = dashboardFixture({ run: reviewRun() });
      if (isLatestLookup(url)) {
        body = null;
      } else if (url.endsWith("/api/v1/exports") && init?.method === "POST") {
        await pending;
        status = 202;
        body = exportFixture();
      } else if (url.endsWith("/api/v1/exports/export-1")) {
        body = exportFixture();
      } else if (url.endsWith("/api/v1/runs/run-1")) {
        body = reviewRun();
      }
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }));
    renderApp(["/exports"]);

    const start = await screen.findByRole("button", { name: "Start export" });
    await user.click(start);
    expect(start).toBeDisabled();
    expect(start).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("region", { name: "Current export" })).toBeNull();

    release();
    expect(await screen.findByRole("region", { name: "Current export" })).toBeInTheDocument();
  });

  it("offers retry when GET export status fails independently from POST", async () => {
    const user = userEvent.setup();
    stubFetch((url, init) => {
      if (isLatestLookup(url)) {
        return { status: 200, body: null };
      }
      if (url.endsWith("/api/v1/exports") && init?.method === "POST") {
        return {
          status: 202,
          body: exportFixture({ status: "running", manifest: null, output_relpath: null }),
        };
      }
      if (url.endsWith("/api/v1/exports/export-1")) {
        return { status: 500, body: errorEnvelope("internal_error") };
      }
      if (url.endsWith("/api/v1/runs/run-1")) {
        return { status: 200, body: reviewRun() };
      }
      return { status: 200, body: dashboardFixture({ run: reviewRun() }) };
    });
    renderApp(["/exports"]);
    await user.click(await screen.findByRole("button", { name: "Start export" }));

    const failure = await screen.findByRole("alert");
    expect(failure).toHaveTextContent("The export status could not be loaded");
    expect(within(failure).getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("sends Roboflow split settings and renders the split manifest", async () => {
    const user = userEvent.setup();
    let requestBody: unknown = null;
    const roboflow = exportFixture({
      manifest: {
        annotation_sources: { ocr: 12, manual: 3 },
        exported_at: "2026-08-24T12:00:00+00:00",
        format: "roboflow_coco",
        input_revision: 7,
        profile_id: "profile-1",
        run_id: "run-1",
        schema: "datasetfactory-roboflow-coco-export-v1",
        seed: 42,
        split_ratios: { train: 0.7, valid: 0.2, test: 0.1 },
        splits: {
          train: {
            annotation_count: 12,
            annotations: "train/_annotations.coco.json",
            frame_count: 7,
            images: "train",
          },
          valid: {
            annotation_count: 2,
            annotations: "valid/_annotations.coco.json",
            frame_count: 2,
            images: "valid",
          },
          test: {
            annotation_count: 1,
            annotations: "test/_annotations.coco.json",
            frame_count: 1,
            images: "test",
          },
        },
      },
    });
    stubFetch((url, init) => {
      if (isLatestLookup(url)) {
        return { status: 200, body: null };
      }
      if (url.endsWith("/api/v1/exports") && init?.method === "POST") {
        requestBody = JSON.parse(String(init.body));
        return { status: 202, body: roboflow };
      }
      if (url.endsWith("/api/v1/exports/export-1")) {
        return { status: 200, body: roboflow };
      }
      if (url.endsWith("/api/v1/runs/run-1")) {
        return { status: 200, body: reviewRun() };
      }
      return { status: 200, body: dashboardFixture({ run: reviewRun() }) };
    });

    renderApp(["/exports"]);
    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Export variant" }),
      "roboflow_coco",
    );
    const train = screen.getByRole("spinbutton", { name: "Train (%)" });
    const valid = screen.getByRole("spinbutton", { name: "Valid (%)" });
    const seed = screen.getByRole("spinbutton", { name: "Split seed" });
    await user.clear(train);
    await user.type(train, "70");
    await user.clear(valid);
    await user.type(valid, "20");
    await user.clear(seed);
    await user.type(seed, "42");
    await user.click(screen.getByRole("button", { name: "Start export" }));

    await waitFor(() => {
      expect(requestBody).toEqual({
        run_id: "run-1",
        format: "roboflow_coco",
        seed: 42,
        split: { train: 0.7, valid: 0.2, test: 0.1 },
      });
    });
    const result = await screen.findByRole("region", {
      name: "Roboflow COCO export result",
    });
    expect(within(result).getByText("Dataset split")).toBeInTheDocument();
    expect(result).toHaveTextContent("train/_annotations.coco.json");
    expect(result).toHaveTextContent("42");
  });

  it("rejects Roboflow percentages that do not add up to 100 before POST", async () => {
    const user = userEvent.setup();
    const spy = stubFetch((url) => {
      if (isLatestLookup(url)) {
        return { status: 200, body: null };
      }
      return { status: 200, body: dashboardFixture({ run: reviewRun() }) };
    });
    renderApp(["/exports"]);

    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Export variant" }),
      "roboflow_coco",
    );
    const train = screen.getByRole("spinbutton", { name: "Train (%)" });
    await user.clear(train);
    await user.type(train, "79");
    await user.click(screen.getByRole("button", { name: "Start export" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("add up to 100%");
    expect(
      spy.mock.calls.some(
        ([url, init]) => String(url).endsWith("/api/v1/exports") && init?.method === "POST",
      ),
    ).toBe(false);
  });
});

describe("export lifecycle", () => {
  async function tick(ms = 0): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
      await new Promise((resolve) => setImmediate(resolve));
      await vi.advanceTimersByTimeAsync(1);
      await new Promise((resolve) => setImmediate(resolve));
    });
  }

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
    });
  });

  it("polls a running export and stops permanently on completed", async () => {
    let current: Export = exportFixture({
      status: "running",
      manifest: null,
      output_relpath: null,
    });
    let exportGets = 0;
    const spy = stubFetch((url, init) => {
      if (isLatestLookup(url)) {
        return { status: 200, body: null };
      }
      if (url.endsWith("/api/v1/exports") && init?.method === "POST") {
        return { status: 202, body: current };
      }
      if (url.endsWith("/api/v1/exports/export-1")) {
        exportGets += 1;
        return { status: 200, body: current };
      }
      if (url.endsWith("/api/v1/runs/run-1")) {
        return { status: 200, body: reviewRun() };
      }
      return { status: 200, body: dashboardFixture({ run: reviewRun() }) };
    });

    renderApp(["/exports"]);
    await tick();
    fireEvent.click(screen.getByRole("button", { name: "Start export" }));
    await tick();
    expect(exportGets).toBe(1);
    await tick();
    expect(screen.getByText("Preparing the export…")).toBeInTheDocument();

    await tick(RUN_POLL_INTERVAL_MS);
    expect(exportGets).toBe(2);

    current = exportFixture();
    await tick(RUN_POLL_INTERVAL_MS);
    expect(exportGets).toBe(3);
    expect(screen.getByRole("region", { name: "COCO export result" })).toHaveTextContent(
      "A count of where boxes came from, not a measure of OCR accuracy.",
    );

    await tick(RUN_POLL_INTERVAL_MS * 10);
    expect(exportGets).toBe(3);
    expect(
      spy.mock.calls.filter(([url]) => String(url).endsWith("/api/v1/exports/export-1")),
    ).toHaveLength(3);
  });
});

describe("completed and failed exports", () => {
  it.each([
    "export_revision_conflict",
    "export_source_missing",
    "export_process_interrupted",
  ])("treats terminal export.error_code %s as a result, not as an HTTP failure", async (code) => {
    const user = userEvent.setup();
    const failed = exportFixture({
      status: "failed",
      error_code: code,
      manifest: null,
      output_relpath: null,
    });
    stubFetch((url, init) => {
      if (isLatestLookup(url)) {
        return { status: 200, body: null };
      }
      if (url.endsWith("/api/v1/exports") && init?.method === "POST") {
        return { status: 202, body: exportFixture({ status: "running", manifest: null, output_relpath: null }) };
      }
      if (url.endsWith("/api/v1/exports/export-1")) {
        return { status: 200, body: failed };
      }
      if (url.endsWith("/api/v1/runs/run-1")) {
        return { status: 200, body: reviewRun() };
      }
      return { status: 200, body: dashboardFixture({ run: reviewRun() }) };
    });
    renderApp(["/exports"]);
    await user.click(await screen.findByRole("button", { name: "Start export" }));

    expect(await screen.findByRole("button", { name: "Configure a new export" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent(`Code: ${code}.`);
  });

  it("shows source counts as provenance and never exposes an absolute output path", async () => {
    const user = userEvent.setup();
    const unsafe = exportFixture({ output_relpath: "D:\\secret\\workspace\\export-1" });
    stubFetch((url, init) => {
      if (isLatestLookup(url)) {
        return { status: 200, body: null };
      }
      if (url.endsWith("/api/v1/exports") && init?.method === "POST") {
        return { status: 202, body: unsafe };
      }
      if (url.endsWith("/api/v1/exports/export-1")) {
        return { status: 200, body: unsafe };
      }
      if (url.endsWith("/api/v1/runs/run-1")) {
        return { status: 200, body: reviewRun() };
      }
      return { status: 200, body: dashboardFixture({ run: reviewRun() }) };
    });
    renderApp(["/exports"]);
    await user.click(await screen.findByRole("button", { name: "Start export" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("no safe relative path");
    expect(document.body).not.toHaveTextContent("D:\\secret");
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

describe("explicit run completion", () => {
  it("sends current expected_version, stays non-optimistic and invalidates after success", async () => {
    const user = userEvent.setup();
    const currentRun = reviewRun();
    const completedRun = runFixture({ ...currentRun, status: "completed", version: 5 });
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let runResponse: PipelineRun = currentRun;

    const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      let status = 200;
      let body: unknown;
      if (isLatestLookup(url)) {
        body = null;
      } else if (url.endsWith("/api/v1/exports") && init?.method === "POST") {
        status = 202;
        body = exportFixture();
      } else if (url.endsWith("/api/v1/exports/export-1")) {
        body = exportFixture();
      } else if (url.endsWith("/api/v1/runs/run-1/complete")) {
        await pending;
        status = 202;
        runResponse = completedRun;
        body = completedRun;
      } else if (url.endsWith("/api/v1/runs/run-1")) {
        body = runResponse;
      } else {
        body = dashboardFixture({ run: runResponse });
      }
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", spy);

    renderApp(["/exports"]);
    await user.click(await screen.findByRole("button", { name: "Start export" }));
    const complete = await screen.findByRole("button", { name: "Close run" });
    await user.click(complete);

    expect(complete).toBeDisabled();
    expect(complete).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("region", { name: "Export source" })).toHaveTextContent(
      "Ready for review",
    );
    expect(screen.queryByText("The run is closed")).toBeNull();

    const completeCall = spy.mock.calls.find(([url]) => String(url).endsWith("/complete"));
    expect(JSON.parse(String(completeCall?.[1]?.body))).toEqual({ expected_version: 4 });

    release();
    expect(await screen.findByText("The run is closed")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Export source" })).toHaveTextContent(
        "Completed",
      );
    });
    expect(screen.queryByRole("button", { name: "Close run" })).toBeNull();
    expect(
      spy.mock.calls.some(([url]) => String(url).endsWith("/api/v1/dashboard")),
    ).toBe(true);
  });

  it("keeps completion keyboard reachable and names every landmark", async () => {
    const user = userEvent.setup();
    stubFetch((url, init) => {
      if (isLatestLookup(url)) {
        return { status: 200, body: null };
      }
      if (url.endsWith("/api/v1/exports") && init?.method === "POST") {
        return { status: 202, body: exportFixture() };
      }
      if (url.endsWith("/api/v1/exports/export-1")) {
        return { status: 200, body: exportFixture() };
      }
      if (url.endsWith("/api/v1/runs/run-1")) {
        return { status: 200, body: reviewRun() };
      }
      return { status: 200, body: dashboardFixture({ run: reviewRun() }) };
    });
    renderApp(["/exports"]);
    const start = await screen.findByRole("button", { name: "Start export" });
    start.focus();
    await user.keyboard("{Enter}");

    const complete = await screen.findByRole("button", { name: "Close run" });
    expect(complete).toBeVisible();
    expect(screen.getByRole("region", { name: "Current export" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "COCO export result" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Annotation sources" })).getByText("OCR"))
      .toBeInTheDocument();
  });
});
