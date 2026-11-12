import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Icon } from "./Icon";
import { ICONS, type IconName } from "./iconPaths";

/*
 * FE-025 — the glyphs are the Figma icons, read here from the vectors exported
 * on 2026-11-10 (`designs/figma-2026-11-05/icons/*.svg`), never copied into the
 * test. A colour in the export is the paint at the point of use; it maps onto
 * the matching icon token (#F6F7F8 is drawn in `currentColor`).
 */

const ICON_DIR = join(process.cwd(), "..", "designs", "figma-2026-11-05", "icons");
const PAINTS: Record<string, string> = {
  "#F6F7F8": "current",
  "#B9BFCB": "icon-secondary",
  "#959EB0": "icon-placeholder",
  "#23262C": "surface-page",
};

interface ExportedElement {
  circle?: { cx: number; cy: number; r: number };
  d?: string;
  evenOdd: boolean;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

function readExport(file: string): ExportedElement[] {
  const svg = readFileSync(join(ICON_DIR, file), "utf8");
  return [...svg.matchAll(/<(path|circle)\b([^>]*)\/>/g)].map((match) => {
    const attributes = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map((pair) => [pair[1], pair[2]]));
    const paint = (value: string | undefined) =>
      value === undefined || value === "none" ? undefined : PAINTS[value.toUpperCase()];
    return {
      ...(match[1] === "path"
        ? { d: attributes.d }
        : { circle: { cx: Number(attributes.cx), cy: Number(attributes.cy), r: Number(attributes.r) } }),
      evenOdd: attributes["fill-rule"] === "evenodd",
      fill: paint(attributes.fill),
      stroke: paint(attributes.stroke),
      strokeWidth: attributes["stroke-width"] === undefined ? undefined : Number(attributes["stroke-width"]),
    };
  });
}

const FIGMA_ICONS = (Object.keys(ICONS) as IconName[]).filter((name) => ICONS[name].figma !== undefined);

describe("Icon draws the Figma vectors (FE-025)", () => {
  it("covers every exported icon except the retired contract-left-line", () => {
    const exported = readdirSync(ICON_DIR).filter((file) => file.endsWith(".svg"));
    const used = new Set(FIGMA_ICONS.map((name) => ICONS[name].figma?.file));
    expect(exported.filter((file) => !used.has(file))).toEqual(["contract-left-line-1553-2313.svg"]);
  });

  it.each(FIGMA_ICONS)("%s is element for element the exported SVG", (name) => {
    const definition = ICONS[name];
    const expected = readExport(definition.figma?.file ?? "");
    expect(expected.length).toBeGreaterThan(0);
    expect(
      definition.elements.map((element) => ({
        ...(element.d === undefined ? { circle: element.circle } : { d: element.d }),
        evenOdd: element.evenOdd === true,
        fill: element.fill,
        stroke: element.stroke,
        strokeWidth: element.strokeWidth,
      })),
    ).toEqual(expected);
  });

  it.each(FIGMA_ICONS)("%s renders those elements, paints as data attributes", (name) => {
    const { container } = render(<Icon name={name} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("data-icon")).toBe(name);
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    const drawn = [...(svg?.querySelectorAll("path, circle") ?? [])].map((element) => ({
      ...(element.tagName === "path"
        ? { d: element.getAttribute("d") ?? undefined }
        : {
            circle: {
              cx: Number(element.getAttribute("cx")),
              cy: Number(element.getAttribute("cy")),
              r: Number(element.getAttribute("r")),
            },
          }),
      evenOdd: element.getAttribute("fill-rule") === "evenodd",
      fill: element.getAttribute("data-fill") ?? undefined,
      stroke: element.getAttribute("data-stroke") ?? undefined,
      strokeWidth: element.hasAttribute("stroke-width") ? Number(element.getAttribute("stroke-width")) : undefined,
    }));
    expect(drawn).toEqual(readExport(ICONS[name].figma?.file ?? ""));
  });

  it("paints each Figma colour through its token, never a literal", () => {
    const css = readFileSync(join(process.cwd(), "src/components/common/Icon/Icon.css"), "utf8");
    expect(css).toMatch(/\[data-fill="current"\]\s*\{\s*fill:\s*currentcolor;/);
    expect(css).toMatch(/\[data-stroke="current"\]\s*\{\s*stroke:\s*currentcolor;/);
    expect(css).toMatch(/\[data-fill="icon-secondary"\]\s*\{\s*fill:\s*var\(--color-icon-weak-default\);/);
    expect(css).toMatch(/\[data-stroke="icon-secondary"\]\s*\{\s*stroke:\s*var\(--color-icon-weak-default\);/);
    expect(css).toMatch(/\[data-stroke="icon-placeholder"\]\s*\{\s*stroke:\s*var\(--color-icon-muted-default\);/);
    expect(css).toMatch(/\[data-fill="surface-page"\]\s*\{\s*fill:\s*var\(--color-background-primary-default\);/);
  });

  it("keeps the gear of FE-023 as the Figma Setting, centred on the viewBox", () => {
    const setting = ICONS.setting;
    expect(setting.figma?.name).toBe("Setting");
    const hub = setting.elements.find((element) => element.circle !== undefined)?.circle;
    expect(hub).toBeDefined();
    expect(Math.abs((hub?.cx ?? 0) - 12)).toBeLessThanOrEqual(0.25);
    expect(Math.abs((hub?.cy ?? 0) - 12)).toBeLessThanOrEqual(0.25);
  });
});
