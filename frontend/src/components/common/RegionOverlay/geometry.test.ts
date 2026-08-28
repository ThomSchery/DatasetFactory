import { describe, expect, it } from "vitest";

import {
  clampRectToSource,
  clientPointToSource,
  fitsInSource,
  isDrawableRect,
  moveRectWithinSource,
  rectContainsPoint,
  rectFromPoints,
  resizeRectFromCorner,
  smallestRectAtPoint,
  sourceViewBox,
} from "./geometry";

/*
 * The transformation is tested directly rather than through rendered pixels.
 * These are the arithmetic guarantees the whole feature rests on: a region
 * that drifts by a few pixels does not look broken, it silently offsets every
 * crop of every frame of every run made with the profile.
 */

const SOURCE = { width: 1920, height: 1080 };

/** The picture displayed at `width` CSS px, at its own aspect ratio. */
function boxAtWidth(width: number, left = 0, top = 0) {
  return { left, top, width, height: (width * SOURCE.height) / SOURCE.width };
}

describe("sourceViewBox", () => {
  it("is built from the natural dimensions, not the displayed size", () => {
    expect(sourceViewBox(SOURCE)).toBe("0 0 1920 1080");
    expect(sourceViewBox({ width: 1280, height: 720 })).toBe("0 0 1280 720");
  });
});

describe("clientPointToSource", () => {
  it("maps a click to the source pixel under it", () => {
    // Half the width of a 960 px wide rendering of a 1920 px picture.
    const point = clientPointToSource({ x: 480, y: 270 }, boxAtWidth(960), SOURCE);

    expect(point).toEqual({ x: 960, y: 540 });
  });

  it("accounts for where the surface sits in the viewport", () => {
    const shifted = clientPointToSource({ x: 480 + 300, y: 270 + 120 }, boxAtWidth(960, 300, 120), SOURCE);

    expect(shifted).toEqual({ x: 960, y: 540 });
  });

  /*
   * THE test. The same place on the picture, measured at three window sizes,
   * has to be the same source pixel every time.
   */
  it("returns identical source coordinates at every display size", () => {
    const displayWidths = [1920, 1440, 960, 640, 320];

    const results = displayWidths.map((width) => {
      const box = boxAtWidth(width);
      // Three quarters across and one third down, whatever the box measures.
      return clientPointToSource(
        { x: box.width * 0.75, y: box.height * (1 / 3) },
        box,
        SOURCE,
      );
    });

    expect(results).toEqual([
      { x: 1440, y: 360 },
      { x: 1440, y: 360 },
      { x: 1440, y: 360 },
      { x: 1440, y: 360 },
      { x: 1440, y: 360 },
    ]);
  });

  it("clamps a point dragged outside the picture back onto it", () => {
    const box = boxAtWidth(960);

    expect(clientPointToSource({ x: -400, y: -400 }, box, SOURCE)).toEqual({ x: 0, y: 0 });
    expect(clientPointToSource({ x: 5000, y: 5000 }, box, SOURCE)).toEqual({ x: 1920, y: 1080 });
  });

  it("returns integers, because the backend stores regions as ints", () => {
    const point = clientPointToSource({ x: 333, y: 111 }, boxAtWidth(1000), SOURCE);

    expect(Number.isInteger(point.x)).toBe(true);
    expect(Number.isInteger(point.y)).toBe(true);
  });

  it("yields the origin for a surface that has not been laid out", () => {
    // jsdom, and any element before first layout, measures zero.
    expect(clientPointToSource({ x: 10, y: 10 }, { left: 0, top: 0, width: 0, height: 0 }, SOURCE)).toEqual(
      { x: 0, y: 0 },
    );
  });
});

describe("rectFromPoints", () => {
  it.each([
    ["top-left to bottom-right", { x: 10, y: 20 }, { x: 110, y: 70 }],
    ["bottom-right to top-left", { x: 110, y: 70 }, { x: 10, y: 20 }],
    ["top-right to bottom-left", { x: 110, y: 20 }, { x: 10, y: 70 }],
    ["bottom-left to top-right", { x: 10, y: 70 }, { x: 110, y: 20 }],
  ])("spans the same rectangle dragging %s", (_direction, origin, current) => {
    expect(rectFromPoints(origin, current)).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });

  it("gives a zero-area rectangle for a press that never moved", () => {
    expect(rectFromPoints({ x: 40, y: 40 }, { x: 40, y: 40 })).toEqual({
      x: 40,
      y: 40,
      width: 0,
      height: 0,
    });
  });
});

describe("overlapping rectangle hit testing", () => {
  const large = { id: "word", x: 100, y: 100, width: 101, height: 57 };
  const small = { id: "character", x: 120, y: 110, width: 19, height: 40 };

  it("treats the visible rectangle edges as part of the hit", () => {
    expect(rectContainsPoint(small, { x: 120, y: 110 })).toBe(true);
    expect(rectContainsPoint(small, { x: 139, y: 150 })).toBe(true);
    expect(rectContainsPoint(small, { x: 140, y: 150 })).toBe(false);
  });

  it("chooses the smaller bbox independent of input and paint order", () => {
    const point = { x: 130, y: 130 };

    expect(smallestRectAtPoint([small, large], point)).toBe(small);
    expect(smallestRectAtPoint([large, small], point)).toBe(small);
  });
});

describe("direct rectangle editing", () => {
  const rect = { x: 100, y: 120, width: 40, height: 32 };

  it("moves in source pixels and clamps the whole bbox to the frame", () => {
    expect(moveRectWithinSource(rect, { x: 200, y: 100 }, SOURCE)).toEqual({
      x: 300,
      y: 220,
      width: 40,
      height: 32,
    });
    expect(moveRectWithinSource(rect, { x: 5000, y: 5000 }, SOURCE)).toEqual({
      x: 1880,
      y: 1048,
      width: 40,
      height: 32,
    });
  });

  it.each([
    ["north-west", { x: 80, y: 90 }, { x: 80, y: 90, width: 60, height: 62 }],
    ["north-east", { x: 180, y: 90 }, { x: 100, y: 90, width: 80, height: 62 }],
    ["south-west", { x: 80, y: 180 }, { x: 80, y: 120, width: 60, height: 60 }],
    ["south-east", { x: 180, y: 180 }, { x: 100, y: 120, width: 80, height: 60 }],
  ] as const)("keeps the opposite corner fixed while resizing %s", (corner, point, expected) => {
    expect(resizeRectFromCorner(rect, corner, point, SOURCE)).toEqual(expected);
  });

  it("keeps a resize inside source bounds", () => {
    expect(resizeRectFromCorner(rect, "south-east", { x: 5000, y: 5000 }, SOURCE)).toEqual({
      x: 100,
      y: 120,
      width: 1820,
      height: 960,
    });
  });
});

describe("clampRectToSource", () => {
  it("trims a rectangle that runs off the right and bottom edges", () => {
    expect(clampRectToSource({ x: 1900, y: 1060, width: 200, height: 200 }, SOURCE)).toEqual({
      x: 1900,
      y: 1060,
      width: 20,
      height: 20,
    });
  });

  it("leaves a rectangle already inside the picture alone", () => {
    const rect = { x: 100, y: 200, width: 300, height: 400 };

    expect(clampRectToSource(rect, SOURCE)).toEqual(rect);
  });
});

describe("isDrawableRect", () => {
  it.each([
    [{ x: 0, y: 0, width: 1, height: 1 }, true],
    [{ x: 0, y: 0, width: 0, height: 10 }, false],
    [{ x: 0, y: 0, width: 10, height: 0 }, false],
  ])("mirrors the backend's width > 0 and height > 0 for %j", (rect, expected) => {
    expect(isDrawableRect(rect)).toBe(expected);
  });
});

describe("fitsInSource", () => {
  it("accepts a region flush against the far edge", () => {
    expect(fitsInSource({ x: 1820, y: 980, width: 100, height: 100 }, SOURCE)).toBe(true);
  });

  it("rejects a region one pixel past the far edge", () => {
    expect(fitsInSource({ x: 1820, y: 980, width: 101, height: 100 }, SOURCE)).toBe(false);
    expect(fitsInSource({ x: 1820, y: 980, width: 100, height: 101 }, SOURCE)).toBe(false);
  });

  it("rejects a negative origin", () => {
    expect(fitsInSource({ x: -1, y: 0, width: 10, height: 10 }, SOURCE)).toBe(false);
  });
});
