import { describe, expect, it } from "vitest";

import { resolvePopoverPlacement, sourceBoxToRendered } from "./popoverPlacement";

describe("popover placement", () => {
  it("moves to the left of a bbox near the right edge without covering it", () => {
    const anchor = { height: 50, left: 700, top: 80, width: 60 };
    const placement = resolvePopoverPlacement(
      anchor,
      { height: 500, width: 800 },
      { height: 180, width: 240 },
      8,
    );

    expect(placement.side).toBe("left");
    expect(placement.left + 240).toBeLessThanOrEqual(anchor.left);
  });

  it("keeps the preferred right side when the bbox has enough room", () => {
    const anchor = sourceBoxToRendered(
      { height: 100, width: 100, x: 50, y: 50 },
      { height: 1000, width: 1000 },
      { height: 500, width: 800 },
    );
    const placement = resolvePopoverPlacement(
      anchor,
      { height: 500, width: 800 },
      { height: 180, width: 240 },
      8,
    );

    expect(placement.side).toBe("right");
    expect(placement.left).toBeGreaterThanOrEqual(anchor.left + anchor.width);
  });
});
