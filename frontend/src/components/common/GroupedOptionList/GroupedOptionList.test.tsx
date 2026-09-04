import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { GroupedOptionList, type GroupedOptionGroup } from "./GroupedOptionList";

const GROUPS: readonly GroupedOptionGroup[] = [
  {
    id: "game",
    label: "Pola HUD (gra)",
    options: [
      { id: "score", label: "Score" },
      { id: "timer", label: "Timer" },
    ],
  },
  {
    id: "character",
    label: "Znaki",
    options: [
      { id: "zero", label: "0" },
      { id: "one", label: "1" },
      { id: "two", label: "2" },
    ],
  },
];

function Harness({
  mode,
  initial = [],
  onConfirm,
}: {
  initial?: readonly string[];
  mode: "single" | "multiple";
  onConfirm?: (selection: readonly string[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<readonly string[]>(initial);
  return (
    <GroupedOptionList
      emptyMessage="Nic nie pasuje."
      filterLabel="Filtruj klasy"
      groups={GROUPS}
      label="Klasy profilu"
      mode={mode}
      onChange={setSelectedIds}
      onConfirm={onConfirm}
      selectedIds={selectedIds}
    />
  );
}

function checkbox(name: string): HTMLElement {
  return screen.getByRole("checkbox", { name });
}

describe("GroupedOptionList in multiple mode", () => {
  it("selects and clears every option of a group with one click on its row", async () => {
    const user = userEvent.setup();
    render(<Harness mode="multiple" />);

    await user.click(checkbox("Znaki"));
    for (const name of ["0", "1", "2"]) {
      expect(checkbox(name)).toHaveAttribute("aria-checked", "true");
    }
    expect(checkbox("Pola HUD (gra)")).toHaveAttribute("aria-checked", "false");

    await user.click(checkbox("Znaki"));
    for (const name of ["0", "1", "2"]) {
      expect(checkbox(name)).toHaveAttribute("aria-checked", "false");
    }
  });

  it("reports a partial group as mixed, distinct from empty and from full", async () => {
    const user = userEvent.setup();
    render(<Harness mode="multiple" />);
    const group = checkbox("Pola HUD (gra)");

    expect(group).toHaveAttribute("aria-checked", "false");
    await user.click(checkbox("Timer"));
    expect(group).toHaveAttribute("aria-checked", "mixed");
    await user.click(checkbox("Score"));
    expect(group).toHaveAttribute("aria-checked", "true");
  });

  it("filters by option name and by group name", async () => {
    const user = userEvent.setup();
    render(<Harness mode="multiple" />);
    const filter = screen.getByLabelText("Filtruj klasy");

    await user.type(filter, "sco");
    expect(checkbox("Score")).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: "Timer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Znaki" })).not.toBeInTheDocument();

    await user.clear(filter);
    await user.type(filter, "znak");
    expect(within(screen.getByRole("group", { name: "Znaki" })).getAllByRole("checkbox")).toHaveLength(
      4,
    );
  });

  it("acts on what the filter shows, so the mark never describes a hidden option", async () => {
    const user = userEvent.setup();
    render(<Harness mode="multiple" />);
    const filter = screen.getByLabelText("Filtruj klasy");

    await user.type(filter, "sco");
    await user.click(checkbox("Pola HUD (gra)"));
    await user.clear(filter);

    expect(checkbox("Score")).toHaveAttribute("aria-checked", "true");
    expect(checkbox("Timer")).toHaveAttribute("aria-checked", "false");
    expect(checkbox("Pola HUD (gra)")).toHaveAttribute("aria-checked", "mixed");
  });

  it("walks the visible rows with the arrows, Home and End", async () => {
    const user = userEvent.setup();
    render(<Harness mode="multiple" />);

    screen.getByLabelText("Filtruj klasy").focus();
    await user.keyboard("{ArrowDown}");
    expect(checkbox("Pola HUD (gra)")).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(checkbox("Timer")).toHaveFocus();
    await user.keyboard("{End}");
    expect(checkbox("2")).toHaveFocus();
    await user.keyboard("{Home}");
    expect(checkbox("Pola HUD (gra)")).toHaveFocus();

    // The filter is the way back out of the list, upwards.
    await user.keyboard("{ArrowUp}");
    expect(screen.getByLabelText("Filtruj klasy")).toHaveFocus();
  });

  it("toggles with Space and keeps exactly one tab stop in the list", async () => {
    const user = userEvent.setup();
    render(<Harness mode="multiple" />);

    screen.getByLabelText("Filtruj klasy").focus();
    await user.keyboard("{ArrowDown}{ArrowDown}[Space]");
    expect(checkbox("Score")).toHaveAttribute("aria-checked", "true");

    const tabbable = screen
      .getAllByRole("checkbox")
      .filter((row) => row.getAttribute("tabindex") === "0");
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBe(checkbox("Score"));
  });

  it("shows the empty message rather than an empty box", async () => {
    const user = userEvent.setup();
    render(<Harness mode="multiple" />);

    await user.type(screen.getByLabelText("Filtruj klasy"), "brak takiej klasy");

    expect(screen.getByRole("status")).toHaveTextContent("Nic nie pasuje.");
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});

describe("GroupedOptionList in single mode", () => {
  it("keeps groups as labels and replaces the selection", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["zero"]} mode="single" />);

    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.getByRole("listbox", { name: "Klasy profilu" })).toBeVisible();
    expect(screen.getByRole("option", { name: "0" })).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("option", { name: "Timer" }));
    expect(screen.getByRole("option", { name: "Timer" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "0" })).toHaveAttribute("aria-selected", "false");
  });

  it("confirms with Enter and reports the selection that keystroke implies", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness mode="single" onConfirm={onConfirm} />);

    await user.type(screen.getByLabelText("Filtruj klasy"), "tim{Enter}");

    expect(onConfirm).toHaveBeenCalledWith(["timer"]);
  });

  it("does not choose anything by moving through the list", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness mode="single" onConfirm={onConfirm} />);

    screen.getByLabelText("Filtruj klasy").focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{End}");

    for (const option of screen.getAllByRole("option")) {
      expect(option).toHaveAttribute("aria-selected", "false");
    }
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("GroupedOptionList boundaries", () => {
  it("marks itself as the owner of its keystrokes", () => {
    render(<Harness mode="multiple" />);

    expect(
      screen.getByLabelText("Filtruj klasy").closest("[data-shortcut-scope]"),
    ).not.toBeNull();
  });

  it("refuses every interaction while disabled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <GroupedOptionList
        disabled
        emptyMessage="Nic nie pasuje."
        filterLabel="Filtruj klasy"
        groups={GROUPS}
        label="Klasy profilu"
        mode="multiple"
        onChange={onChange}
        selectedIds={[]}
      />,
    );

    expect(screen.getByLabelText("Filtruj klasy")).toBeDisabled();
    await user.click(checkbox("Znaki"));
    expect(onChange).not.toHaveBeenCalled();
    expect(checkbox("Znaki")).toHaveAttribute("aria-disabled", "true");
    for (const row of screen.getAllByRole("checkbox")) {
      expect(row).toHaveAttribute("tabindex", "-1");
    }
  });
});
