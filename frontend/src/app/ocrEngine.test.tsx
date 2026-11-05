import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { dashboardFixture, emptyDashboard, runFixture } from "../test/fixtures";
import { renderApp, stubFetch } from "../test/harness";

/*
 * FE-022 removed the OCR warning blocks from the screens. `docs/CONTEXT.md`
 * (OCR revision after Gate 2) still requires the interface to disclose the
 * engine id, its version and hashes, `quality_gate=failed` and that the output
 * needs full manual review — now from "OCR engine" in the ⋮ menu.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openOcrEngine(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "More" }));
  await user.click(screen.getByRole("button", { name: "OCR engine" }));
  return screen.findByRole("dialog", { name: "OCR engine" });
}

describe("OCR engine disclosure", () => {
  it("names the engine, its version, hashes and failed quality gate, and asks for review", async () => {
    const user = userEvent.setup();
    stubFetch(() => ({
      status: 200,
      body: dashboardFixture({
        run: runFixture({
          experimental: true,
          ocr_engine: "tesseract",
          ocr_engine_version: "v5.5.3",
          ocr_model_sha256: "b".repeat(64),
          ocr_runtime_sha256: "a".repeat(64),
          quality_gate: "failed",
          warning: "Sprawdź propozycje przed akceptacją.",
        }),
      }),
    }));
    renderApp(["/materials"]);

    const dialog = await openOcrEngine(user);
    expect(await within(dialog).findByText("tesseract")).toBeInTheDocument();
    expect(within(dialog).getByText("v5.5.3")).toBeInTheDocument();
    expect(within(dialog).getByText("a".repeat(64))).toBeInTheDocument();
    expect(within(dialog).getByText("b".repeat(64))).toBeInTheDocument();
    expect(within(dialog).getByText("failed")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("full manual review");
    expect(dialog).toHaveTextContent("Pending");

    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "OCR engine" })).toBeNull();
  });

  it("still says OCR output needs review before any run exists", async () => {
    const user = userEvent.setup();
    stubFetch(() => ({ status: 200, body: emptyDashboard() }));
    renderApp(["/materials"]);

    const dialog = await openOcrEngine(user);
    expect((await within(dialog).findAllByText("Tesseract")).length).toBeGreaterThan(0);
    expect(dialog).toHaveTextContent("full manual review");
  });

  it("reports the local dependencies the Dashboard used to show", async () => {
    const user = userEvent.setup();
    const dashboard = emptyDashboard();
    dashboard.system.workspace = { available: false, critical: true, detail: "unavailable" };
    stubFetch(() => ({ status: 200, body: dashboard }));
    renderApp(["/materials"]);

    const dialog = await openOcrEngine(user);
    const workspace = (await within(dialog).findAllByRole("listitem")).find((item) =>
      item.textContent?.startsWith("Workspace"),
    );
    expect(workspace).toHaveTextContent("Unavailable");
    expect(workspace).toHaveTextContent("unavailable");
  });

  it("keeps OCR warning blocks off the screens", async () => {
    stubFetch(() => ({
      status: 200,
      body: dashboardFixture({ run: runFixture({ experimental: true, quality_gate: "failed" }) }),
    }));
    renderApp(["/materials"]);
    await screen.findByRole("button", { name: "Upload Video" });
    expect(document.querySelector(".df-notice")).toBeNull();
  });
});
