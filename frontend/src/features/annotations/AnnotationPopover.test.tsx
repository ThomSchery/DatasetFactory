import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Annotation, Category, CategoryInput } from "../../api";
import { AnnotationPopover, type CategoryConflictRecovery } from "./AnnotationPopover";

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
  categoryConflict?: CategoryConflictRecovery | null;
  categoryError?: string | null;
  draft?: boolean;
  hasUnsavedGeometry?: boolean;
  onCategoryChange?: (categoryId: string) => void;
  onClose?: () => void;
  onCreateCategory?: (category: CategoryInput) => void;
}

function renderPopover(overrides: PopoverOverrides = {}) {
  const onCategoryChange = overrides.onCategoryChange ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();
  const onCreateCategory = overrides.onCreateCategory ?? vi.fn();
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
        categoryConflict={current.categoryConflict ?? null}
        categoryError={current.categoryError ?? null}
        disabled={false}
        draft={current.draft}
        hasUnsavedGeometry={current.hasUnsavedGeometry ?? false}
        onCategoryChange={onCategoryChange}
        onCategoryFilterChange={vi.fn()}
        onClose={onClose}
        onCreateCategory={onCreateCategory}
        onDelete={vi.fn()}
      />
    </div>
  );
  const view = render(tree(overrides));
  return {
    onCategoryChange,
    onClose,
    onCreateCategory,
    /** Re-renders with new props, the way an unsaved preview reaches the panel. */
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

  it("abandons an unsaved geometry preview on the same outside pointerdown", () => {
    const { onClose } = renderPopover({ hasUnsavedGeometry: true });

    expect(screen.getByText("Niezapisane")).toBeVisible();
    fireEvent.pointerDown(screen.getByTestId("outside"));

    expect(onClose).toHaveBeenCalledOnce();
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

  it("offers an explicit create action while keeping filter Enter inert", async () => {
    const user = userEvent.setup();
    const { onCategoryChange, onCreateCategory } = renderPopover({
      annotation: { ...annotation, category_id: "" },
      draft: true,
    });
    const field = screen.getByRole("textbox", { name: "Klasa" });

    await user.type(field, "health and armour{Enter}");

    expect(screen.getByRole("status")).toHaveTextContent(
      "Brak takiej klasy w profilu. Utwórz ją i przypisz albo porzuć box.",
    );
    expect(screen.getByRole("button", { name: "Zapisz klasę" })).toBeDisabled();
    expect(onCategoryChange).not.toHaveBeenCalled();
    expect(onCreateCategory).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Utwórz i przypisz klasę „health and armour”" }),
    );
    expect(onCreateCategory).toHaveBeenCalledWith({
      kind: "game",
      name: "health and armour",
    });
  });

  it("canonicalises a lowercase character and hides the action for an existing name", async () => {
    const user = userEvent.setup();
    renderPopover();
    const field = screen.getByRole("textbox", { name: "Klasa" });

    await user.type(field, "a");
    expect(
      screen.getByRole("button", { name: "Utwórz i przypisz klasę „A”" }),
    ).toBeVisible();

    await user.clear(field);
    await user.type(field, "  hEaLtH  ");
    expect(
      screen.queryByRole("button", { name: /Utwórz i przypisz klasę/ }),
    ).not.toBeInTheDocument();
  });

  it("preserves the filter value while showing a category error", async () => {
    const user = userEvent.setup();
    const { update } = renderPopover({
      annotation: { ...annotation, category_id: "" },
      draft: true,
    });
    const field = screen.getByRole("textbox", { name: "Klasa" });
    await user.type(field, "8");

    update({ categoryError: "Nie udało się zapisać nowej klasy." });

    expect(field).toHaveValue("8");
    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się zapisać nowej klasy.");
  });

  it("reveals and selects the backend-authoritative class after a name conflict", async () => {
    const user = userEvent.setup();
    const { onCategoryChange, update } = renderPopover();
    const field = screen.getByRole("textbox", { name: "Klasa" });
    await user.type(field, "s");

    update({
      categoryConflict: { category: { id: "health", name: "Health" }, kind: "identified" },
      categoryError: "Klasa już istnieje. Zapisz przypisanie.",
    });

    expect(field).toHaveValue("Health");
    expect(screen.getByRole("option", { name: "Health" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Zapisz klasę" }));
    expect(onCategoryChange).toHaveBeenCalledWith("health");
  });

  it("claims no selection when the conflict winner stays unknown", async () => {
    const user = userEvent.setup();
    const { onCategoryChange, update } = renderPopover();
    const field = screen.getByRole("textbox", { name: "Klasa" });
    await user.type(field, "s");

    update({
      categoryConflict: { kind: "unidentified", rejectedName: "S" },
      categoryError: "Klasa o tej nazwie już istnieje w profilu.",
    });

    // Filter relaxed, so the class blocking the name is reachable at all.
    expect(field).toHaveValue("");
    for (const option of screen.getAllByRole("option")) {
      expect(option).toHaveAttribute("aria-selected", "false");
    }
    expect(screen.getByRole("option", { name: "Health" })).toBeVisible();
    expect(screen.getByRole("option", { name: "7" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Zapisz klasę" })).toBeDisabled();
    expect(onCategoryChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("option", { name: "Health" }));
    await user.click(screen.getByRole("button", { name: "Zapisz klasę" }));
    expect(onCategoryChange).toHaveBeenCalledWith("health");
  });

  it("keeps the create action away while the conflict winner is unknown", async () => {
    const user = userEvent.setup();
    const { update } = renderPopover();
    const field = screen.getByRole("textbox", { name: "Klasa" });
    await user.type(field, "s");
    expect(screen.getByRole("button", { name: "Utwórz i przypisz klasę „S”" })).toBeVisible();

    update({ categoryConflict: { kind: "unidentified", rejectedName: "S" } });
    await user.type(field, "s");

    // This local test proves the name comparison in the popover. The integration
    // suite owns the parent wiring that keeps the rejection memory alive.
    expect(field).toHaveValue("s");
    expect(
      screen.queryByRole("button", { name: /Utwórz i przypisz klasę/ }),
    ).not.toBeInTheDocument();

    await user.clear(field);
    await user.type(field, "Mana");
    expect(
      screen.getByRole("button", { name: "Utwórz i przypisz klasę „Mana”" }),
    ).toBeVisible();

    await user.clear(field);
    await user.type(field, "s");
    expect(
      screen.queryByRole("button", { name: /Utwórz i przypisz klasę/ }),
    ).not.toBeInTheDocument();
  });

  describe("without a geometry form", () => {
    function expectGeometryFormAbsent(): void {
      for (const name of ["x", "y", "width", "height"]) {
        expect(screen.queryByRole("spinbutton", { name })).not.toBeInTheDocument();
      }
      expect(screen.queryByText(/^x 10 · y 20/)).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Zapisz geometrię" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Przerysuj bbox" }),
      ).not.toBeInTheDocument();
    }

    it("does not render geometry controls for a saved annotation", () => {
      renderPopover();

      expectGeometryFormAbsent();
    });

    it("does not render geometry controls for a fresh draft", () => {
      renderPopover({ annotation: { ...annotation, category_id: "" }, draft: true });

      expectGeometryFormAbsent();
    });

    it("marks the geometry as unsaved and names the key that saves it", () => {
      const { update } = renderPopover({ hasUnsavedGeometry: true });

      const marker = screen.getByText(/Przesunięcie bboxa nie jest jeszcze zapisane/);
      expect(marker).toBeVisible();
      expect(marker).toHaveTextContent("Enter");
      expect(screen.getByText("Niezapisane")).toBeVisible();
      expectGeometryFormAbsent();

      update({ hasUnsavedGeometry: false });

      expect(
        screen.queryByText(/Przesunięcie bboxa nie jest jeszcze zapisane/),
      ).not.toBeInTheDocument();
    });

    it("never exposes coordinate values when the preview state changes", () => {
      const { update } = renderPopover();

      update({ hasUnsavedGeometry: true });

      expectGeometryFormAbsent();
      expect(screen.getByText("Niezapisane")).toBeVisible();
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
