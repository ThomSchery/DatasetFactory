import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Notice } from "./Notice";

describe("Notice", () => {
  it("is a labelled status region", () => {
    render(
      <Notice title="OCR jest eksperymentalny" tone="warning">
        Sprawdź propozycje przed akceptacją.
      </Notice>,
    );

    const notice = screen.getByRole("status", { name: "OCR jest eksperymentalny" });
    expect(notice).toHaveTextContent("Sprawdź propozycje przed akceptacją.");
  });

  it("exposes no way to dismiss itself", () => {
    // FE-001-F2 §Logika.5: the OCR warning has to stay for as long as its
    // condition holds, so this component owns no state and no close control.
    const { container } = render(<Notice title="Ostrzeżenie">Treść</Notice>);

    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
