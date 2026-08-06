import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { renderApp } from "../test/harness";
import { NAV_DESTINATIONS, PIPELINE_STAGES } from "./navigation";

/*
 * FE-04 fixes the route set at five. Each one renders an explicit empty state
 * here; the screens arrive in FE-001-F2 … FE-001-F5.
 */

const ROUTES: readonly [string, string][] = [
  ["/", "Dashboard"],
  ["/profiles/new", "Nowy profil gry"],
  ["/materials", "Materiały"],
  ["/annotations/run-42", "Anotacje"],
  ["/exports", "Eksporty"],
];

describe("the five FE-04 routes", () => {
  it.each(ROUTES)("renders %s with its heading and an explicit empty state", (path, heading) => {
    renderApp([path]);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(heading);
    const empty = screen.getByRole("region", { name: /nie (jest|są) jeszcze zbudowan/i });
    expect(within(empty).getByText("Brak danych")).toBeInTheDocument();
  });

  it("keeps runId in the URL rather than in component state", () => {
    renderApp(["/annotations/run-42"]);
    expect(screen.getByRole("region", { name: /weryfikacja/i })).toHaveTextContent("run-42");
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
