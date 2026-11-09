import { render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTouchTargets } from "./useTouchTargets";

/*
 * FE-023 P3-b. jsdom has no layout, so the boxes are given: every element gets
 * the rectangle the test assigns and nothing else has a size. The browser specs
 * (`fe022-touch-targets.spec.ts`, N1/N2) check the result on real layout; these
 * pin down the cost of one update and the clip it must still produce.
 */

const DEPTH = 12;
const TARGETS = 30;

const rects = new Map<Element, DOMRect>();
// jsdom keeps `medium` for an unset border width and does not expand the
// `overflow` shorthand, so both are spelled out longhand.
const BORDERLESS = { borderTopWidth: 0, borderRightWidth: 0, borderBottomWidth: 0, borderLeftWidth: 0 };

function Probe({ children }: { children: ReactNode }) {
  useTouchTargets();
  return <>{children}</>;
}

/** `DEPTH` plain wrappers inside one scroll container, `TARGETS` 24 px buttons 36 px apart. */
function Tree() {
  let content: ReactNode = Array.from({ length: TARGETS }, (_, index) => (
    <button className="df-button" data-index={index} key={index} style={BORDERLESS} type="button">
      {index}
    </button>
  ));
  for (let level = 0; level < DEPTH; level += 1) content = <div>{content}</div>;
  return (
    <div data-testid="scroller" style={{ overflowX: "auto", overflowY: "auto" }}>
      {content}
    </div>
  );
}

function layOut(container: HTMLElement) {
  const scroller = container.querySelector<HTMLElement>("[data-testid=scroller]");
  if (scroller === null) throw new Error("no scroller");
  rects.set(scroller, new DOMRect(0, 0, 4000, 100));
  Object.defineProperty(scroller, "clientWidth", { configurable: true, value: 4000 });
  Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 100 });
  for (const button of container.querySelectorAll<HTMLElement>(".df-button")) {
    const index = Number(button.dataset.index);
    rects.set(button, new DOMRect(30 + index * 60, 40, 24, 24));
  }
  // The last one sits 6 px from the scroller's right edge.
  const last = container.querySelector<HTMLElement>(`[data-index="${String(TARGETS - 1)}"]`);
  if (last !== null) rects.set(last, new DOMRect(3970, 40, 24, 24));
}

beforeEach(() => {
  rects.clear();
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    return rects.get(this) ?? new DOMRect(0, 0, 0, 0);
  });
  Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: 5000 });
  document.documentElement.style.setProperty("--control-height-lg", "48px");
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  vi.stubGlobal("ResizeObserver", class {
    observe() { /* layout is static here */ }
    unobserve() { /* layout is static here */ }
    disconnect() { /* layout is static here */ }
  });
  // Frames are queued, never run, until the test lays the tree out.
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.style.removeProperty("--control-height-lg");
});

/** Mounts the tree, lays it out, then runs exactly one update and returns its style lookups. */
async function oneUpdate(): Promise<{ container: HTMLElement; styleLookups: Element[] }> {
  let pending: FrameRequestCallback | null = null;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    pending = callback;
    return 1;
  });
  const { container } = render(<Probe><Tree /></Probe>);
  layOut(container);
  await waitFor(() => {
    expect(pending).not.toBeNull();
  });
  const lookups = vi.spyOn(globalThis, "getComputedStyle");
  const run = pending as FrameRequestCallback | null;
  run?.(0);
  return { container, styleLookups: lookups.mock.calls.map(([element]) => element) };
}

describe("useTouchTargets (FE-023 P3-b)", () => {
  it("reads each element's computed style at most once per update", async () => {
    const { container, styleLookups } = await oneUpdate();
    expect(container.querySelectorAll("[data-touch-target]")).toHaveLength(TARGETS);
    // Without a per-ancestor cache every target walks all its DEPTH + 2
    // ancestors again (481 lookups here before FE-023).
    expect(styleLookups.length).toBe(new Set(styleLookups).size);
    // The targets, their wrappers, the scroller, the render container and the
    // root (for `--control-height-lg`): nothing else is read.
    expect(styleLookups.length).toBeLessThanOrEqual(container.querySelectorAll("*").length + 2);
  });

  it("still keeps the hit area inside the shared scroll container", async () => {
    const { container } = await oneUpdate();
    const last = container.querySelector<HTMLElement>(`[data-index="${String(TARGETS - 1)}"]`);
    const first = container.querySelector<HTMLElement>('[data-index="0"]');
    // 24 px box → 48 px target: 12 px on every side, except the 6 px left to the
    // scroller's edge on the right.
    expect(last?.style.getPropertyValue("--touch-right")).toBe("-6px");
    expect(last?.style.getPropertyValue("--touch-left")).toBe("-12px");
    expect(last?.style.getPropertyValue("--touch-top")).toBe("-12px");
    expect(last?.style.getPropertyValue("--touch-bottom")).toBe("-12px");
    // The first one is clear of every edge: the full 12 px on the left, and the
    // right side meets its neighbour's 36 px gap at the 12 px expansion first.
    expect(first?.style.getPropertyValue("--touch-left")).toBe("-12px");
    expect(first?.style.getPropertyValue("--touch-right")).toBe("-12px");
  });
});
