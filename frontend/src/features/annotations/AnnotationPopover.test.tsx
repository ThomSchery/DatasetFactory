import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Annotation, Category } from "../../api";
import { AnnotationPopover } from "./AnnotationPopover";

const annotation: Annotation = {
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
};

const categories: Category[] = [
  { id: "digit-7", kind: "character", name: "7" },
  { id: "health", kind: "game", name: "Health" },
];

function renderPopover(overrides: {
  annotation?: Annotation;
  draft?: boolean;
  invalid?: boolean;
  onCategoryChange?: (categoryId: string) => void;
  onClose?: () => void;
  onGeometryChange?: (bbox: { height: number; width: number; x: number; y: number }) => void;
} = {}) {
  const onCategoryChange = overrides.onCategoryChange ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();
  const onGeometryChange = overrides.onGeometryChange ?? vi.fn();
  render(
    <div>
      {/* The surface the popover floats over, in the shape the overlay gives
          it: a group per shape, carrying the id the popover matches on. */}
      <div data-testid="outside">
        <div data-overlay-shape-id={annotation.id}>
          <span data-testid="own-shape-fill" />
        </div>
        <div data-overlay-shape-id="ann-2" data-testid="other-shape" />
      </div>
      <AnnotationPopover
        annotation={overrides.annotation ?? annotation}
        busyKey={null}
        categories={categories}
        disabled={false}
        draft={overrides.draft}
        drawing={false}
        frameSize={{ height: 1080, width: 1920 }}
        geometryPreview={null}
        invalid={overrides.invalid ?? false}
        onCategoryChange={onCategoryChange}
        onClose={onClose}
        onDelete={vi.fn()}
        onGeometryChange={onGeometryChange}
        onToggleDrawTarget={vi.fn()}
      />
    </div>,
  );
  return { onCategoryChange, onClose, onGeometryChange };
}

describe("AnnotationPopover", () => {
  it("filters profile classes and saves the active result with Enter", async () => {
    const user = userEvent.setup();
    const { onCategoryChange } = renderPopover();
    const field = screen.getByRole("textbox", { name: "Klasa" });

    await user.clear(field);
    await user.type(field, "hea{Enter}");

    expect(onCategoryChange).toHaveBeenCalledWith("health");
  });

  it("closes on a pointerdown outside itself and saves nothing", async () => {
    const { onCategoryChange, onClose } = renderPopover();

    fireEvent.pointerDown(screen.getByTestId("outside"));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onCategoryChange).not.toHaveBeenCalled();
  });

  it("abandons an edited geometry draft on the same outside pointerdown", async () => {
    const user = userEvent.setup();
    const { onClose, onGeometryChange } = renderPopover({ invalid: true });
    const xField = screen.getByRole("spinbutton", { name: "x" });

    await user.clear(xField);
    await user.type(xField, "11");
    fireEvent.pointerDown(screen.getByTestId("outside"));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onGeometryChange).not.toHaveBeenCalled();
  });

  it("stays open while the pointer works inside it", async () => {
    const { onClose } = renderPopover();

    fireEvent.pointerDown(screen.getByRole("textbox", { name: "Klasa" }));
    fireEvent.pointerDown(screen.getByRole("option", { name: "Health" }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("treats the bbox it edits as part of itself, so a drag on it is not a dismissal", () => {
    const { onClose } = renderPopover();

    fireEvent.pointerDown(screen.getByTestId("own-shape-fill"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.pointerDown(screen.getByTestId("other-shape"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("has no Escape hint and no Escape handler left", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPopover();

    await user.type(screen.getByRole("textbox", { name: "Klasa" }), "{Escape}");
    await user.keyboard("{Escape}");

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText(/Esc/)).not.toBeInTheDocument();
  });

  it("names an unmatched draft class explicitly and cannot save it", async () => {
    const user = userEvent.setup();
    const { onCategoryChange } = renderPopover({
      annotation: { ...annotation, category_id: "" },
      draft: true,
    });
    const field = screen.getByRole("textbox", { name: "Klasa" });

    await user.type(field, "health and armour{Enter}");

    expect(screen.getByRole("status")).toHaveTextContent(
      "Brak takiej klasy w profilu. Wybierz istniejącą klasę albo porzuć box.",
    );
    expect(screen.getByRole("button", { name: "Zapisz klasę" })).toBeDisabled();
    expect(onCategoryChange).not.toHaveBeenCalled();
  });

  it("leaves a fresh draft with no class chosen and no way to save one by accident", async () => {
    const user = userEvent.setup();
    const { onCategoryChange } = renderPopover({
      annotation: { ...annotation, category_id: "" },
      draft: true,
    });

    expect(screen.getByRole("button", { name: "Zapisz klasę" })).toBeDisabled();
    for (const option of screen.getAllByRole("option")) {
      expect(option).toHaveAttribute("aria-selected", "false");
    }

    // Walking the list is not choosing from it.
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("button", { name: "Zapisz klasę" })).toBeDisabled();
    expect(onCategoryChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("option", { name: "Health" }));
    expect(screen.getByRole("button", { name: "Zapisz klasę" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Zapisz klasę" }));
    expect(onCategoryChange).toHaveBeenCalledWith("health");
  });
});
