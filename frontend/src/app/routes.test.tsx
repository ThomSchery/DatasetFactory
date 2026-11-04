import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  emptyDashboard,
  framePageFixture,
  profileFixture,
  profileSummaryFixture,
  runFixture,
  runSummaryFixture,
} from "../test/fixtures";
import { renderApp, stubFetch } from "../test/harness";
import { NAV_DESTINATIONS, WORKSPACE_DESTINATIONS } from "./navigation";

/*
 * FE-04 fixed the route set at five; FE-021 added `/run` when it split Upload
 * from Run, and kept every earlier address resolving.
 *
 * The navigation itself changed shape: three steps in a switch, everything
 * else behind a named menu. These tests follow that shape but assert the same
 * properties as before — every destination reachable, the active one carrying
 * `aria-current`, and the whole thing operable from the keyboard.
 */

const BUILT_ROUTES: readonly [string, string][] = [
  ["/", "Dashboard"],
  ["/run", "Run Setup"],
];

/** Opens the menu that holds the complete destination map. */
async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Wszystkie sekcje" }));
}

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
    if (url.endsWith("/profiles")) {
      return { status: 200, body: [profileSummaryFixture()] };
    }
    if (url.includes("/profiles/profile-1")) {
      return { status: 200, body: profileFixture() };
    }
    if (url.includes("/frames?")) {
      return { status: 200, body: framePageFixture({ items: [], total: 0 }) };
    }
    if (url.includes("/runs?")) {
      return {
        status: 200,
        body: { items: [runSummaryFixture()], page: 1, page_size: 20, total: 1 },
      };
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
  it.each(BUILT_ROUTES)("renders the %s screen with its run panel", async (path, heading) => {
    renderApp([path]);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(heading);
    expect(
      await screen.findByRole("region", { name: "Aktywny run" }, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/nie (jest|są) jeszcze zbudowan/i)).toBeNull();
  });

  it("renders Upload as import and material list, without the run controls", async () => {
    renderApp(["/materials"]);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Materiały");
    expect(await screen.findByRole("region", { name: "Import materiału" })).toBeInTheDocument();
    // FE-021 moved starting a run to `/run`; Upload stops at the list.
    expect(screen.queryByRole("region", { name: "Aktywny run" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Uruchomienie runu" })).toBeNull();
  });

  it("opens the profile workspace on a blank draft at /profiles/new", () => {
    renderApp(["/profiles/new"]);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Nowy profil gry");
    // The same panels as a loaded profile; only the screenshot is missing.
    expect(screen.getByRole("region", { name: "Dodaj zrzut ekranu" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Annotations" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Klasy" })).toBeInTheDocument();
    expect(screen.queryByText(/nie (jest|są) jeszcze zbudowan/i)).toBeNull();
  });

  it("opens the active profile in the same workspace at /profiles", async () => {
    renderApp(["/profiles"]);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Profile gier");
    expect(
      await screen.findByRole("region", { name: "Zrzut referencyjny" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Annotations" })).toBeInTheDocument();
  });

  it("renders the annotation review screen built in FE-001-F4", async () => {
    renderApp(["/annotations/run-42"]);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Anotacje");
    expect(
      await screen.findByRole("group", { name: "Filtr statusu klatek" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Brak klatek dla wybranego filtra")).toBeInTheDocument();
    expect(screen.queryByText(/nie (jest|są) jeszcze zbudowan/i)).toBeNull();
  });

  it("renders the global run list as the annotation entry point", async () => {
    renderApp(["/annotations"]);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Anotacje");
    expect(await screen.findByText("Quake Champions")).toBeInTheDocument();
  });

  it("renders the export screen built in FE-001-F5", async () => {
    renderApp(["/exports"]);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Eksporty");
    expect(await screen.findByText("Brak runu do eksportu")).toBeInTheDocument();
    expect(screen.queryByText(/nie (jest|są) jeszcze zbudowan/i)).toBeNull();
  });

  it("keeps runId in the URL rather than in component state", async () => {
    const app = renderApp(["/annotations/run-42"]);
    await screen.findByText("Brak klatek dla wybranego filtra");
    expect(app.router.state.location.pathname).toBe("/annotations/run-42");
  });

  it("shows an explicit empty state for an unknown path", () => {
    renderApp(["/nope"]);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Nieznana trasa");
    expect(screen.getByRole("region", { name: "Nie ma takiej trasy" })).toBeInTheDocument();
  });
});

describe("navigation shell", () => {
  it("offers the three workspace steps as a switch", () => {
    renderApp(["/"]);
    const steps = screen.getByRole("navigation", { name: "Kroki workspace'u" });
    for (const destination of WORKSPACE_DESTINATIONS) {
      expect(within(steps).getByRole("link", { name: destination.label })).toBeInTheDocument();
    }
  });

  it("keeps every destination reachable through the menu", async () => {
    const user = userEvent.setup();
    renderApp(["/"]);
    const nav = screen.getByRole("navigation", { name: "Nawigacja główna" });

    // Collapsed, the links are present but out of the tab order.
    expect(within(nav).queryByRole("link", { name: /Eksporty/ })).toBeNull();

    await openMenu(user);

    for (const destination of NAV_DESTINATIONS) {
      expect(
        within(nav).getByRole("link", { name: new RegExp(destination.label) }),
      ).toBeInTheDocument();
    }
  });

  it("closes the menu on Escape and gives focus back to its toggle", async () => {
    const user = userEvent.setup();
    renderApp(["/"]);
    const toggle = screen.getByRole("button", { name: "Wszystkie sekcje" });

    await openMenu(user);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
  });

  it("does not fake SAM 3 as a working destination", async () => {
    const user = userEvent.setup();
    renderApp(["/"]);
    await openMenu(user);
    expect(screen.queryByRole("link", { name: /SAM 3/ })).toBeNull();
  });

  it("marks the active step with aria-current", () => {
    renderApp(["/materials"]);
    expect(screen.getByRole("link", { name: "Upload" })).toHaveAttribute("aria-current", "page");
  });

  it("does not mark the dashboard active on a nested route", async () => {
    const user = userEvent.setup();
    renderApp(["/materials"]);
    await openMenu(user);
    expect(screen.getByRole("link", { name: /Dashboard/ })).not.toHaveAttribute("aria-current");
  });

  it("links Anotacje to the global run list from every route", async () => {
    const user = userEvent.setup();
    renderApp(["/annotations/run-7"]);
    await openMenu(user);
    expect(screen.getByRole("link", { name: /Anotacje/ })).toHaveAttribute(
      "href",
      "/annotations",
    );
  });

  it("is operable from the keyboard", async () => {
    const user = userEvent.setup();
    renderApp(["/"]);

    await user.tab();
    expect(screen.getByRole("link", { name: "Przejdź do treści" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Wszystkie sekcje" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("link", { name: "Upload" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("link", { name: "Profil" })).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Profile gier");
  });

  it("navigates between routes by activating a destination in the menu", async () => {
    const user = userEvent.setup();
    renderApp(["/"]);

    await openMenu(user);
    await user.click(screen.getByRole("link", { name: /Eksporty/ }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Eksporty");
    // Navigating is the menu's whole job, so it closes behind the choice.
    expect(screen.getByRole("button", { name: "Wszystkie sekcje" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});
