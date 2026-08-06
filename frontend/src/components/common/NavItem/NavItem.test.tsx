import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";

import { NavItem } from "./NavItem";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NavItem description="Import wideo" to="/materials">
        Materiały
      </NavItem>
      <NavItem end to="/">
        Dashboard
      </NavItem>
      <Routes>
        <Route element={<p>strona</p>} path="*" />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NavItem", () => {
  it("renders a link with its label and description", () => {
    renderAt("/");
    const link = screen.getByRole("link", { name: /Materiały/ });
    expect(link).toHaveAttribute("href", "/materials");
    expect(link).toHaveTextContent("Import wideo");
  });

  it("announces the active destination with aria-current, not colour alone", () => {
    renderAt("/materials");
    expect(screen.getByRole("link", { name: /Materiały/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("matches the index route exactly when end is set", () => {
    renderAt("/");
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("is reachable by keyboard", () => {
    renderAt("/");
    const link = screen.getByRole("link", { name: /Materiały/ });
    link.focus();
    expect(link).toHaveFocus();
  });
});
