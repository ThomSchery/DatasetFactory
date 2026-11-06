import { describe, expect, it } from "vitest";

import { avoid, clampToClip, type Rect } from "./touchGeometry";

const rect = (left: number, top: number, right: number, bottom: number): Rect => ({ left, top, right, bottom });

describe("touch hit-area geometry (FE-022 FIX2)", () => {
  it("keeps the expansion inside a scroll container but never cuts the control", () => {
    const box = rect(10, 0, 40, 32);
    const hit = rect(2, -8, 48, 40);
    clampToClip(hit, box, rect(0, 0, 44, 100));
    expect(hit).toEqual(rect(2, 0, 44, 40));

    // A row scrolled partly out of view keeps its box and gains nothing there.
    const scrolled = rect(10, -10, 40, 22);
    const scrolledHit = rect(2, -18, 48, 30);
    clampToClip(scrolledHit, scrolled, rect(0, 0, 44, 100));
    expect(scrolledHit).toEqual(rect(2, -10, 44, 30));
  });

  it("stops a side-column row's gap share at the canvas edge", () => {
    // Numbers row (311–327) shared the gap up to 343; the canvas starts at 342.
    const hit = rect(303, 608, 343, 656);
    avoid(hit, rect(311, 616, 327, 648), rect(342, 255, 977, 677));
    expect(hit).toEqual(rect(303, 608, 342, 656));
  });

  it("gives a control painted over the canvas no expansion onto it", () => {
    const hit = rect(176, 686, 221, 736);
    avoid(hit, rect(184, 694, 218, 728), rect(16, 229, 344, 740));
    expect(hit).toEqual(rect(184, 694, 218, 728));
  });

  it("keeps the expansion on sides that face away from the canvas", () => {
    // Toolbar under the canvas: only the top is retracted.
    const hit = rect(84, 197, 134, 247);
    avoid(hit, rect(92, 205, 126, 239), rect(16, -82, 344, 200));
    expect(hit).toEqual(rect(84, 200, 134, 247));
  });

  it("leaves a hit area that does not reach the canvas alone", () => {
    const hit = rect(84, 197, 134, 247);
    avoid(hit, rect(92, 205, 126, 239), rect(16, -82, 344, 197));
    expect(hit).toEqual(rect(84, 197, 134, 247));
  });
});
