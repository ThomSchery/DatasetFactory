import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "../StatusBadge";
import { DataList } from "../DataList";
import { Panel } from "./Panel";

describe("Panel", () => {
  it("is a region labelled by its own heading", () => {
    render(
      <Panel description="Stan zależności lokalnych." eyebrow="System" title="Stan systemu">
        <p>Treść</p>
      </Panel>,
    );

    const region = screen.getByRole("region", { name: "Stan systemu" });
    expect(region).toHaveTextContent("Stan zależności lokalnych.");
    expect(screen.getByRole("heading", { level: 2, name: "Stan systemu" })).toBeInTheDocument();
  });

  it("renders an aside next to the heading", () => {
    render(
      <Panel aside={<StatusBadge tone="brand">Aktywny</StatusBadge>} title="Run">
        <p>Treść</p>
      </Panel>,
    );

    expect(screen.getByRole("region", { name: "Run" })).toHaveTextContent("Aktywny");
  });
});

describe("DataList", () => {
  it("pairs every label with its value", () => {
    const { container } = render(
      <DataList
        items={[
          { label: "Projekt", value: "DatasetFactory" },
          { hint: "Liczy klatki istniejące.", label: "Klatki", value: 45 },
        ]}
      />,
    );

    expect(container.querySelectorAll("dt")).toHaveLength(2);
    expect(container.querySelectorAll("dd")).toHaveLength(2);
    expect(screen.getByText("Projekt").nextElementSibling).toHaveTextContent("DatasetFactory");
    expect(screen.getByText("Klatki").nextElementSibling).toHaveTextContent(
      "Liczy klatki istniejące.",
    );
  });
});
