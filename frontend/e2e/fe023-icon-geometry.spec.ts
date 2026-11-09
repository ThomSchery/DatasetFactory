import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { ICON_PATHS } from "../src/components/common/Icon/iconPaths";

/*
 * FE-023: every glyph stays inside its 24 × 24 `viewBox` with half of its
 * stroke, and a glyph with a centre element (the gear) has that element in the
 * middle of its outline. Geometry comes from the browser's own `getBBox()` of
 * each path, so arcs and curves are measured as drawn.
 *
 * Central elements are listed by name: their path is "outline subpath, then
 * centre subpath(s)", each starting with an absolute `M`.
 */

const VIEWBOX = 24;
const CENTRED: Record<string, { tolerance: number }> = { profile: { tolerance: 0.25 } };

const css = fs.readFileSync(path.resolve(process.cwd(), "src/components/common/Icon/Icon.css"), "utf8");
const strokeWidth = Number(/stroke-width:\s*([\d.]+)/.exec(css)?.[1]);

interface Box { x: number; y: number; width: number; height: number }

test("FE-023 icons: every glyph inside its viewBox, stroke included", async ({ page }) => {
  expect(strokeWidth).toBeGreaterThan(0);
  const boxes = await page.evaluate((paths) => {
    document.body.innerHTML = '<svg id="probe" viewBox="0 0 24 24" width="24" height="24"></svg>';
    const svg = document.getElementById("probe") as unknown as SVGSVGElement;
    const measure = (d: string) => {
      const element = document.createElementNS("http://www.w3.org/2000/svg", "path");
      element.setAttribute("d", d);
      svg.append(element);
      const { x, y, width, height } = element.getBBox();
      element.remove();
      return { x, y, width, height };
    };
    return Object.fromEntries(Object.entries(paths).map(([name, d]) => [name, measure(d)]));
  }, ICON_PATHS);

  const half = strokeWidth / 2;
  const outside = Object.entries(boxes).flatMap(([name, box]: [string, Box]) => {
    const edges = { left: box.x - half, top: box.y - half, right: box.x + box.width + half, bottom: box.y + box.height + half };
    const fits = edges.left >= 0 && edges.top >= 0 && edges.right <= VIEWBOX && edges.bottom <= VIEWBOX;
    return fits ? [] : [`${name}: ${JSON.stringify(Object.fromEntries(Object.entries(edges).map(([k, v]) => [k, Math.round(v * 100) / 100])))}`];
  });
  expect(outside).toEqual([]);
});

test("FE-023 icons: a centre element sits in the middle of its outline", async ({ page }) => {
  for (const [name, { tolerance }] of Object.entries(CENTRED)) {
    const d = ICON_PATHS[name as keyof typeof ICON_PATHS];
    const subpaths = d.split(/(?=M)/).filter((part) => part.trim() !== "");
    expect(subpaths.length, `${name} has an outline and a centre`).toBeGreaterThanOrEqual(2);
    const boxes = await page.evaluate((parts) => {
      document.body.innerHTML = '<svg id="probe" viewBox="0 0 24 24" width="24" height="24"></svg>';
      const svg = document.getElementById("probe") as unknown as SVGSVGElement;
      return parts.map((part) => {
        const element = document.createElementNS("http://www.w3.org/2000/svg", "path");
        element.setAttribute("d", part);
        svg.append(element);
        const { x, y, width, height } = element.getBBox();
        return { x, y, width, height };
      });
    }, subpaths);
    // The outline is the largest subpath; the rest together are the centre.
    const area = (box: Box) => box.width * box.height;
    const outline = boxes.reduce((largest, box) => (area(box) > area(largest) ? box : largest));
    const centreBoxes = boxes.filter((box) => box !== outline);
    const centre = {
      x: (Math.min(...centreBoxes.map((b) => b.x)) + Math.max(...centreBoxes.map((b) => b.x + b.width))) / 2,
      y: (Math.min(...centreBoxes.map((b) => b.y)) + Math.max(...centreBoxes.map((b) => b.y + b.height))) / 2,
    };
    const outlineCentre = { x: outline.x + outline.width / 2, y: outline.y + outline.height / 2 };
    const report = `${name}: outline centre ${JSON.stringify(outlineCentre)}, centre element ${JSON.stringify(centre)}`;
    expect(Math.abs(outlineCentre.x - centre.x), report).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(outlineCentre.y - centre.y), report).toBeLessThanOrEqual(tolerance);
    // And both on the viewBox centre, so the glyph lines up with its neighbours.
    for (const point of [outlineCentre, centre]) {
      expect(Math.abs(point.x - VIEWBOX / 2), report).toBeLessThanOrEqual(tolerance);
      expect(Math.abs(point.y - VIEWBOX / 2), report).toBeLessThanOrEqual(tolerance);
    }
  }
});
