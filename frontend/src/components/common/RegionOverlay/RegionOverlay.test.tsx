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
  interactionMode?: "select" | "draw";
  onDraw?: (rect: SourceRect) => void;
  readOnly?: boolean;
}

/** The overlay driven the way a feature drives it: it owns the shape list. */
function Harness({
  initialShapes = [],
  interactionMode = "select",
  onDraw,
  readOnly = false,
}: HarnessProps) {
  const [shapes, setShapes] = useState<OverlayShape[]>(initialShapes);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
      onSelect={setSelectedId}
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
