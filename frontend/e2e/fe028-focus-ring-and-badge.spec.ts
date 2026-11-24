import { expect, test, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";

import { convertThemeBlocks, parseRootVariables } from "../src/styles/designPreset";
import { ApiHarness } from "./apiHarness";

// Expectations follow the exported preset, including when it is replaced.
const preset = parseRootVariables(convertThemeBlocks(fs.readFileSync("src/styles/design-preset.css", "utf8")));

function presetRgb(name: string): string {
  const hex = preset.get(name);
  if (hex === undefined) throw new Error(`Missing preset colour ${name}`);
  return `rgb(${[1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)).join(", ")})`;
}

function contrast(foreground: string, background: string): number {
  const luminance = (colour: string) => {
    const channels = colour.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

async function open(page: Page, route: string): Promise<ApiHarness> {
  const api = new ApiHarness({ phase: "review" });
  await api.install(page);
  await page.goto(route);
  await expect(page.locator(".df-shell__bar")).toBeVisible();
  return api;
}

async function hasFocusOutline(element: Locator): Promise<boolean> {
  return element.evaluate((node, colour) => {
    const style = getComputedStyle(node);
    return style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0 && style.outlineColor === colour;
  }, presetRgb("--color-border-focus"));
}

async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let step = 0; step < 20 && !(await target.evaluate((node) => node === document.activeElement)); step += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

test("FE-028: Review moves the focus ring from the active class to Change class and back", async ({ page }) => {
  const api = await open(page, "/annotations/run-1");
  await page.locator(".df-region-overlay__shape").first().click();
  const panel = page.locator(".df-annotation-popover");
  const filter = panel.getByRole("combobox", { name: "Class", exact: true });
  await expect(filter).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const row = panel.getByRole("option", { name: /^7/ });
  await expect(row).toHaveAttribute("data-keyboard-active", "true");
  expect(await hasFocusOutline(row)).toBe(true);
  const activeId = await row.getAttribute("id");
  await expect(filter).toHaveAttribute("aria-activedescendant", activeId!);

  const change = panel.getByRole("button", { name: "Change class: assign another class to this box" });
  await tabTo(page, change);
  expect(await hasFocusOutline(row)).toBe(false);
  await expect(filter).not.toHaveAttribute("aria-activedescendant");
  await expect(row).toHaveAttribute("aria-selected", "true");
  await expect(row).toHaveCSS("background-color", presetRgb("--color-surface-panel-selected"));
  await expect(row).toHaveCSS("color", presetRgb("--color-text-primary"));
  expect(await hasFocusOutline(change)).toBe(true);
  const outlined = await panel.locator("*").evaluateAll((nodes, colour) => nodes.filter((node) => {
    const style = getComputedStyle(node);
    return style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0 && style.outlineColor === colour;
  }).length, presetRgb("--color-border-focus"));
  expect(outlined).toBe(1);

  // Traverse back over Delete and the group's disclosure to re-enter the list.
  for (let step = 0; step < 10 && !(await hasFocusOutline(row)); step += 1) {
    await page.keyboard.press("Shift+Tab");
  }
  expect(await hasFocusOutline(row)).toBe(true);
  await expect(filter).toHaveAttribute("aria-activedescendant", activeId!);
  expect(api.requests.filter((request) => request.method !== "GET")).toHaveLength(0);
});

test("FE-028: assigned StatusBadge uses a strong neutral border and readable preset text", async ({ page }) => {
  await open(page, "/annotations/run-1");
  const canvas = page.getByRole("listbox", { name: "Annotation boxes on the frame" });
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (box === null) throw new Error("No drawing surface");
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.75, { steps: 4 });
  await page.mouse.up();
  const badge = page.locator(".df-status-badge--brand").filter({ hasText: "assigned:" });
  await expect(badge).toBeVisible();
  await expect(badge).toHaveCSS("border-top-color", presetRgb("--color-border-strong"));
  await expect(badge).not.toHaveCSS("border-top-color", presetRgb("--color-border-focus"));
  await expect(badge).toHaveCSS("color", presetRgb("--color-text-primary"));
  await expect(badge).toHaveCSS("background-color", presetRgb("--color-surface-panel-hover"));
  const colours = await badge.evaluate((node) => {
    const style = getComputedStyle(node);
    return { text: style.color, background: style.backgroundColor };
  });
  expect(contrast(colours.text, colours.background)).toBeGreaterThanOrEqual(4.5);
});
