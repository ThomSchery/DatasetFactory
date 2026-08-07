import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tokensCss = readFileSync("src/styles/tokens.css", "utf8");

type Rgb = readonly [number, number, number];

function token(name: string): string {
  const match = tokensCss.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) {
    throw new Error(
      `Missing token --${name}; raw module starts with ${JSON.stringify(tokensCss.slice(0, 80))}`,
    );
  }
  return match[1].trim();
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
  const first = relativeLuminance(parseColor(token(foreground)));
  const second = relativeLuminance(parseColor(token(background)));
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

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
