import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Annotation, Category } from "../../api";
import { ClassList } from "./ClassList";

const categories: Category[] = [
  { id: "digit-7", kind: "character", name: "7" },
  { id: "score", kind: "game", name: "Score" },
];

const annotations: Annotation[] = [
  {
    category_id: "digit-7",
    confidence: 0.99,
    height: 20,
    id: "ann-1",
    observation_id: "obs-1",
    source: "ocr",
    status: "proposed",
    version: 1,
    width: 12,
    x: 10,
    y: 20,
  },
  {
    category_id: "digit-7",
    confidence: 0.97,
    height: 20,
    id: "ann-2",
    observation_id: "obs-2",
    source: "ocr",
    status: "proposed",
    version: 1,
    width: 12,
    x: 30,
    y: 20,
  },
  {
    category_id: "score",
    confidence: null,
    height: 40,
    id: "ann-3",
    observation_id: null,
    source: "manual",
    status: "proposed",
    version: 1,
    width: 80,
    x: 50,
    y: 10,
  },
];

describe("ClassList", () => {
  it("groups classes with counts and cycles one shared selection through matching annotations", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const view = render(
      <ClassList
        annotations={annotations}
        categories={categories}
        disabled={false}
        onSelect={onSelect}
        selectedId={null}
      />,
    );

    expect(screen.getByRole("button", { name: "Klasa 7, 2 anotacji" })).toBeVisible();
    expect(screen.getByText("OCR")).toBeVisible();
    expect(screen.getByText("Ręczna")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Klasa 7, 2 anotacji" }));
    expect(onSelect).toHaveBeenLastCalledWith("ann-1");

    view.rerender(
      <ClassList
        annotations={annotations}
        categories={categories}
        disabled={false}
        onSelect={onSelect}
        selectedId="ann-1"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Klasa 7, 2 anotacji" }));
    expect(onSelect).toHaveBeenLastCalledWith("ann-2");
  });
});
