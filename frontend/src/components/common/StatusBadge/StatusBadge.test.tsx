import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("renders its label", () => {
    render(<StatusBadge>Poza v1</StatusBadge>);
    expect(screen.getByText("Poza v1")).toBeInTheDocument();
  });

  it("applies the requested tone", () => {
    render(<StatusBadge tone="error">Błąd</StatusBadge>);
    expect(screen.getByText("Błąd")).toHaveClass("df-status-badge--error");
  });

  it("defaults to the neutral tone", () => {
    render(<StatusBadge>Gotowe</StatusBadge>);
    expect(screen.getByText("Gotowe")).toHaveClass("df-status-badge--neutral");
  });

  it("carries a screen reader prefix so meaning is not colour-only", () => {
    render(
      <StatusBadge srLabel="Zakres:" tone="muted">
        Poza v1
      </StatusBadge>,
    );
    expect(screen.getByText(/Zakres:/)).toBeInTheDocument();
  });

  it("is not interactive", () => {
    render(<StatusBadge>Poza v1</StatusBadge>);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
