import { screen, waitFor, within } from "@testing-library/react";
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
import { renderApp, restoreViewportWidth, setViewportWidth, stubFetch } from "../test/harness";
import { MENU_DESTINATIONS, SECTION_DESTINATIONS, WORKSPACE_DESTINATIONS } from "./navigation";

/*
 * FE-022 routes and shell: no Dashboard (`/` opens Upload), a side bar with the
 * four sections, the Upload / Profile / Run switch on those three screens and
 * the ⋮ menu for everything else. These tests assert the same properties as
 * before — every destination reachable, the active one carrying
 * `aria-current`, and the whole thing operable from the keyboard.
 */

/** Opens the ⋮ menu that holds what the side bar does not show. */
async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "More" }));
}

function sections() {
  return screen.getByRole("navigation", { name: "Sections" });
}

/** The drawer's own list inside the open "Sections" modal (FE-023 FIX2: the
 * modal element also holds ☰ and the inert page, so links are looked up here). */
function drawerNav(dialog: HTMLElement) {
  return within(dialog).getByRole("navigation", { name: "Sections" });
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
  restoreViewportWidth();
});

describe("the routes", () => {
  it("opens Upload at / now that the Dashboard is gone", async () => {
    const app = renderApp(["/"]);

    await waitFor(() => {
      expect(app.router.state.location.pathname).toBe("/materials");
    });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Upload");
    expect(screen.getByRole("button", { name: "Upload Video" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Dashboard/ })).toBeNull();
  });

  it("renders Run Setup with its visible heading and run settings", async () => {
    renderApp(["/run"]);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Run Setup");
    expect(await screen.findByRole("region", { name: "Run settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run" })).toBeInTheDocument();
  });

  it("renders Upload as the upload tile alone, without the run controls", () => {
    renderApp(["/materials"]);

    expect(screen.getByRole("button", { name: "Upload Video" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enter path" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Active run" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Run settings" })).toBeNull();
  });

  it("opens the profile workspace on a blank draft at /profiles/new", () => {
    renderApp(["/profiles/new"]);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("New profile");
    // The same panels as a loaded profile; only the screenshot is missing.
    expect(
      screen.getByRole("button", { name: "Add screenshot (JPG/PNG)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Annotations" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Classes" })).toBeInTheDocument();
  });

  it("opens the active profile in the same workspace at /profiles", async () => {
    renderApp(["/profiles"]);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Setup for scan");
    expect(
      await screen.findByRole("img", { name: /Reference screenshot of profile/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Annotations" })).toBeInTheDocument();
  });

  it("renders the annotation review screen", async () => {
    renderApp(["/annotations/run-42"]);

    expect(
      await screen.findByRole("group", { name: "Frame status filter" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Review frames");
    expect(screen.getByText("No frames for this filter")).toBeInTheDocument();
  });

  it("renders the global run list as the annotation entry point", async () => {
    renderApp(["/annotations"]);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Annotations");
    expect(await screen.findByText("Quake Champions")).toBeInTheDocument();
  });

  it("renders the export screen", async () => {
    renderApp(["/exports"]);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Exports");
    expect(await screen.findByText("No run to export")).toBeInTheDocument();
  });

  it("keeps runId in the URL rather than in component state", async () => {
    const app = renderApp(["/annotations/run-42"]);
    await screen.findByText("No frames for this filter");
    expect(app.router.state.location.pathname).toBe("/annotations/run-42");
  });

  it("shows an explicit empty state for an unknown path", () => {
    renderApp(["/nope"]);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Unknown page");
    expect(screen.getByRole("region", { name: "No such page" })).toBeInTheDocument();
  });
});

describe("navigation shell", () => {
  it("draws a bar with no text, only the sections toggle and the menu", () => {
    renderApp(["/materials"]);
    const bar = screen.getByRole("banner");
    // The ⋮ list lives in the bar but is hidden; nothing visible is text.
    expect(bar).not.toHaveTextContent("DatasetFactory");
    expect(bar.querySelectorAll("h1, h2, p")).toHaveLength(0);
    expect(within(bar).getByRole("button", { name: "Sections" })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "More" })).toBeInTheDocument();
  });

  it("offers the three workspace steps as a switch on Upload, Profile and Run only", async () => {
    renderApp(["/materials"]);
    const steps = screen.getByRole("navigation", { name: "Workspace steps" });
    for (const destination of WORKSPACE_DESTINATIONS) {
      expect(within(steps).getByRole("link", { name: destination.label })).toBeInTheDocument();
    }
  });

  it("drops the switch on Review", async () => {
    renderApp(["/annotations/run-42"]);
    await screen.findByText("No frames for this filter");
    expect(screen.queryByRole("navigation", { name: "Workspace steps" })).toBeNull();
  });

  it("shows the four sections as an icon strip from 768 px, with names", () => {
    renderApp(["/materials"]);
    for (const destination of SECTION_DESTINATIONS) {
      const link = within(sections()).getByRole("link", { name: destination.label });
      expect(link).toHaveAttribute("href", destination.path);
      expect(link).toHaveAttribute("title", expect.stringContaining(destination.label));
    }
  });

  it("collapses and restores the strip with ☰ alone, and keeps the choice across routes", async () => {
    const user = userEvent.setup();
    renderApp(["/materials"]);
    // FE-023: the side bar has no |← control of its own any more.
    expect(screen.queryByRole("button", { name: /Collapse sections|Close sections/ })).toBeNull();
    const toggle = screen.getByRole("button", { name: "Sections" });
    const controlled = () => document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(controlled()).toBe(sections());

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "Sections" })).toBeNull();
    // `aria-controls` still names an element that exists, now hidden.
    expect(controlled()).not.toBeNull();
    expect(controlled()).not.toBeVisible();

    const steps = screen.getByRole("navigation", { name: "Workspace steps" });
    await user.click(within(steps).getByRole("link", { name: "Profile" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Setup for scan");
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(controlled()).toBe(sections());
  });

  it("hides the sections below 768 px and opens them as a drawer from ☰", async () => {
    setViewportWidth(360);
    const user = userEvent.setup();
    renderApp(["/materials"]);
    const toggle = screen.getByRole("button", { name: "Sections" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog", { name: "Sections" })).toBeNull();

    await user.click(toggle);
    const drawer = screen.getByRole("dialog", { name: "Sections" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(drawer).toContainElement(document.getElementById(toggle.getAttribute("aria-controls") ?? ""));
    expect(within(drawerNav(drawer)).queryByRole("button")).toBeNull();
    expect(within(drawerNav(drawer)).getByRole("link", { name: "Upload" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Sections" })).toBeNull();
    expect(toggle).toHaveFocus();
  });

  it("makes one labelled modal of ☰ and the drawer while it is open (FIX2)", async () => {
    setViewportWidth(360);
    const user = userEvent.setup();
    renderApp(["/materials"]);
    const toggle = screen.getByRole("button", { name: "Sections" });
    expect(toggle.closest("[role=dialog]")).toBeNull();

    await user.click(toggle);
    const modal = screen.getByRole("dialog", { name: "Sections" });
    expect(modal).toHaveAttribute("aria-modal", "true");
    expect(modal).toContainElement(toggle);
    expect(modal).toContainElement(drawerNav(modal));
    expect(modal).toContainElement(document.getElementById(toggle.getAttribute("aria-controls") ?? ""));
    // ☰ is the same node: nothing was moved into the modal.
    expect(screen.getByRole("button", { name: "Sections" })).toBe(toggle);

    await user.click(toggle);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(toggle.closest("[role=dialog]")).toBeNull();
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the drawer with the same ☰ that opened it", async () => {
    setViewportWidth(360);
    const user = userEvent.setup();
    renderApp(["/materials"]);
    const toggle = screen.getByRole("button", { name: "Sections" });
    await user.click(toggle);
    expect(screen.getByRole("dialog", { name: "Sections" })).toBeInTheDocument();

    await user.click(toggle);
    expect(screen.queryByRole("dialog", { name: "Sections" })).toBeNull();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
  });

  it("traps focus in ☰ and the drawer and closes it after a choice", async () => {
    setViewportWidth(360);
    const user = userEvent.setup();
    const app = renderApp(["/materials"]);
    const toggle = screen.getByRole("button", { name: "Sections" });
    await user.click(toggle);
    const drawer = screen.getByRole("dialog", { name: "Sections" });
    expect(within(drawerNav(drawer)).getByRole("link", { name: "Upload" })).toHaveFocus();

    // FE-023 FIX1: the modal scope is ☰ plus the drawer's sections.
    await user.tab({ shift: true });
    expect(toggle).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(drawerNav(drawer)).getByRole("link", { name: "Annotations" })).toHaveFocus();
    await user.tab();
    expect(toggle).toHaveFocus();
    await user.tab();
    expect(within(drawerNav(drawer)).getByRole("link", { name: "Upload" })).toHaveFocus();

    await user.click(within(drawerNav(drawer)).getByRole("link", { name: "Setup for scan" }));
    await waitFor(() => {
      expect(app.router.state.location.pathname).toBe("/profiles");
    });
    expect(screen.queryByRole("dialog", { name: "Sections" })).toBeNull();
  });

  it("keeps ⋮ More, the skip link and the page out of reach while the drawer is open", async () => {
    setViewportWidth(360);
    const user = userEvent.setup();
    renderApp(["/materials"]);
    const more = screen.getByRole("button", { name: "More" });
    const main = document.getElementById("df-main");
    const skip = screen.getByRole("link", { name: "Skip to content" });
    expect(more.closest("[inert]")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Sections" }));
    expect(screen.getByRole("dialog", { name: "Sections" })).toBeInTheDocument();
    // FE-023 FIX1: everything outside ☰ and the drawer is inert.
    for (const outside of [more, main, skip]) expect(outside?.closest("[inert]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Sections" }).closest("[inert]")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Sections" }).closest("[inert]")).toBeNull();

    await user.keyboard("{Escape}");
    expect(document.querySelector("[inert]")).toBeNull();
  });

  it("closes the drawer with Escape from ☰ as well as from a section", async () => {
    setViewportWidth(360);
    const user = userEvent.setup();
    renderApp(["/materials"]);
    const toggle = screen.getByRole("button", { name: "Sections" });

    await user.click(toggle);
    await user.tab({ shift: true });
    expect(toggle).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Sections" })).toBeNull();
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    const drawer = screen.getByRole("dialog", { name: "Sections" });
    await user.tab();
    expect(within(drawerNav(drawer)).getByRole("link", { name: "Setup for scan" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Sections" })).toBeNull();
    expect(toggle).toHaveFocus();
  });

  it("leaves the header and page live with the strip from 768 px", async () => {
    const user = userEvent.setup();
    renderApp(["/materials"]);
    await user.click(screen.getByRole("button", { name: "Sections" }));
    expect(document.querySelector("[inert]")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Sections" }));
    expect(document.querySelector("[inert]")).toBeNull();
    await openMenu(user);
    expect(screen.getByRole("button", { name: "More" })).toHaveAttribute("aria-expanded", "true");
  });

  it("closes the drawer on a click outside it", async () => {
    setViewportWidth(360);
    const user = userEvent.setup();
    renderApp(["/materials"]);
    await user.click(screen.getByRole("button", { name: "Sections" }));
    await user.pointer({ keys: "[MouseLeft]", target: screen.getByTestId("side-nav-scrim") });
    expect(screen.queryByRole("dialog", { name: "Sections" })).toBeNull();
  });

  it("keeps the remaining destinations and the OCR engine report in the menu", async () => {
    const user = userEvent.setup();
    renderApp(["/materials"]);
    const nav = screen.getByRole("navigation", { name: "More destinations" });

    // Collapsed, the links are present but out of the tab order.
    expect(within(nav).queryByRole("link", { name: /Exports/ })).toBeNull();

    await openMenu(user);

    for (const destination of MENU_DESTINATIONS) {
      expect(
        within(nav).getByRole("link", { name: new RegExp(destination.label) }),
      ).toBeInTheDocument();
    }
    expect(within(nav).getByRole("button", { name: "OCR engine" })).toBeInTheDocument();
  });

  it("closes the menu on Escape and gives focus back to its toggle", async () => {
    const user = userEvent.setup();
    renderApp(["/materials"]);
    const toggle = screen.getByRole("button", { name: "More" });

    await openMenu(user);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
  });

  it("does not fake SAM 3 as a working destination", async () => {
    const user = userEvent.setup();
    renderApp(["/materials"]);
    await openMenu(user);
    expect(screen.queryByRole("link", { name: /SAM 3/ })).toBeNull();
  });

  it("marks the active section and step with aria-current", () => {
    renderApp(["/materials"]);
    expect(within(sections()).getByRole("link", { name: "Upload" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const steps = screen.getByRole("navigation", { name: "Workspace steps" });
    expect(within(steps).getByRole("link", { name: "Upload" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("links Annotations to the global run list from every route", () => {
    renderApp(["/annotations/run-7"]);
    expect(within(sections()).getByRole("link", { name: "Annotations" })).toHaveAttribute(
      "href",
      "/annotations",
    );
  });

  it("is operable from the keyboard", async () => {
    const user = userEvent.setup();
    renderApp(["/materials"]);

    await user.tab();
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Sections" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "More" })).toHaveFocus();

    await user.tab();
    expect(within(sections()).getByRole("link", { name: "Upload" })).toHaveFocus();

    await user.tab();
    expect(within(sections()).getByRole("link", { name: "Setup for scan" })).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Setup for scan");
  });

  it("navigates between routes by activating a destination in the menu", async () => {
    const user = userEvent.setup();
    renderApp(["/materials"]);

    await openMenu(user);
    await user.click(screen.getByRole("link", { name: /Exports/ }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Exports");
    // Navigating is the menu's whole job, so it closes behind the choice.
    expect(screen.getByRole("button", { name: "More" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});
