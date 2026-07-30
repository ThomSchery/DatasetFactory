import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DesignHarness } from "./DesignHarness";

describe("DesignHarness", () => {
  it("renders the complete FE-SETUP component and token catalog", () => {
    render(<DesignHarness />);

    expect(
      screen.getByRole("heading", { level: 1, name: "DatasetFactory design harness" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Paleta semantyczna" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Button" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "UiStates" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "OCR klatek" })).toHaveValue(68);
  });
});

