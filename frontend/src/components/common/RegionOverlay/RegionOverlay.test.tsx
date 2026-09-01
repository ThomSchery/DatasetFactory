import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { RegionOverlay, type OverlayShape } from "./RegionOverlay";
import type { SourceRect, SourceSize } from "./geometry";

/*
 * Tests operate on DOM elements, never on pixels: the rectangles are ARIA
 * options, so a query by role is the same thing a keyboard user reaches.
 */

const SOURCE: SourceSize = { width: 1920, height: 1080 };

/** Pretends the surface is laid out at `width` CSS px, at the source aspect. */
function layOutSurface(surface: Element, width: number, left = 0, top = 0): void {
  const height = (width * SOURCE.height) / SOURCE.width;
  vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect);
}

/** Drags from one fraction of the surface to another, in surface-relative terms. */
function dragAcross(
  surface: Element,
  from: { xRatio: number; yRatio: number },
  to: { xRatio: number; yRatio: number },
): void {
  const box = surface.getBoundingClientRect();
  const at = (ratios: { xRatio: number; yRatio: number }) => ({
    clientX: box.left + box.width * ratios.xRatio,
    clientY: box.top + box.height * ratios.yRatio,
  });

  fireEvent.pointerDown(surface, { ...at(from), pointerId: 1 });
  fireEvent.pointerMove(surface, { ...at(to), pointerId: 1 });
  fireEvent.pointerUp(surface, { ...at(to), pointerId: 1 });
}

interface HarnessProps {
  initialShapes?: OverlayShape[];
  initialSelectedId?: string | null;
  interactionMode?: "select" | "draw";
  onDraw?: (rect: SourceRect) => void;
  onSelect?: (id: string) => void;
  onShapeChange?: (id: string, rect: SourceRect) => void;
  onShapeChangeEnd?: (id: string, rect: SourceRect) => void;
  readOnly?: boolean;
}

/** The overlay driven the way a feature drives it: it owns the shape list. */
function Harness({
  initialShapes = [],
  initialSelectedId = null,
  interactionMode = "select",
  onDraw,
  onSelect,
  onShapeChange,
  onShapeChangeEnd,
  readOnly = false,
}: HarnessProps) {
  const [shapes, setShapes] = useState<OverlayShape[]>(initialShapes);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [source, setSource] = useState<SourceSize | null>(null);

  return (
    <RegionOverlay
      imageAlt="Obraz referencyjny"
      imageUrl="/api/v1/assets/references/asset-1"
      interactionMode={interactionMode}
      label="Regiony HUD"
      onDraw={
        readOnly
          ? undefined
          : (rect) => {
              onDraw?.(rect);
              setShapes((current) => [
                ...current,
                { ...rect, id: `region-${String(current.length + 1)}`, label: `Region ${String(current.length + 1)}` },
              ]);
            }
      }
      onRemove={
        readOnly
          ? undefined
          : (id) => {
              setShapes((current) => current.filter((shape) => shape.id !== id));
              setSelectedId((current) => (current === id ? null : current));
            }
      }
      onSelect={(id) => {
        onSelect?.(id);
        setSelectedId(id);
      }}
      onShapeChange={
        onShapeChange === undefined && onShapeChangeEnd === undefined
          ? undefined
          : (id, rect) => {
              onShapeChange?.(id, rect);
              setShapes((current) =>
                current.map((shape) => (shape.id === id ? { ...shape, ...rect } : shape)),
              );
            }
      }
      onShapeChangeEnd={onShapeChangeEnd}
      onSourceResolved={setSource}
      selectedId={selectedId}
      shapes={shapes}
      source={source}
    />
  );
}

/** Renders the harness and completes the image load with real natural dimensions. */
function renderOverlay(props: HarnessProps = {}) {
  const result = render(<Harness {...props} />);
  const image = screen.getByAltText("Obraz referencyjny");
  Object.defineProperty(image, "naturalWidth", { configurable: true, value: SOURCE.width });
  Object.defineProperty(image, "naturalHeight", { configurable: true, value: SOURCE.height });
  fireEvent.load(image);
  return result;
}

function surfaceElement(): HTMLElement {
  return screen.getByRole("listbox", { name: "Regiony HUD" });
}

function shapeGeometry(option: Element): SourceRect {
  const rect = option.querySelector(".df-region-overlay__shape-fill");
  return {
    x: Number(rect?.getAttribute("x")),
    y: Number(rect?.getAttribute("y")),
    width: Number(rect?.getAttribute("width")),
    height: Number(rect?.getAttribute("height")),
  };
}

describe("the drawing surface", () => {
  it("waits for the natural dimensions before offering a coordinate system", () => {
    render(<Harness />);

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByAltText("Obraz referencyjny")).toHaveAttribute(
      "src",
      "/api/v1/assets/references/asset-1",
    );
  });

  it("derives its viewBox from the natural dimensions", () => {
    renderOverlay();

    expect(surfaceElement()).toHaveAttribute("viewBox", "0 0 1920 1080");
  });

  it("turns a drag into a region in source coordinates", () => {
    const onDraw = vi.fn();
    renderOverlay({ onDraw });
    const surface = surfaceElement();
    layOutSurface(surface, 960);

    dragAcross(surface, { xRatio: 0.25, yRatio: 0.25 }, { xRatio: 0.75, yRatio: 0.5 });

    expect(onDraw).toHaveBeenCalledWith({ x: 480, y: 270, width: 960, height: 270 });
  });

  it("ignores a press that never moved", () => {
    const onDraw = vi.fn();
    renderOverlay({ onDraw });
    const surface = surfaceElement();
    layOutSurface(surface, 960);

    dragAcross(surface, { xRatio: 0.5, yRatio: 0.5 }, { xRatio: 0.5, yRatio: 0.5 });

    expect(onDraw).not.toHaveBeenCalled();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("draws nothing when the surface is read-only", () => {
    renderOverlay({ readOnly: true });
    const surface = surfaceElement();
    layOutSurface(surface, 960);

    dragAcross(surface, { xRatio: 0.1, yRatio: 0.1 }, { xRatio: 0.6, yRatio: 0.6 });

    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("preserves F3 selection mode by ignoring a drag that starts on a shape", () => {
    const onDraw = vi.fn();
    renderOverlay({
      initialShapes: [
        { id: "existing", label: "Istniejący", x: 100, y: 100, width: 900, height: 500 },
      ],
      onDraw,
    });
    const surface = surfaceElement();
    layOutSurface(surface, 960);
    const box = surface.getBoundingClientRect();
    const fill = screen.getByRole("option").querySelector(".df-region-overlay__shape-fill");
    expect(fill).not.toBeNull();

    fireEvent.pointerDown(fill as Element, {
      clientX: box.left + box.width * 0.25,
      clientY: box.top + box.height * 0.25,
      pointerId: 1,
    });
    fireEvent.pointerMove(surface, {
      clientX: box.left + box.width * 0.75,
      clientY: box.top + box.height * 0.75,
      pointerId: 1,
    });
    fireEvent.pointerUp(surface, {
      clientX: box.left + box.width * 0.75,
      clientY: box.top + box.height * 0.75,
      pointerId: 1,
    });

    expect(onDraw).not.toHaveBeenCalled();
  });

  it("lets explicit draw mode start an overlapping gesture inside a shape", () => {
    const onDraw = vi.fn();
    renderOverlay({
      initialShapes: [
        { id: "existing", label: "Istniejący", x: 100, y: 100, width: 900, height: 500 },
      ],
      interactionMode: "draw",
      onDraw,
    });
    const surface = surfaceElement();
    layOutSurface(surface, 960);
    const box = surface.getBoundingClientRect();
    const fill = screen.getByRole("option").querySelector(".df-region-overlay__shape-fill");
    expect(fill).not.toBeNull();

    fireEvent.pointerDown(fill as Element, {
      clientX: box.left + box.width * 0.25,
      clientY: box.top + box.height * 0.25,
      pointerId: 1,
    });
    fireEvent.pointerMove(surface, {
      clientX: box.left + box.width * 0.75,
      clientY: box.top + box.height * 0.5,
      pointerId: 1,
    });
    fireEvent.pointerUp(surface, {
      clientX: box.left + box.width * 0.75,
      clientY: box.top + box.height * 0.5,
      pointerId: 1,
    });

    expect(onDraw).toHaveBeenCalledWith({ x: 480, y: 270, width: 960, height: 270 });
  });

  it.each(["capturing SVG", "origin shape"] as const)(
    "selects a draw-mode shape exactly once when click reaches the %s",
    (clickTarget) => {
      const onDraw = vi.fn();
      const onSelect = vi.fn();
      renderOverlay({
        initialShapes: [
          { id: "existing", label: "Istniejący", x: 100, y: 100, width: 900, height: 500 },
        ],
        interactionMode: "draw",
        onDraw,
        onSelect,
      });
      const surface = surfaceElement();
      layOutSurface(surface, 960);
      const box = surface.getBoundingClientRect();
      const fill = screen.getByRole("option").querySelector(".df-region-overlay__shape-fill");
      expect(fill).not.toBeNull();
      const point = {
        clientX: box.left + box.width * 0.25,
        clientY: box.top + box.height * 0.25,
        pointerId: 1,
      };

      fireEvent.pointerDown(fill as Element, point);
      fireEvent.pointerUp(surface, point);
      fireEvent.click(clickTarget === "capturing SVG" ? surface : (fill as Element), {
        detail: 1,
      });

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith("existing");
      expect(onDraw).not.toHaveBeenCalled();
    },
  );
});

/*
 * The Done Criterion: a rectangle drawn at one viewport size keeps identical
 * source coordinates after a resize.
 */
describe("coordinates survive a resize", () => {
  it("keeps the drawn geometry byte-identical when the window changes size", () => {
    renderOverlay();
    const surface = surfaceElement();

    layOutSurface(surface, 1440);
    dragAcross(surface, { xRatio: 0.25, yRatio: 0.25 }, { xRatio: 0.75, yRatio: 0.75 });

    const drawnAtWide = shapeGeometry(screen.getByRole("option"));
    expect(drawnAtWide).toEqual({ x: 480, y: 270, width: 960, height: 540 });

    // The window shrinks. Nothing about the region may move.
    layOutSurface(surface, 640);

    expect(shapeGeometry(screen.getByRole("option"))).toEqual(drawnAtWide);
    expect(surface).toHaveAttribute("viewBox", "0 0 1920 1080");
  });

  it("gives the same source rectangle for the same gesture at a different size", () => {
    const wide = vi.fn();
    renderOverlay({ onDraw: wide });
    const wideSurface = surfaceElement();
    layOutSurface(wideSurface, 1440);
    dragAcross(wideSurface, { xRatio: 0.1, yRatio: 0.2 }, { xRatio: 0.6, yRatio: 0.8 });

    // A second overlay laid out at a very different width, and offset in the
    // viewport, so nothing can accidentally agree by sharing an origin.
    const narrow = vi.fn();
    render(<Harness onDraw={narrow} />);
    const narrowImage = screen.getAllByAltText("Obraz referencyjny")[1];
    Object.defineProperty(narrowImage, "naturalWidth", { configurable: true, value: SOURCE.width });
    Object.defineProperty(narrowImage, "naturalHeight", { configurable: true, value: SOURCE.height });
    fireEvent.load(narrowImage);
    const narrowSurface = screen.getAllByRole("listbox", { name: "Regiony HUD" })[1];
    layOutSurface(narrowSurface, 480, 137, 89);
    dragAcross(narrowSurface, { xRatio: 0.1, yRatio: 0.2 }, { xRatio: 0.6, yRatio: 0.8 });

    expect(narrow.mock.calls[0]).toEqual(wide.mock.calls[0]);
  });
});

/*
 * The other Done Criterion: a region is selectable and removable with the
 * keyboard alone. FE-001-F4 inherits this for boxes a dozen pixels wide.
 */
describe("keyboard reach", () => {
  const shapes: OverlayShape[] = [
    { id: "r1", label: "Pasek zdrowia", x: 10, y: 20, width: 100, height: 40 },
    { id: "r2", label: "Licznik amunicji", x: 200, y: 300, width: 120, height: 60 },
    { id: "r3", label: "Zegar rundy", x: 800, y: 40, width: 90, height: 30 },
  ];

  it("exposes the general error tone without changing source geometry", () => {
    renderOverlay({
      initialShapes: [
        { ...shapes[0]!, tone: "error" },
      ],
    });

    const option = screen.getByRole("option");
    expect(option).toHaveClass("df-region-overlay__shape--error");
    expect(shapeGeometry(option)).toEqual({ x: 10, y: 20, width: 100, height: 40 });
  });

  it("exposes every rectangle as an option with its geometry in the name", () => {
    renderOverlay({ initialShapes: shapes });

    expect(
      screen.getByRole("option", {
        name: "Pasek zdrowia: x 10, y 20, szerokość 100, wysokość 40",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("selects and removes a region without a single click", async () => {
    const user = userEvent.setup();
    renderOverlay({ initialShapes: shapes });

    // Tab reaches the set through its single roving stop.
    await user.tab();
    expect(screen.getAllByRole("option")[0]).toHaveFocus();

    await user.keyboard("{ArrowRight}{ArrowRight}");
    const third = screen.getAllByRole("option")[2];
    expect(third).toHaveFocus();
    expect(third).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Delete}");

    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(
      screen.queryByRole("option", { name: /Zegar rundy/ }),
    ).not.toBeInTheDocument();
  });

  it("removes with Backspace as well, for keyboards without a Delete key", async () => {
    const user = userEvent.setup();
    renderOverlay({ initialShapes: shapes });

    await user.tab();
    await user.keyboard("{Backspace}");

    expect(screen.queryByRole("option", { name: /Pasek zdrowia/ })).not.toBeInTheDocument();
  });

  it("walks to the ends with Home and End", async () => {
    const user = userEvent.setup();
    renderOverlay({ initialShapes: shapes });

    await user.tab();
    await user.keyboard("{End}");
    expect(screen.getAllByRole("option")[2]).toHaveFocus();

    await user.keyboard("{Home}");
    expect(screen.getAllByRole("option")[0]).toHaveFocus();
  });

  it("keeps exactly one tab stop, so a large set does not trap the keyboard", async () => {
    const user = userEvent.setup();
    renderOverlay({ initialShapes: shapes });

    const tabbable = screen
      .getAllByRole("option")
      .filter((option) => option.getAttribute("tabindex") === "0");
    expect(tabbable).toHaveLength(1);

    await user.tab();
    await user.keyboard("{ArrowRight}");

    const afterMove = screen
      .getAllByRole("option")
      .filter((option) => option.getAttribute("tabindex") === "0");
    expect(afterMove).toHaveLength(1);
    expect(afterMove[0]).toHaveFocus();
  });

  it("marks selection with aria-selected rather than colour alone", async () => {
    const user = userEvent.setup();
    renderOverlay({ initialShapes: shapes });

    const [first] = screen.getAllByRole("option");
    expect(first).toHaveAttribute("aria-selected", "false");

    await user.click(first);

    expect(first).toHaveAttribute("aria-selected", "true");
  });

  it("selects the smaller bbox even when a larger overlapping bbox is painted last", () => {
    const onSelect = vi.fn();
    renderOverlay({
      initialShapes: [
        { id: "character", label: "Pojedyncza cyfra", x: 120, y: 110, width: 19, height: 40 },
        { id: "word", label: "Dwie cyfry", x: 100, y: 100, width: 101, height: 57 },
      ],
      onSelect,
    });
    const surface = surfaceElement();
    layOutSurface(surface, 960);
    const largeOption = screen.getByRole("option", { name: /Dwie cyfry/ });
    const largeFill = largeOption.querySelector(".df-region-overlay__shape-fill");
    expect(largeFill).not.toBeNull();

    // Source (130, 130) lies inside both boxes. The event is deliberately sent
    // to the larger, later-painted element to prove DOM order is irrelevant.
    fireEvent.click(largeFill as Element, { clientX: 65, clientY: 65 });

    expect(onSelect).toHaveBeenCalledWith("character");
    expect(screen.getByRole("option", { name: /Pojedyncza cyfra/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

describe("direct editing in source coordinates", () => {
  const selected: OverlayShape = {
    id: "selected",
    label: "Wybrany bbox",
    x: 100,
    y: 120,
    width: 40,
    height: 32,
  };

  it("moves the selected bbox and keeps the edited geometry after a resize", () => {
    const onShapeChangeEnd = vi.fn();
    renderOverlay({
      initialSelectedId: selected.id,
      initialShapes: [selected],
      onShapeChangeEnd,
    });
    const surface = surfaceElement();
    layOutSurface(surface, 960);
    const option = screen.getByRole("option");
    const overlappingHandle = option.querySelector(
      '[data-overlay-handle="south-east"] .df-region-overlay__shape-handle-hit',
    );
    expect(overlappingHandle).not.toBeNull();

    // The 32 CSS-pixel handle target overlaps this small bbox's centre. A real
    // browser therefore targets the handle element there, but the interior
    // gesture must still move instead of accidentally resizing south-east.
    fireEvent.pointerDown(overlappingHandle as Element, {
      clientX: 60,
      clientY: 68,
      pointerId: 1,
    });
    fireEvent.pointerMove(surface, { clientX: 155, clientY: 115, pointerId: 1 });

    expect(shapeGeometry(option)).toEqual({ x: 290, y: 214, width: 40, height: 32 });

    fireEvent.pointerUp(surface, { clientX: 155, clientY: 115, pointerId: 1 });
    expect(onShapeChangeEnd).toHaveBeenCalledWith("selected", {
      x: 290,
      y: 214,
      width: 40,
      height: 32,
    });

    layOutSurface(surface, 480, 137, 89);
    expect(shapeGeometry(option)).toEqual({ x: 290, y: 214, width: 40, height: 32 });
    expect(surface).toHaveAttribute("viewBox", "0 0 1920 1080");
  });

  it("resizes from a fixed-size south-east handle", () => {
    const onShapeChangeEnd = vi.fn();
    renderOverlay({
      initialSelectedId: selected.id,
      initialShapes: [selected],
      onShapeChangeEnd,
    });
    const surface = surfaceElement();
    layOutSurface(surface, 960);
    const option = screen.getByRole("option");
    const handle = option.querySelector(
      '[data-overlay-handle="south-east"] .df-region-overlay__shape-handle-hit',
    );
    expect(handle).not.toBeNull();

    fireEvent.pointerDown(handle as Element, { clientX: 70, clientY: 76, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 90, clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 90, clientY: 90, pointerId: 1 });

    expect(onShapeChangeEnd).toHaveBeenCalledWith("selected", {
      x: 100,
      y: 120,
      width: 80,
      height: 60,
    });
    expect(shapeGeometry(option)).toEqual({ x: 100, y: 120, width: 80, height: 60 });
  });

  /*
   * Every other resize test presses the handle's exact centre, so a zero grab
   * offset was the only case ever covered — which is how an absolute corner
   * assignment survived two review rounds. This one grabs beside the corner on
   * purpose and pins the bbox that comes out.
   */
  it("resizes by how far the pointer travelled, not by where the handle was grabbed", () => {
    const onShapeChange = vi.fn();
    const onShapeChangeEnd = vi.fn();
    renderOverlay({
      initialSelectedId: selected.id,
      initialShapes: [selected],
      onShapeChange,
      onShapeChangeEnd,
    });
    const surface = surfaceElement();
    // 960 CSS px for a 1920 px source: one CSS pixel is two source pixels.
    layOutSurface(surface, 960);
    const option = screen.getByRole("option");
    const handle = option.querySelector(
      '[data-overlay-handle="south-east"] .df-region-overlay__shape-handle-hit',
    );
    expect(handle).not.toBeNull();

    // The south-east corner is (140, 152); this grab misses it by 6 source
    // pixels on both axes.
    fireEvent.pointerDown(handle as Element, { clientX: 73, clientY: 79, pointerId: 1 });

    // Holding the handle is not an edit: nothing may change before the pointer
    // moves, least of all by the size of the miss.
    expect(onShapeChange).not.toHaveBeenCalled();
    expect(shapeGeometry(option)).toEqual({ x: 100, y: 120, width: 40, height: 32 });

    fireEvent.pointerMove(surface, { clientX: 78, clientY: 83, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 78, clientY: 83, pointerId: 1 });

    // The pointer travelled +10 and +8 source pixels, so the bbox grows by
    // exactly that. Dropping the offset would add the 6 px miss on top and
    // give 56×46.
    expect(onShapeChangeEnd).toHaveBeenCalledWith("selected", {
      x: 100,
      y: 120,
      width: 50,
      height: 40,
    });
    expect(shapeGeometry(option)).toEqual({ x: 100, y: 120, width: 50, height: 40 });
  });

  /*
   * A reading the size of the ones this screen actually edits. Both gestures
   * have to exist on it: the interior moves even when the event was aimed at a
   * handle, and the corner still resizes.
   */
  describe("a bbox the size of a real OCR reading", () => {
    const reading: OverlayShape = {
      id: "selected",
      label: "Odczyt OCR",
      x: 300,
      y: 260,
      width: 19,
      height: 40,
    };

    function renderReading() {
      const onShapeChangeEnd = vi.fn();
      renderOverlay({
        initialSelectedId: reading.id,
        initialShapes: [reading],
        onShapeChangeEnd,
      });
      const surface = surfaceElement();
      layOutSurface(surface, 960);
      const option = screen.getByRole("option");
      const handle = option.querySelector(
        '[data-overlay-handle="south-east"] .df-region-overlay__shape-handle-hit',
      );
      expect(handle).not.toBeNull();
      return { handle: handle as Element, onShapeChangeEnd, option, surface };
    }

    it("moves from a point inside it, even when the event reached a handle", () => {
      const { handle, onShapeChangeEnd, option, surface } = renderReading();

      // Source (309, 280): strictly inside the 19×40 box.
      fireEvent.pointerDown(handle, { clientX: 154.5, clientY: 140, pointerId: 1 });
      fireEvent.pointerMove(surface, { clientX: 162, clientY: 152.5, pointerId: 1 });
      fireEvent.pointerUp(surface, { clientX: 162, clientY: 152.5, pointerId: 1 });

      expect(onShapeChangeEnd).toHaveBeenCalledWith("selected", {
        x: 315,
        y: 285,
        width: 19,
        height: 40,
      });
      expect(shapeGeometry(option)).toEqual({ x: 315, y: 285, width: 19, height: 40 });
    });

    it("resizes from a point diagonally outside its south-east corner", () => {
      const { handle, onShapeChangeEnd, option, surface } = renderReading();

      // Source (322, 302): three and two pixels past the corner (319, 300),
      // inside the corner target that `handleTargetRect` puts there.
      fireEvent.pointerDown(handle, { clientX: 161, clientY: 151, pointerId: 1 });
      fireEvent.pointerMove(surface, { clientX: 165, clientY: 160, pointerId: 1 });
      fireEvent.pointerUp(surface, { clientX: 165, clientY: 160, pointerId: 1 });

      expect(onShapeChangeEnd).toHaveBeenCalledWith("selected", {
        x: 300,
        y: 260,
        width: 27,
        height: 58,
      });
      expect(shapeGeometry(option)).toEqual({ x: 300, y: 260, width: 27, height: 58 });
    });
  });

});

describe("the picture itself", () => {
  it("reports the natural dimensions it decoded, not the displayed size", () => {
    const onSourceResolved = vi.fn();
    render(
      <RegionOverlay
        imageAlt="Obraz referencyjny"
        imageUrl="/api/v1/assets/references/asset-1"
        label="Regiony HUD"
        onSourceResolved={onSourceResolved}
        source={null}
      />,
    );

    const image = screen.getByAltText("Obraz referencyjny");
    Object.defineProperty(image, "naturalWidth", { configurable: true, value: 2560 });
    Object.defineProperty(image, "naturalHeight", { configurable: true, value: 1440 });
    fireEvent.load(image);

    expect(onSourceResolved).toHaveBeenCalledWith({ width: 2560, height: 1440 });
  });

  it("reports a failed load so the screen can explain it", () => {
    const onImageError = vi.fn();
    render(
      <RegionOverlay
        imageAlt="Obraz referencyjny"
        imageUrl="/api/v1/assets/references/missing"
        label="Regiony HUD"
        onImageError={onImageError}
        source={null}
      />,
    );

    fireEvent.error(screen.getByAltText("Obraz referencyjny"));

    expect(onImageError).toHaveBeenCalledTimes(1);
  });

  it("stops accepting input while disabled", () => {
    const onDraw = vi.fn();
    render(
      <RegionOverlay
        disabled
        imageAlt="Obraz referencyjny"
        imageUrl="/api/v1/assets/references/asset-1"
        label="Regiony HUD"
        onDraw={onDraw}
        shapes={[{ id: "r1", label: "Pasek zdrowia", x: 10, y: 20, width: 100, height: 40 }]}
        source={SOURCE}
      />,
    );
    const surface = surfaceElement();
    layOutSurface(surface, 960);

    dragAcross(surface, { xRatio: 0.1, yRatio: 0.1 }, { xRatio: 0.5, yRatio: 0.5 });

    expect(onDraw).not.toHaveBeenCalled();
    expect(within(surface).getByRole("option")).toHaveAttribute("tabindex", "-1");
  });
});
