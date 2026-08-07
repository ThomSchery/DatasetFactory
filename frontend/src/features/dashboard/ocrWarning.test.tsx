import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { dashboardFixture, emptyDashboard, materialFixture, runFixture } from "../../test/fixtures";
import { renderApp, stubFetch } from "../../test/harness";

/*
 * FE-001-F2 §Logika.5 and §Done Criteria.
 *
 * This is the requirement most likely to be lost in a later refactor, and it is
 * the user's only signal that the OCR proposals need checking. It is pinned on
 * both screens, in both directions, and against the copy itself.
 */

const WARNING_TITLE = "Propozycje OCR wymagają sprawdzenia";
const SCREENS: readonly [string, string][] = [
  ["dashboard", "/"],
  ["materials", "/materials"],
];

function stubWith(run: ReturnType<typeof runFixture> | null) {
  return stubFetch((url) => {
    if (url.includes("/api/v1/materials")) {
      return {
        status: 200,
        body: { items: [materialFixture()], page: 1, page_size: 100, total: 1 },
      };
    }
    if (url.includes("/api/v1/profiles/current")) {
      return { status: 200, body: dashboardFixture().profile };
    }
    return {
      status: 200,
      body: run === null ? emptyDashboard() : dashboardFixture({ run }),
    };
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the OCR quality warning", () => {
  it.each(SCREENS)("is visible on the %s screen for an experimental engine", async (_name, path) => {
    stubWith(runFixture({ experimental: true, quality_gate: "passed" }));
    renderApp([path]);

    expect(await screen.findByRole("status", { name: WARNING_TITLE })).toBeInTheDocument();
  });

  it.each(SCREENS)("is visible on the %s screen when the gate did not pass", async (_name, path) => {
    stubWith(runFixture({ experimental: false, quality_gate: "failed" }));
    renderApp([path]);

    expect(await screen.findByRole("status", { name: WARNING_TITLE })).toBeInTheDocument();
  });

  it.each(SCREENS)(
    "is visible on the %s screen for the Tesseract run the backend writes today",
    async (_name, path) => {
      // CF-03.4: v1 always records `experimental=true` and `quality_gate=failed`,
      // so this warning is always on. If it ever disappears, the adapter changed
      // and that change has to be a deliberate one.
      stubWith(runFixture());
      renderApp([path]);

      expect(await screen.findByRole("status", { name: WARNING_TITLE })).toBeInTheDocument();
    },
  );

  it.each(SCREENS)("never claims the annotations are correct on the %s screen", async (_name, path) => {
    stubWith(runFixture());
    renderApp([path]);

    const warning = await screen.findByRole("status", { name: WARNING_TITLE });
    expect(warning).toHaveTextContent("propozycjami, a nie gotowymi anotacjami");
    expect(warning).toHaveTextContent("Zweryfikuj każdą klatkę przed eksportem.");
    expect(warning.textContent).not.toMatch(/popraw(ne|ny)\b|zweryfikowan|gotowe do eksportu/i);
  });

  it.each(SCREENS)("cannot be dismissed on the %s screen", async (_name, path) => {
    const user = userEvent.setup();
    stubWith(runFixture());
    renderApp([path]);

    const warning = await screen.findByRole("status", { name: WARNING_TITLE });
    expect(within(warning).queryByRole("button")).toBeNull();

    // Interacting with the screen elsewhere leaves it exactly where it was.
    await user.tab();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("status", { name: WARNING_TITLE })).toBeInTheDocument();
  });

  it.each(SCREENS)(
    "stays out of the way on the %s screen when the OCR cleared the gate",
    async (_name, path) => {
      stubWith(runFixture({ experimental: false, quality_gate: "passed" }));
      renderApp([path]);

      // Wait for the run to be on screen before asserting the warning is not.
      expect(await screen.findByRole("region", { name: "Aktywny run" })).toBeInTheDocument();
      expect(screen.queryByRole("status", { name: WARNING_TITLE })).toBeNull();
    },
  );

  it.each(SCREENS)("shows nothing to warn about on the %s screen with no run", async (_name, path) => {
    stubWith(null);
    renderApp([path]);

    expect(await screen.findByText("Brak aktywnego runu")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: WARNING_TITLE })).toBeNull();
  });
});
