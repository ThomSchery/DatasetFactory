import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  emptyDashboard,
  framePageFixture,
  profileFixture,
  runFixture,
} from "../test/fixtures";
import { renderApp, stubFetch } from "../test/harness";
import { NAV_DESTINATIONS, PIPELINE_STAGES } from "./navigation";

/*
 * FE-04 fixes the route set at five. Dashboard and Materiały render their real
 * screens since FE-001-F2, Nowy profil gry since FE-001-F3, and Anotacje since
 * FE-001-F4. Eksporty still carries an explicit future-feature empty state.
 */

const UNBUILT_ROUTES: readonly [string, string][] = [
  ["/exports", "Eksporty"],
];

const BUILT_ROUTES: readonly [string, string][] = [
  ["/", "Dashboard"],
  ["/materials", "Materiały"],
];

beforeEach(() => {
  // The built screens query the API on mount; an empty install is the
  // quietest backdrop for assertions about routing rather than about data.
  stubFetch((url) => {
    if (url.includes("/materials")) {
      return { status: 200, body: { items: [], page: 1, page_size: 100, total: 0 } };
    }
    if (url.includes("/profiles/current")) {
      return { status: 200, body: profileFixture() };
    }
    if (url.includes("/profiles/profile-1")) {
      return { status: 200, body: profileFixture() };
    }
    if (url.includes("/frames?")) {
      return { status: 200, body: framePageFixture({ items: [], total: 0 }) };
    }
    const runMatch = url.match(/\/api\/v1\/runs\/([^/?]+)$/);
    if (runMatch) {
      return { status: 200, body: runFixture({ id: runMatch[1] }) };
    }
    return { status: 200, body: emptyDashboard() };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the five FE-04 routes", () => {
  it.each(UNBUILT_ROUTES)(
    "renders %s with its heading and an explicit empty state",
    (path, heading) => {
      renderApp([path]);

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(heading);
      const empty = screen.getByRole("region", { name: /nie (jest|są) jeszcze zbudowan/i });
      expect(within(empty).getByText("Brak danych")).toBeInTheDocument();
    },
  );

  it.each(BUILT_ROUTES)("renders the %s screen built in FE-001-F2", async (path, heading) => {
    renderApp([path]);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(heading);
    expect(
      await screen.findByRole("region", { name: "Aktywny run" }, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/nie (jest|są) jeszcze zbudowan/i)).toBeNull();
  });

  it("renders the profile creation screen built in FE-001-F3", () => {
    renderApp(["/profiles/new"]);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Nowy profil gry");
    expect(screen.getByRole("region", { name: "Obraz referencyjny" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Regiony HUD" })).toBeInTheDocument();
    expect(screen.queryByText(/nie (jest|są) jeszcze zbudowan/i)).toBeNull();
  });

  it("renders the annotation review screen built in FE-001-F4", async () => {
    renderApp(["/annotations/run-42"]);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Anotacje");
    expect(await screen.findByRole("region", { name: "Filtr klatek" })).toBeInTheDocument();
    expect(screen.getByText("Brak klatek dla wybranego filtra")).toBeInTheDocument();
    expect(screen.queryByText(/nie (jest|są) jeszcze zbudowan/i)).toBeNull();
  });

  it("keeps runId in the URL rather than in component state", async () => {
    renderApp(["/annotations/run-42"]);
    expect(await screen.findByRole("region", { name: "Filtr klatek" })).toHaveTextContent(
      "run-42",
    );
  });

  it("shows an explicit empty state for an unknown path", () => {
    renderApp(["/nope"]);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Nieznana trasa");
    expect(screen.getByRole("region", { name: "Nie ma takiej trasy" })).toBeInTheDocument();
  });
});

describe("navigation shell", () => {
  it("lists all five destinations", () => {
    renderApp(["/"]);
    const nav = screen.getByRole("navigation", { name: "Nawigacja główna" });
    for (const destination of NAV_DESTINATIONS) {
      expect(within(nav).getByText(destination.label)).toBeInTheDocument();
    }
  });

  it("lists all five pipeline stages and marks SAM 3 as out of v1", () => {
    renderApp(["/"]);
    for (const stage of PIPELINE_STAGES) {
      expect(screen.getByText(stage.label)).toBeInTheDocument();
    }

    const samStage = screen.getByText("SAM 3").closest("li");
    expect(samStage).not.toBeNull();
    expect(within(samStage as HTMLElement).getByText("Poza v1")).toBeInTheDocument();
  });

  it("does not fake SAM 3 as a working destination", () => {
    renderApp(["/"]);
    expect(screen.queryByRole("link", { name: /SAM 3/ })).toBeNull();
  });

  it("marks the active destination with aria-current", () => {
    renderApp(["/materials"]);
    const active = screen.getByRole("link", { name: /Materiały/ });
    expect(active).toHaveAttribute("aria-current", "page");
  });

  it("does not mark the dashboard active on a nested route", () => {
    renderApp(["/materials"]);
    expect(screen.getByRole("link", { name: /Dashboard/ })).not.toHaveAttribute("aria-current");
  });

  it("links Anotacje to the run in the URL, and marks it as needing one otherwise", () => {
    const withoutRun = renderApp(["/"]);
    expect(screen.queryByRole("link", { name: /Anotacje/ })).toBeNull();
    expect(screen.getByText("Wymaga runu")).toBeInTheDocument();
    withoutRun.unmount();

    renderApp(["/annotations/run-7"]);
    expect(screen.getByRole("link", { name: /Anotacje/ })).toHaveAttribute(
      "href",
      "/annotations/run-7",
    );
  });

  it("is operable from the keyboard", async () => {
    const user = userEvent.setup();
    renderApp(["/"]);

    await user.tab();
    expect(screen.getByRole("link", { name: "Przejdź do treści" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("link", { name: /Dashboard/ })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("link", { name: /Profil gry/ })).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Nowy profil gry");
  });

  it("navigates between routes by activating a destination", async () => {
    const user = userEvent.setup();
    renderApp(["/"]);

    await user.click(screen.getByRole("link", { name: /Eksporty/ }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Eksporty");
    expect(screen.getByRole("link", { name: /Eksporty/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
