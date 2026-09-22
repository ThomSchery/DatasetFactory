import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { CollapsibleGroup } from "./CollapsibleGroup";

function Harness({ initialOpen = true }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <CollapsibleGroup label="Liczby" onToggle={() => setOpen((current) => !current)} open={open}>
      <p>osiem</p>
    </CollapsibleGroup>
  );
}

describe("CollapsibleGroup", () => {
  it("names the group and the action the triangle performs", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const toggle = screen.getByRole("button", { name: "Zwiń grupę Liczby" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("group", { name: "Liczby" })).toBeInTheDocument();
    expect(screen.getByText("osiem")).toBeVisible();

    await user.click(toggle);

    const collapsed = screen.getByRole("button", { name: "Rozwiń grupę Liczby" });
    expect(collapsed).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("osiem")).not.toBeVisible();
  });

  it("keeps aria-controls pointing at an element that exists while collapsed", () => {
    render(<Harness initialOpen={false} />);

    const toggle = screen.getByRole("button", { name: "Rozwiń grupę Liczby" });
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
        label="Litery"
        onToggle={() => undefined}
        open
        summary={<span>Litery · 26</span>}
      >
        <p>A</p>
      </CollapsibleGroup>,
    );

    expect(screen.getByText("Litery · 26")).toBeVisible();
  });

  it("leaves the triangle out of the tab order when the caller rovers focus", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">przed</button>
        <CollapsibleGroup label="Liczby" onToggle={() => undefined} open toggleTabIndex={-1}>
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
