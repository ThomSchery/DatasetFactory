import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { CollapsibleGroup } from "./CollapsibleGroup";

function Harness({ initialOpen = true }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <CollapsibleGroup label="Numbers" onToggle={() => setOpen((current) => !current)} open={open}>
      <p>osiem</p>
    </CollapsibleGroup>
  );
}

describe("CollapsibleGroup", () => {
  it("names the group and the action the triangle performs", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const toggle = screen.getByRole("button", { name: "Collapse group Numbers" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("group", { name: "Numbers" })).toBeInTheDocument();
    expect(screen.getByText("osiem")).toBeVisible();

    await user.click(toggle);

    const collapsed = screen.getByRole("button", { name: "Expand group Numbers" });
    expect(collapsed).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("osiem")).not.toBeVisible();
  });

  it("keeps aria-controls pointing at an element that exists while collapsed", () => {
    render(<Harness initialOpen={false} />);

    const toggle = screen.getByRole("button", { name: "Expand group Numbers" });
    const controlled = toggle.getAttribute("aria-controls");
    expect(controlled).not.toBeNull();
    expect(document.getElementById(controlled as string)).not.toBeNull();
    // Present in the document, absent from the accessibility tree: `hidden`
    // keeps the collapsed rows out of reach of both a reader and `Tab`.
    expect(screen.getByText("osiem")).not.toBeVisible();
  });

  it("lets a caller own the header row instead of the default heading", () => {
    render(
      <CollapsibleGroup
        label="Letters"
        onToggle={() => undefined}
        open
        summary={<span>Letters · 26</span>}
      >
        <p>A</p>
      </CollapsibleGroup>,
    );

    expect(screen.getByText("Letters · 26")).toBeVisible();
  });

  it("marks the state with the Figma chevrons, not text glyphs (FE-025)", async () => {
    const user = userEvent.setup();
    render(<Harness initialOpen={false} />);
    const collapsed = screen.getByRole("button", { name: "Expand group Numbers" });
    expect(collapsed.querySelector("svg")?.getAttribute("data-icon")).toBe("chevron-right");
    expect(collapsed.textContent).toBe("");
    await user.click(collapsed);
    const open = screen.getByRole("button", { name: "Collapse group Numbers" });
    expect(open.querySelector("svg")?.getAttribute("data-icon")).toBe("chevron-down");
  });

  it("puts the chevron after the header content when asked (Figma class groups)", () => {
    render(
      <CollapsibleGroup label="Custom" markerPlacement="end" onToggle={() => undefined} open>
        <p>A</p>
      </CollapsibleGroup>,
    );
    const header = screen.getByRole("group", { name: "Custom" }).firstElementChild as HTMLElement;
    expect(header.lastElementChild).toBe(screen.getByRole("button", { name: "Collapse group Custom" }));
    expect(header.firstElementChild).toHaveTextContent("Custom");
  });

  it("leaves the triangle out of the tab order when the caller rovers focus", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">przed</button>
        <CollapsibleGroup label="Numbers" onToggle={() => undefined} open toggleTabIndex={-1}>
          <p>osiem</p>
        </CollapsibleGroup>
        <button type="button">po</button>
      </>,
    );

    screen.getByRole("button", { name: "przed" }).focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "po" })).toHaveFocus();
  });
});
