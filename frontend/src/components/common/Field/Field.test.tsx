import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SelectField } from "../SelectField";
import { TextField } from "../TextField";

/*
 * The two controls share `Field`, so the accessibility wiring is asserted once
 * per control rather than once per component: it is the wiring that regresses.
 */

describe("TextField", () => {
  it("associates label, description and error with the control", () => {
    render(
      <TextField
        description="Podaj pełną ścieżkę lokalną."
        error="Ścieżka musi być bezwzględna."
        label="Ścieżka pliku wideo"
      />,
    );

    const input = screen.getByLabelText("Ścieżka pliku wideo");
    expect(input).toHaveAccessibleDescription(
      "Podaj pełną ścieżkę lokalną. Ścieżka musi być bezwzględna.",
    );
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Ścieżka musi być bezwzględna.");
  });

  it("is valid and describes only the help text when there is no error", () => {
    render(<TextField description="Domyślnie 1000 ms." label="Interwał" />);

    const input = screen.getByLabelText("Interwał");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).toHaveAccessibleDescription("Domyślnie 1000 ms.");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("forwards native input attributes", () => {
    render(<TextField disabled inputMode="numeric" label="Interwał" value="1000" readOnly />);

    const input = screen.getByLabelText("Interwał");
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveValue("1000");
  });
});

describe("SelectField", () => {
  const options = [
    { label: "gameplay.mp4", value: "video-1" },
    { label: "runda-2.mkv", value: "video-2" },
  ];

  it("renders the options and the placeholder", () => {
    render(
      <SelectField
        label="Materiał"
        options={options}
        placeholder="Wybierz materiał"
        value=""
        onChange={() => undefined}
      />,
    );

    const select = screen.getByLabelText("Materiał");
    expect(select).toHaveValue("");
    expect(screen.getByRole("option", { name: "Wybierz materiał" })).toBeDisabled();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("marks itself invalid and announces the message", () => {
    render(
      <SelectField
        error="Wybierz materiał."
        label="Materiał"
        options={options}
        value=""
        onChange={() => undefined}
      />,
    );

    expect(screen.getByLabelText("Materiał")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Wybierz materiał.");
  });
});
