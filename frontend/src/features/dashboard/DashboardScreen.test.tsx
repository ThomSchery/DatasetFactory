import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { dashboardFixture, emptyDashboard, errorEnvelope, runFixture } from "../../test/fixtures";
import { healthFixture } from "../../test/fixtures";
import { renderApp, stubFetch } from "../../test/harness";

/*
 * CF-07: current project, active run, frame counts per status and the state of
 * the local dependencies, plus the four view states FE-06 requires.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dashboard view states", () => {
  it("shows a loading state before the first response", async () => {
    // Definite assignment: the executor runs synchronously, but TypeScript's
    // control flow analysis cannot see that through the callback.
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

    renderApp(["/"]);
    expect(screen.getByRole("status")).toHaveTextContent("Ładowanie stanu systemu…");

    release();
    expect(await screen.findByText("Brak aktywnego projektu")).toBeInTheDocument();
  });

  it("treats an empty install as a valid state, not an error", async () => {
    stubFetch(() => ({ status: 200, body: emptyDashboard() }));
    renderApp(["/"]);

    // TECH_PLAN §5: no project, profile or run is the correct initial state.
    expect(await screen.findByText("Brak aktywnego projektu")).toBeInTheDocument();
    expect(screen.getByText("Brak aktywnego runu")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("offers a retry when the request fails", async () => {
    const user = userEvent.setup();
    let attempt = 0;
    stubFetch(() => {
      attempt += 1;
      return attempt === 1
        ? { status: 500, body: errorEnvelope("internal_error") }
        : { status: 200, body: dashboardFixture() };
    });

    renderApp(["/"]);

    const failure = await screen.findByRole("alert");
    expect(failure).toHaveTextContent("Nie udało się wczytać dashboardu");
    expect(failure).toHaveTextContent("Wystąpił nieoczekiwany błąd aplikacji.");

    await user.click(within(failure).getByRole("button", { name: "Spróbuj ponownie" }));
    // "DatasetFactory" is also the shell's product name, so scope the check to
    // the panel that only exists once the retry succeeded.
    expect(await screen.findByRole("region", { name: "Aktywny projekt" })).toHaveTextContent(
      "DatasetFactory",
    );
  });

  it("renders the whole snapshot on success", async () => {
    stubFetch(() => ({ status: 200, body: dashboardFixture() }));
    renderApp(["/"]);

    const project = await screen.findByRole("region", { name: "Aktywny projekt" });
    expect(project).toHaveTextContent("DatasetFactory");
    expect(project).toHaveTextContent("Gra testowa");
    expect(project).toHaveTextContent("1920 × 1080");

    const run = screen.getByRole("region", { name: "Aktywny run" });
    expect(run).toHaveTextContent("run-1");
    expect(run).toHaveTextContent("W kolejce");
  });
});

describe("frame counts", () => {
  it("does not present the number of existing frames as the number planned", async () => {
    // TK-008: `frame_counts.total` counts rows that exist; `run.total_frames`
    // is how many frames the run plans to produce. 45 and 120 here.
    stubFetch(() => ({
      status: 200,
      body: dashboardFixture({ run: runFixture({ total_frames: 120, completed_frames: 45 }) }),
    }));
    renderApp(["/"]);

    const counts = await screen.findByRole("region", { name: "Klatki wg statusu" });
    expect(counts).toHaveTextContent("Razem istniejących");
    expect(within(counts).getByText("45")).toBeInTheDocument();
    expect(counts).toHaveTextContent("To nie jest liczba klatek zaplanowanych dla runu.");
    expect(counts.textContent).not.toContain("120");

    const run = screen.getByRole("region", { name: "Aktywny run" });
    expect(run).toHaveTextContent("45 / 120");
    expect(run).toHaveTextContent("Klatki ukończone wobec zaplanowanych");
  });
});

describe("system status", () => {
  it("shows the packaged-local OCR fallback as an explicit degraded state", async () => {
    stubFetch(() => ({
      status: 200,
      body: dashboardFixture({
        system: healthFixture({
          status: "degraded",
          tesseract: {
            available: false,
            critical: false,
            detail:
              "Stan zdegradowany: brak zweryfikowanej instalacji operatora; realny OCR jest wylaczony (TD-015).",
          },
        }),
      }),
    }));
    renderApp(["/"]);

    const system = await screen.findByRole("region", { name: "Stan systemu" });
    expect(system).toHaveTextContent("Ograniczony");
    expect(system).toHaveTextContent("TD-015");
    const tesseract = within(system).getByText("Tesseract").closest("li");
    expect(tesseract).not.toBeNull();
    expect(within(tesseract as HTMLElement).getByText("Niedostępny")).toBeInTheDocument();
  });

  it("names every dependency CF-07 requires and marks SAM 3 as out of v1", async () => {
    stubFetch(() => ({
      status: 200,
      body: dashboardFixture({
        system: healthFixture({
          ffmpeg: { available: false, critical: false, detail: "Nie znaleziono ffprobe w PATH." },
        }),
      }),
    }));
    renderApp(["/"]);

    const system = await screen.findByRole("region", { name: "Stan systemu" });
    for (const label of ["FFmpeg", "Tesseract", "Katalog roboczy", "GPU"]) {
      expect(within(system).getByText(label)).toBeInTheDocument();
    }
    expect(system).toHaveTextContent("Nie znaleziono ffprobe w PATH.");

    const sam = within(system).getByText("SAM 3").closest("li");
    expect(sam).not.toBeNull();
    // COLOR-09: out of scope is `muted`, never a status hue.
    expect(within(sam as HTMLElement).getByText("Poza v1")).toBeInTheDocument();
    expect(within(sam as HTMLElement).queryByText(/Dostępny|Niedostępny/)).toBeNull();
  });
});
