import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { convertThemeBlocks, parseRootVariables } from "./designPreset";

/*
 * Contrast of the token pairs the components rely on. Since FE-024 the
 * application tokens in `tokens.css` are `var()` references into the design
 * preset, so a token is resolved through that chain down to the preset's hex
 * before it is measured; the preset is read through the same conversion the
 * build applies.
 */

const presetVariables = parseRootVariables(
  convertThemeBlocks(readFileSync("src/styles/design-preset.css", "utf8"), "design-preset.css"),
);
const tokenVariables = parseRootVariables(readFileSync("src/styles/tokens.css", "utf8"));

type Rgb = readonly [number, number, number];

function resolve(name: string, depth = 0): string {
  if (depth > 16) throw new Error(`--${name} refers to itself`);
  const raw = tokenVariables.get(`--${name}`) ?? presetVariables.get(`--${name}`);
  if (raw === undefined) throw new Error(`Missing token --${name}`);
  const reference = /^var\(--([A-Za-z0-9_-]+)\)$/.exec(raw.trim());
  return reference === null ? raw.trim() : resolve(reference[1], depth + 1);
}

function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const segment = (((hue % 360) + 360) % 360) / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  const [r1, g1, b1] =
    segment < 1
      ? [chroma, x, 0]
      : segment < 2
        ? [x, chroma, 0]
        : segment < 3
          ? [0, chroma, x]
          : segment < 4
            ? [0, x, chroma]
            : segment < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const offset = l - chroma / 2;
  return [(r1 + offset) * 255, (g1 + offset) * 255, (b1 + offset) * 255];
}

function parseColor(value: string): Rgb {
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join("") : hex[1];
    return [0, 2, 4].map((offset) => Number.parseInt(digits.slice(offset, offset + 2), 16)) as unknown as Rgb;
  }

  const hsl = value.match(/^hsl\(([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\)$/);
  if (hsl) return hslToRgb(Number(hsl[1]), Number(hsl[2]), Number(hsl[3]));

  const rgb = value.match(/^rgb\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)\)$/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];

  throw new Error(`Unsupported opaque color: ${value}`);
}

function relativeLuminance([red, green, blue]: Rgb): number {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const first = relativeLuminance(parseColor(resolve(foreground)));
  const second = relativeLuminance(parseColor(resolve(background)));
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("token resolution (FE-024)", () => {
  it("follows the var() chain from an application token to the preset's exact hex", () => {
    expect(resolve("color-background-primary-default")).toBe("#23262c");
    expect(resolve("color-surface-neutral-default")).toBe("#2b303a");
    expect(resolve("color-stroke-control-default")).toBe("#959eb0");
    expect(resolve("color-fill-brand-impeccable")).toBe("#f6f7f8");
    expect(resolve("font-size-xs")).toBe("12px");
    expect(resolve("border-width-default")).toBe("1px");
  });

  it("reads hex, hsl() and rgb() colours", () => {
    expect(parseColor("#23262C")).toEqual([35, 38, 44]);
    expect(parseColor("#fff")).toEqual([255, 255, 255]);
    expect(parseColor("rgb(35, 38, 44)")).toEqual([35, 38, 44]);
    const [r, g, b] = parseColor("hsl(0 0% 50%)");
    expect([r, g, b].map(Math.round)).toEqual([128, 128, 128]);
  });
});

describe("Impeccable token contrast", () => {
  it.each([
    ["color-text-strong-default", "color-background-primary-default"],
    ["color-text-weak-default", "color-background-primary-default"],
    ["color-text-on-brand", "color-fill-brand-impeccable"],
    ["color-status-error-default", "color-surface-neutral-default"],
    // Added in FE-001-F1: the navigation rail and the stage list sit on
    // surface-neutral, and StatusBadge tints text with the status colours.
    ["color-text-strong-default", "color-surface-neutral-default"],
    ["color-text-weak-default", "color-surface-neutral-default"],
    ["color-text-strong-default", "color-surface-neutral-raised"],
    ["color-status-success-default", "color-surface-neutral-raised"],
    ["color-status-warning-default", "color-surface-neutral-raised"],
    // Added in FE-001-F2: `Notice` and the dashboard rows sit on
    // surface-neutral-raised, and form controls sit on the page background.
    ["color-text-weak-default", "color-surface-neutral-raised"],
    ["color-status-error-default", "color-background-primary-default"],
  ])("keeps %s readable on %s", (foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the strong interactive stroke visible against the canvas", () => {
    expect(
      contrast("color-stroke-strong-default", "color-background-primary-default"),
    ).toBeGreaterThanOrEqual(3);
  });

  it("keeps the control outline at 3:1 on every surface a control sits on (FE-021 deviation)", () => {
    for (const surface of [
      "color-background-primary-default",
      "color-surface-neutral-default",
      "color-surface-neutral-raised",
    ]) {
      expect(contrast("color-stroke-control-default", surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the region outline visible as a graphical object", () => {
    // FE-001-F3: a region outline carries meaning but is not text, so the bar
    // is 3:1 — against the image backdrop it is drawn over and against the
    // panel the editor sits on.
    expect(
      contrast("color-fill-brand-impeccable", "color-background-primary-default"),
    ).toBeGreaterThanOrEqual(3);
    expect(
      contrast("color-fill-brand-impeccable", "color-surface-neutral-default"),
    ).toBeGreaterThanOrEqual(3);
  });

  it("records why the error tone is not used as text on a raised surface", () => {
    // FE-001-F2: `Notice --error` carries its tone through the accent border and
    // the soft background instead of a tinted title, because this pair misses
    // AA for small text. Pinned so a later refactor cannot quietly re-tint it.
    expect(
      contrast("color-status-error-default", "color-surface-neutral-raised"),
    ).toBeLessThan(4.5);
  });
});
