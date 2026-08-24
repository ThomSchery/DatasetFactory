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

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("export query states", () => {
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
    expect(await screen.findByText("Ładowanie runu do eksportu…")).toBeInTheDocument();
    release();
    expect(await screen.findByText("Brak runu do eksportu")).toBeInTheDocument();

    vi.unstubAllGlobals();
    stubFetch(() => ({ status: 500, body: errorEnvelope("internal_error") }));
    renderApp(["/exports"]);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Nie udało się wczytać źródła eksportu",
    );
  });

  it.each(["no_accepted_frames", "export_running"])(
    "renders the stable HTTP code %s without creating a local export",
    async (code) => {
      const user = userEvent.setup();
      stubFetch((url, init) => {
        if (url.endsWith("/api/v1/exports") && init?.method === "POST") {
          return { status: code === "export_running" ? 409 : 400, body: errorEnvelope(code) };
        }
        return { status: 200, body: dashboardFixture({ run: reviewRun() }) };
      });
      renderApp(["/exports"]);

      await user.click(await screen.findByRole("button", { name: "Uruchom eksport COCO" }));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(`Kod: ${code}.`);
      expect(screen.getByRole("button", { name: "Uruchom eksport COCO" })).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Bieżący eksport" })).toBeNull();
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
      if (url.endsWith("/api/v1/exports") && init?.method === "POST") {
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

    const start = await screen.findByRole("button", { name: "Uruchom eksport COCO" });
    await user.click(start);
    expect(start).toBeDisabled();
    expect(start).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("region", { name: "Bieżący eksport" })).toBeNull();

    release();
    expect(await screen.findByRole("region", { name: "Bieżący eksport" })).toBeInTheDocument();
  });

  it("offers retry when GET export status fails independently from POST", async () => {
    const user = userEvent.setup();
    stubFetch((url, init) => {
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
    await user.click(await screen.findByRole("button", { name: "Uruchom eksport COCO" }));

    const failure = await screen.findByRole("alert");
    expect(failure).toHaveTextContent("Nie udało się wczytać statusu eksportu");
    expect(within(failure).getByRole("button", { name: "Spróbuj ponownie" })).toBeEnabled();
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
    fireEvent.click(screen.getByRole("button", { name: "Uruchom eksport COCO" }));
    await tick();
    expect(exportGets).toBe(1);
    expect(screen.getByText("Eksport COCO jest przygotowywany…")).toBeInTheDocument();

    await tick(RUN_POLL_INTERVAL_MS);
    expect(exportGets).toBe(2);

    current = exportFixture();
    await tick(RUN_POLL_INTERVAL_MS);
    expect(exportGets).toBe(3);
    expect(screen.getByRole("region", { name: "Wynik eksportu COCO" })).toHaveTextContent(
      "To licznik pochodzenia boksów, nie ocena trafności OCR.",
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
    await user.click(await screen.findByRole("button", { name: "Uruchom eksport COCO" }));

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(`Kod: ${code}.`);
    expect(screen.getByRole("button", { name: "Uruchom nowy eksport" })).toBeEnabled();
  });

  it("shows source counts as provenance and never exposes an absolute output path", async () => {
    const user = userEvent.setup();
    const unsafe = exportFixture({ output_relpath: "D:\\secret\\workspace\\export-1" });
    stubFetch((url, init) => {
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
    await user.click(await screen.findByRole("button", { name: "Uruchom eksport COCO" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("bezpiecznej relatywnej ścieżki");
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
      if (url.endsWith("/api/v1/exports") && init?.method === "POST") {
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
    await user.click(await screen.findByRole("button", { name: "Uruchom eksport COCO" }));
    const complete = await screen.findByRole("button", { name: "Zamknij run" });
    await user.click(complete);

    expect(complete).toBeDisabled();
    expect(complete).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("region", { name: "Źródło eksportu" })).toHaveTextContent(
      "Gotowy do weryfikacji",
    );
    expect(screen.queryByText("Run został zamknięty")).toBeNull();

    const completeCall = spy.mock.calls.find(([url]) => String(url).endsWith("/complete"));
    expect(JSON.parse(String(completeCall?.[1]?.body))).toEqual({ expected_version: 4 });

    release();
    expect(await screen.findByText("Run został zamknięty")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Źródło eksportu" })).toHaveTextContent(
        "Ukończony",
      );
    });
    expect(screen.queryByRole("button", { name: "Zamknij run" })).toBeNull();
    expect(
      spy.mock.calls.some(([url]) => String(url).endsWith("/api/v1/dashboard")),
    ).toBe(true);
  });

  it("keeps completion keyboard reachable and names every landmark", async () => {
    const user = userEvent.setup();
    stubFetch((url, init) => {
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
    const start = await screen.findByRole("button", { name: "Uruchom eksport COCO" });
    start.focus();
    await user.keyboard("{Enter}");

    const complete = await screen.findByRole("button", { name: "Zamknij run" });
    expect(complete).toBeVisible();
    expect(screen.getByRole("region", { name: "Bieżący eksport" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Wynik eksportu COCO" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Pochodzenie anotacji" })).getByText("OCR"))
      .toBeInTheDocument();
  });
});
