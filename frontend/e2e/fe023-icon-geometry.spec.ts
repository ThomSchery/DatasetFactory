import { expect, test } from "@playwright/test";

import { ICONS, type IconElement } from "../src/components/common/Icon/iconPaths";

/*
 * FE-023: every glyph stays inside its 24 × 24 `viewBox` with half of its
 * stroke, and a glyph with a centre element (the gear) has that element in the
 * middle of its outline. Geometry comes from the browser's own `getBBox()` of
 * each element, so arcs and curves are measured as drawn.
 *
 * FE-025: the glyphs are the Figma vectors, element by element (`path` or
 * `circle`, each with its own stroke width; a filled element has none). The
 * gear is the Figma `Setting`: an outline path and a hub circle.
 */

const VIEWBOX = 24;
const CENTRED: Record<string, { tolerance: number }> = { setting: { tolerance: 0.25 } };

interface Box { x: number; y: number; width: number; height: number }

function measureAll(elements: readonly IconElement[]) {
  return elements.map((element) => ({
    circle: element.circle ?? null,
    d: element.d ?? null,
    half: element.stroke === undefined ? 0 : (element.strokeWidth ?? 1) / 2,
  }));
}

test("FE-023 icons: every glyph inside its viewBox, stroke included", async ({ page }) => {
  const input = Object.fromEntries(Object.entries(ICONS).map(([name, icon]) => [name, measureAll(icon.elements)]));
  const boxes = await page.evaluate((icons) => {
    document.body.innerHTML = '<svg id="probe" viewBox="0 0 24 24" width="24" height="24"></svg>';
    const svg = document.getElementById("probe") as unknown as SVGSVGElement;
    const measure = (part: { circle: { cx: number; cy: number; r: number } | null; d: string | null; half: number }) => {
      const element = document.createElementNS("http://www.w3.org/2000/svg", part.circle === null ? "path" : "circle");
      if (part.circle === null) {
        element.setAttribute("d", part.d ?? "");
      } else {
        element.setAttribute("cx", String(part.circle.cx));
        element.setAttribute("cy", String(part.circle.cy));
        element.setAttribute("r", String(part.circle.r));
      }
      svg.append(element);
      const { x, y, width, height } = (element as SVGGraphicsElement).getBBox();
      element.remove();
      return { x, y, width, height, half: part.half };
    };
    return Object.fromEntries(Object.entries(icons).map(([name, parts]) => [name, parts.map(measure)]));
  }, input);

  expect(Object.keys(boxes).length).toBeGreaterThanOrEqual(19);
  const outside = Object.entries(boxes).flatMap(([name, parts]) =>
    parts.flatMap((box: Box & { half: number }, index: number) => {
      const edges = {
        left: box.x - box.half,
        top: box.y - box.half,
        right: box.x + box.width + box.half,
        bottom: box.y + box.height + box.half,
      };
      const fits = edges.left >= 0 && edges.top >= 0 && edges.right <= VIEWBOX && edges.bottom <= VIEWBOX;
      return fits
        ? []
        : [`${name}[${String(index)}]: ${JSON.stringify(Object.fromEntries(Object.entries(edges).map(([k, v]) => [k, Math.round(v * 100) / 100])))}`];
    }),
  );
  expect(outside).toEqual([]);
});

test("FE-023 icons: a centre element sits in the middle of its outline", async ({ page }) => {
  for (const [name, { tolerance }] of Object.entries(CENTRED)) {
    const elements = ICONS[name as keyof typeof ICONS].elements;
    expect(elements.length, `${name} has an outline and a centre`).toBeGreaterThanOrEqual(2);
    const boxes: Box[] = await page.evaluate((parts) => {
      document.body.innerHTML = '<svg id="probe" viewBox="0 0 24 24" width="24" height="24"></svg>';
      const svg = document.getElementById("probe") as unknown as SVGSVGElement;
      return parts.map((part) => {
        const element = document.createElementNS("http://www.w3.org/2000/svg", part.circle === null ? "path" : "circle");
        if (part.circle === null) {
          element.setAttribute("d", part.d ?? "");
        } else {
          element.setAttribute("cx", String(part.circle.cx));
          element.setAttribute("cy", String(part.circle.cy));
          element.setAttribute("r", String(part.circle.r));
        }
        svg.append(element);
        const { x, y, width, height } = (element as SVGGraphicsElement).getBBox();
        return { x, y, width, height };
      });
    }, measureAll(elements));
    // The outline is the largest element; the rest together are the centre.
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
