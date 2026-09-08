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

interface PopoverOverrides {
  annotation?: Annotation;
  draft?: boolean;
  geometryPreview?: { height: number; width: number; x: number; y: number } | null;
  invalid?: boolean;
  onCategoryChange?: (categoryId: string) => void;
  onClose?: () => void;
  onGeometryChange?: (bbox: { height: number; width: number; x: number; y: number }) => void;
}

function renderPopover(overrides: PopoverOverrides = {}) {
  const onCategoryChange = overrides.onCategoryChange ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();
  const onGeometryChange = overrides.onGeometryChange ?? vi.fn();
  const tree = (current: PopoverOverrides) => (
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
        annotation={current.annotation ?? annotation}
        busyKey={null}
        categories={categories}
        disabled={false}
        draft={current.draft}
        drawing={false}
        frameSize={{ height: 1080, width: 1920 }}
        geometryPreview={current.geometryPreview ?? null}
        invalid={current.invalid ?? false}
        onCategoryChange={onCategoryChange}
        onClose={onClose}
        onDelete={vi.fn()}
        onGeometryChange={onGeometryChange}
        onToggleDrawTarget={vi.fn()}
      />
    </div>
  );
  const view = render(tree(overrides));
  return {
    onCategoryChange,
    onClose,
    onGeometryChange,
    /** Re-renders with new props, the way a preview update reaches the panel. */
    update: (next: PopoverOverrides) => {
      view.rerender(tree({ ...overrides, ...next }));
    },
  };
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

  /*
   * FE-009-FIX1 (P1). `geometryPreview` used to feed a separate `displayedDraft`
   * while `onChange` and "Zapisz geometrię" worked on `form.draft`, so the panel
   * could show 103 and PATCH 100 — or show 103, take "555" and PATCH 1035.
   */
  describe("with an unsaved geometry preview", () => {
    const preview = { x: 103, y: 20, width: 12, height: 20 };

    it("saves exactly the geometry it displays", async () => {
      const user = userEvent.setup();
      const { onGeometryChange } = renderPopover({ geometryPreview: preview });

      expect(screen.getByRole("spinbutton", { name: "x" })).toHaveValue(103);
      expect(screen.getByText(/^x 103 · y 20/)).toBeVisible();

      await user.click(screen.getByRole("button", { name: "Zapisz geometrię" }));

      expect(onGeometryChange).toHaveBeenCalledExactlyOnceWith(preview);
    });

    it("sends the number typed into a field, never that number appended to the preview", async () => {
      const user = userEvent.setup();
      const { onGeometryChange } = renderPopover({ geometryPreview: preview });
      const xField = screen.getByRole("spinbutton", { name: "x" });

      await user.clear(xField);
      await user.type(xField, "555");

      expect(xField).toHaveValue(555);
      expect(screen.getByText(/^x 555 · y 20/)).toBeVisible();

      await user.click(screen.getByRole("button", { name: "Zapisz geometrię" }));

      expect(onGeometryChange).toHaveBeenCalledExactlyOnceWith({ ...preview, x: 555 });
      expect(onGeometryChange).not.toHaveBeenCalledWith(
        expect.objectContaining({ x: 1035 }),
      );
    });

    it("moves clean fields with a further nudge and leaves an edited one alone", async () => {
      const user = userEvent.setup();
      const { onGeometryChange, update } = renderPopover({ geometryPreview: preview });
      const yField = screen.getByRole("spinbutton", { name: "y" });

      await user.clear(yField);
      await user.type(yField, "999");
      update({ geometryPreview: { ...preview, x: 105 } });

      expect(screen.getByRole("spinbutton", { name: "x" })).toHaveValue(105);
      expect(yField).toHaveValue(999);

      await user.click(screen.getByRole("button", { name: "Zapisz geometrię" }));

      expect(onGeometryChange).toHaveBeenCalledExactlyOnceWith({
        ...preview,
        x: 105,
        y: 999,
      });
    });

    it("marks the geometry as unsaved and names the key that saves it", () => {
      const { update } = renderPopover({ geometryPreview: preview });

      const marker = screen.getByText(/Przesunięcie bboxa nie jest jeszcze zapisane/);
      expect(marker).toBeVisible();
      expect(marker).toHaveTextContent("Enter");
      expect(screen.getByText("Niezapisane")).toBeVisible();

      update({ geometryPreview: null });

      expect(
        screen.queryByText(/Przesunięcie bboxa nie jest jeszcze zapisane/),
      ).not.toBeInTheDocument();
    });
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
