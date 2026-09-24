import { fireEvent, render, screen, within } from "@testing-library/react";
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
  initialOpen = true,
  onChange,
  onConfirm,
}: {
  initial?: readonly string[];
  initialOpen?: boolean;
  mode: "single" | "multiple";
  onChange?: (selection: readonly string[]) => void;
  onConfirm?: (selection: readonly string[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<readonly string[]>(initial);
  return (
    <GroupedOptionList
      defaultOpen={initialOpen}
      emptyMessage="Nic nie pasuje."
      filterLabel="Filtruj klasy"
      groups={GROUPS}
      label="Klasy profilu"
      mode={mode}
      onChange={(selection) => {
        setSelectedIds(selection);
        onChange?.(selection);
      }}
      onConfirm={onConfirm}
      selectedIds={selectedIds}
    />
  );
}

function checkbox(name: string): HTMLElement {
  return screen.getByRole("checkbox", { name });
}

describe("GroupedOptionList in multiple mode", () => {
  it("renders a collapsed field frame and expands the connected list with its chevron", async () => {
    const user = userEvent.setup();
    render(<Harness initialOpen={false} mode="multiple" />);

    const filter = screen.getByLabelText("Filtruj klasy");
    const control = filter.closest(".df-grouped-options__control");
    const toggle = screen.getByRole("button", { name: "Rozwiń listę Klasy profilu" });

    expect(control).not.toBeNull();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group", { name: "Klasy profilu" })).not.toBeInTheDocument();

    await user.click(toggle);

    expect(screen.getByRole("button", { name: "Zwiń listę Klasy profilu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("group", { name: "Klasy profilu" })).toBeVisible();
  });

  it("renders selected classes as tags, removes only one, and clears all without touching the filter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onConfirm = vi.fn();
    render(
      <Harness
        initial={["score", "timer"]}
        mode="multiple"
        onChange={onChange}
        onConfirm={onConfirm}
      />,
    );
    const filter = screen.getByLabelText("Filtruj klasy");

    await user.type(filter, "sco");
    await user.click(screen.getByRole("button", { name: "Usuń klasę Timer z zaznaczenia" }));

    expect(onChange).toHaveBeenLastCalledWith(["score"]);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(filter).toHaveValue("sco");
    expect(screen.getByRole("button", { name: "Zwiń listę Klasy profilu" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Usuń klasę Timer z zaznaczenia" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Wyczyść zaznaczone klasy" }));

    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(filter).toHaveValue("sco");
    expect(
      screen.queryByRole("button", { name: "Usuń klasę Score z zaznaczenia" }),
    ).not.toBeInTheDocument();
  });

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

  it("lets filtering reveal a result from a collapsed group, then restores the collapse", async () => {
    const user = userEvent.setup();
    render(<Harness mode="single" />);

    await user.click(screen.getByRole("button", { name: "Zwiń grupę Znaki" }));
    expect(screen.getByText("2")).not.toBeVisible();

    const filter = screen.getByLabelText("Filtruj klasy");
    await user.type(filter, "2");
    expect(screen.getByRole("option", { name: "2" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Zwiń grupę Znaki" })).toBeDisabled();

    await user.clear(filter);
    expect(screen.getByText("2")).not.toBeVisible();
  });
});

describe("GroupedOptionList in single mode", () => {
  it("does not render selection tags in single mode", () => {
    render(<Harness initial={["score"]} mode="single" />);

    expect(
      screen.queryByRole("button", { name: "Usuń klasę Score z zaznaczenia" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Wyczyść zaznaczone klasy" }),
    ).not.toBeInTheDocument();
  });

  it("skips disabled disclosure controls while filtering with the keyboard", async () => {
    const user = userEvent.setup();
    render(<Harness mode="single" />);
    const filter = screen.getByLabelText("Filtruj klasy");

    await user.type(filter, "znak");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: "0" })).toHaveFocus();

    await user.keyboard("{End}");
    expect(screen.getByRole("option", { name: "2" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("option", { name: "0" })).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    expect(filter).toHaveFocus();
  });

  it("ignores Enter in an empty filter until a row is explicitly focused", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onConfirm = vi.fn();
    render(<Harness mode="single" onChange={onChange} onConfirm={onConfirm} />);
    const filter = screen.getByLabelText("Filtruj klasy");

    filter.focus();
    await user.keyboard("{Enter}");

    expect(onChange).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    for (const option of screen.getAllByRole("option")) {
      expect(option).toHaveAttribute("aria-selected", "false");
    }

    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith(["score"]);
    expect(onConfirm).toHaveBeenCalledWith(["score"]);
  });

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
        defaultOpen
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

  it("limits filter text by Unicode code points rather than UTF-16 units", () => {
    const onFilterChange = vi.fn();
    render(
      <GroupedOptionList
        emptyMessage="Nic nie pasuje."
        filterLabel="Filtruj klasy"
        filterMaxCodePoints={200}
        groups={GROUPS}
        label="Klasy profilu"
        mode="single"
        onChange={vi.fn()}
        onFilterChange={onFilterChange}
        selectedIds={[]}
      />,
    );
    const filter = screen.getByLabelText("Filtruj klasy");

    fireEvent.change(filter, { target: { value: "🧩".repeat(101) } });
    expect(filter).toHaveValue("🧩".repeat(101));

    fireEvent.change(filter, { target: { value: "🧩".repeat(201) } });
    expect(filter).toHaveValue("🧩".repeat(200));
    expect(onFilterChange).toHaveBeenLastCalledWith("🧩".repeat(200));
  });
});
