import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import type { GameProfile } from "../src/api/types";
import { convertThemeBlocks, parseRootVariables } from "../src/styles/designPreset";
import {
  annotationFixture,
  dashboardFixture,
  emptyDashboard,
  frameDetailFixture,
  framePageFixture,
  frameSummaryFixture,
  materialFixture,
  profileFixture,
  profileSummaryFixture,
  runFixture,
} from "../src/test/fixtures";

/*
 * FE-025 — Figma icons and the polish of the profile column, measured in the
 * browser. Expected values are read from their sources here, never written in:
 * icon vectors from `designs/figma-2026-11-05/icons/*.svg` (via `icons.json`),
 * state colours from `src/styles/design-preset.css` through the conversion the
 * build applies. No Figma MCP, no screenshots.
 */

const DESIGN = path.resolve(process.cwd(), "../designs/figma-2026-11-05");
const fixtureImage = path.resolve(process.cwd(), "../backend/tests/fixtures/video/synthetic-frame.png");
const presetFile = path.resolve(process.cwd(), "src/styles/design-preset.css");
const preset = parseRootVariables(convertThemeBlocks(fs.readFileSync(presetFile, "utf8"), presetFile));

function presetRgb(name: string): string {
  const hex = preset.get(name);
  if (hex === undefined) throw new Error(`${name} is not in design-preset.css`);
  const [r, g, b] = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  return `rgb(${String(r)}, ${String(g)}, ${String(b)})`;
}

// --- Figma icon vectors ------------------------------------------------------

interface IconsJson {
  icons: { figmaName: string; file: string }[];
}

const iconsJson = JSON.parse(fs.readFileSync(path.join(DESIGN, "icons.json"), "utf8")) as IconsJson;

/** The drawn geometry of an exported icon: `d` of each path, `cx cy r` of each circle. */
function figmaGeometry(figmaName: string): string[] {
  const entry = iconsJson.icons.find((icon) => icon.figmaName === figmaName);
  if (entry === undefined) throw new Error(`icons.json has no ${figmaName}`);
  const svg = fs.readFileSync(path.join(DESIGN, entry.file), "utf8");
  return [...svg.matchAll(/<(path|circle)\b([^>]*)\/>/g)].map((match) => {
    const attributes = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map((p) => [p[1], p[2]]));
    return match[1] === "path" ? attributes.d : `circle ${attributes.cx} ${attributes.cy} ${attributes.r}`;
  });
}

async function drawnGeometry(scope: Locator): Promise<string[]> {
  return scope.locator("svg[data-icon]").first().evaluate((svg) =>
    [...svg.querySelectorAll("path, circle")].map((element) =>
      element.tagName === "path"
        ? (element.getAttribute("d") ?? "")
        : `circle ${element.getAttribute("cx") ?? ""} ${element.getAttribute("cy") ?? ""} ${element.getAttribute("r") ?? ""}`,
    ),
  );
}

// --- deterministic API --------------------------------------------------------

const PROFILE: GameProfile = profileFixture({
  categories: [
    { id: "cat-life", name: "Life", kind: "game" },
    { id: "cat-clock", name: "Clock", kind: "game" },
    { id: "cat-1", name: "1", kind: "character" },
    { id: "cat-2", name: "2", kind: "character" },
    { id: "cat-3", name: "3", kind: "character" },
  ],
  name: "Polish profile",
  regions: [
    { id: "region-a", name: "Region A", x: 40, y: 40, width: 220, height: 60, allowed_chars: "12", page_segmentation_mode: 7 },
    { id: "region-b", name: "Region B", x: 520, y: 30, width: 180, height: 50, allowed_chars: null, page_segmentation_mode: null },
  ],
  source_height: 852,
  source_width: 1280,
});

async function fulfill(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status: 200 });
}

async function installApi(page: Page): Promise<void> {
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") {
      await route.abort();
      return;
    }
    const url = new URL(request.url());
    const pathname = url.pathname.replace("/api/v1", "");
    if (pathname.startsWith("/assets/references/") || pathname.endsWith("/image")) {
      await route.fulfill({ contentType: "image/png", path: fixtureImage });
      return;
    }
    if (pathname === "/dashboard") return fulfill(route, emptyDashboard());
    if (pathname === "/materials") {
      return fulfill(route, {
        items: [materialFixture({ basename: "polish.mp4", height: 852, width: 1280 })],
        page: 1,
        page_size: 100,
        total: 1,
      });
    }
    if (pathname === "/profiles") {
      return fulfill(route, [
        profileSummaryFixture({ active: true, category_count: 5, name: PROFILE.name, region_count: 2, source_height: 852, source_width: 1280 }),
      ]);
    }
    if (pathname === "/profiles/current" || pathname === "/profiles/profile-1") return fulfill(route, PROFILE);
    if (pathname === "/runs/run-1") {
      return fulfill(route, runFixture({ completed_frames: 2, current_stage: "review", status: "review_ready", total_frames: 2 }));
    }
    if (pathname === "/runs/run-1/frames") {
      const status = url.searchParams.get("review_status");
      const items =
        status === null || status === "pending"
          ? [0, 1].map((index) =>
              frameSummaryFixture({ frame_index: index, height: 852, id: `frame-${String(index + 1)}`, timestamp_ms: index * 1000, width: 1280 }),
            )
          : [];
      return fulfill(route, framePageFixture({ items, page_size: 100, total: items.length }));
    }
    if (pathname.endsWith("/annotations/previous-classes")) {
      return fulfill(route, { classes: [], previous_frame_id: null, previous_frame_index: null });
    }
    if (pathname.startsWith("/frames/")) {
      return fulfill(
        route,
        frameDetailFixture({
          annotations: [annotationFixture({ id: "ann-1", category_id: "cat-life", x: 60, y: 50, width: 180, height: 40 })],
          height: 852,
          id: "frame-1",
          width: 1280,
        }),
      );
    }
    return fulfill(route, dashboardFixture({ run: null }));
  });
}

async function open(page: Page, route: string, width = 1200, height = 1000): Promise<void> {
  await page.setViewportSize({ width, height });
  await installApi(page);
  await page.goto(route);
  await page.locator(".df-shell__bar").waitFor({ state: "visible" });
}

async function openProfile(page: Page, width = 1200): Promise<void> {
  await open(page, "/profiles", width);
  await page.locator(".df-region-overlay__surface").waitFor({ state: "visible" });
  await expect(page.getByRole("button", { name: "Select region Region A" })).toBeVisible();
}

// --- colour helpers -----------------------------------------------------------

function channels(color: string): number[] {
  const parts = color.match(/[\d.]+/g)?.map(Number) ?? [];
  const scale = color.startsWith("color(srgb") ? 255 : 1;
  return [parts[0] * scale, parts[1] * scale, parts[2] * scale];
}

function luminance(color: string): number {
  return channels(color)
    .map((n) => n / 255)
    .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4))
    .reduce((sum, n, index) => sum + n * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrast(a: string, b: string): number {
  const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (high + 0.05) / (low + 0.05);
}

async function style(locator: Locator, property: string): Promise<string> {
  return locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
}

async function rest(page: Page): Promise<void> {
  await page.mouse.move(1, 1);
  await page.mouse.up();
}

// --- 1. icons ---------------------------------------------------------------

test.describe("FE-025 icons are the Figma vectors at every place of the map", () => {
  const checks: { route: string; place: string; scope: (page: Page) => Locator; figma: string }[] = [
    { route: "/profiles", place: "bar ☰", scope: (p) => p.locator(".df-shell__toggle"), figma: "Frame 1" },
    { route: "/profiles", place: "bar ⋮", scope: (p) => p.locator(".df-shell__more").getByRole("button", { name: "More" }), figma: "more-horizontal" },
    { route: "/profiles", place: "side panel Upload", scope: (p) => p.locator('.df-side-nav a[href="/materials"]'), figma: "Upload" },
    { route: "/profiles", place: "side panel Setup for scan", scope: (p) => p.locator('.df-side-nav a[href="/profiles"]'), figma: "Setting" },
    { route: "/profiles", place: "side panel Review for scan", scope: (p) => p.locator('.df-side-nav a[href="/run"]'), figma: "Scan" },
    { route: "/profiles", place: "side panel Annotations", scope: (p) => p.locator('.df-side-nav a[href="/annotations"]'), figma: "Edit" },
    { route: "/profiles", place: "switch Upload", scope: (p) => p.locator('.df-shell__switch a[href="/materials"]'), figma: "Upload" },
    { route: "/profiles", place: "switch Profile", scope: (p) => p.locator('.df-shell__switch a[href="/profiles"]'), figma: "Setting" },
    { route: "/profiles", place: "switch Run", scope: (p) => p.locator('.df-shell__switch a[href="/run"]'), figma: "Arrow - Right Square" },
    { route: "/profiles", place: "Search profile left", scope: (p) => p.locator(".df-profile-workspace__controls .df-grouped-options__icon").first(), figma: "search-2" },
    { route: "/profiles", place: "Search profile right", scope: (p) => p.getByRole("button", { name: "Expand list Game profiles" }), figma: "Arrow - Down 2" },
    { route: "/profiles", place: "Save profile", scope: (p) => p.getByRole("button", { name: "Save profile" }), figma: "save-line" },
    { route: "/profiles", place: "Save as", scope: (p) => p.getByRole("button", { name: "Save as" }), figma: "add-fill" },
    { route: "/profiles", place: "Run on Profile", scope: (p) => p.locator(".df-profile-workspace__run"), figma: "Arrow - Right Square" },
    { route: "/profiles", place: "class group checkbox", scope: (p) => p.getByRole("checkbox", { name: "Numbers" }), figma: "Checkbox - Empty" },
    { route: "/profiles", place: "class group chevron (collapsed)", scope: (p) => p.getByRole("button", { name: "Expand group Numbers" }), figma: "Arrow - Right 2" },
    { route: "/profiles", place: "class group chevron (open)", scope: (p) => p.getByRole("button", { name: "Collapse group Custom" }), figma: "Arrow - Down 2" },
    { route: "/run", place: "Source file label", scope: (p) => p.locator(".df-run-setup__label").filter({ hasText: "Source file" }), figma: "film-line" },
    { route: "/run", place: "Profile label", scope: (p) => p.locator(".df-run-setup__label").filter({ hasText: "Profile" }), figma: "Profile" },
    { route: "/run", place: "Sample rate label", scope: (p) => p.locator(".df-field__label").filter({ hasText: "Sample rate" }), figma: "Setting" },
    { route: "/run", place: "Source file left", scope: (p) => p.locator(".df-run-setup__picker").first().locator(".df-grouped-options__icon"), figma: "search-2" },
    { route: "/run", place: "Source file right", scope: (p) => p.getByRole("button", { name: "Expand list Imported videos" }), figma: "Arrow - Down 2" },
    { route: "/run", place: "Profile picker left", scope: (p) => p.locator(".df-run-setup__picker").nth(1).locator(".df-grouped-options__icon"), figma: "search-2" },
    { route: "/run", place: "Profile picker right", scope: (p) => p.getByRole("button", { name: "Expand list Saved profiles" }), figma: "Arrow - Down 2" },
    { route: "/run", place: "Run on Run", scope: (p) => p.locator(".df-run-setup__run"), figma: "Play" },
    { route: "/annotations/run-1", place: "Review previous frame", scope: (p) => p.getByRole("button", { name: "Previous frame" }), figma: "Arrow - Left" },
    { route: "/annotations/run-1", place: "Review next frame", scope: (p) => p.getByRole("button", { name: "Next frame" }), figma: "Arrow - Right" },
  ];

  for (const route of [...new Set(checks.map((check) => check.route))]) {
    test(`${route}: each place draws its Figma icon, path for path`, async ({ page }) => {
      await open(page, route);
      const failures: string[] = [];
      for (const check of checks.filter((candidate) => candidate.route === route)) {
        const scope = check.scope(page);
        await scope.first().waitFor({ state: "attached" });
        const drawn = await drawnGeometry(scope.first());
        const expected = figmaGeometry(check.figma);
        if (JSON.stringify(drawn) !== JSON.stringify(expected)) {
          failures.push(`${check.place}: expected ${check.figma}`);
        }
      }
      expect(failures).toEqual([]);
    });
  }

  test("no text arrow, triangle or menu glyph is drawn in the interface", async ({ page }) => {
    for (const route of ["/profiles", "/run", "/annotations/run-1", "/materials"]) {
      await open(page, route);
      await page.waitForLoadState("networkidle");
      const text = await page.evaluate(() => document.body.innerText);
      expect(text, route).not.toMatch(/[▸▾▴◂▶◀▲▼←→↑↓⋮☰]/u);
    }
  });
});

// --- 2. state colours -------------------------------------------------------

test.describe("FE-025 every state is the preset token of the same name", () => {
  test("field: rest, hover and focus", async ({ page }) => {
    await openProfile(page);
    const control = page.locator(".df-profile-workspace__controls .df-grouped-options__control").first();
    await rest(page);
    expect(await style(control, "background-color")).toBe(presetRgb("--color-surface-page"));
    // FE-024 deviation kept: the control outline is icon/placeholder for 3:1.
    expect(await style(control, "border-top-color")).toBe(presetRgb("--color-icon-placeholder"));
    await control.hover();
    expect(await style(control, "background-color"), "combobox hover").toBe(presetRgb("--color-surface-panel-hover"));
    await page.getByRole("combobox", { name: "Search profile" }).focus();
    expect(await style(control, "border-top-color")).toBe(presetRgb("--color-border-focus"));
    // The open list continues the field in the same frame.
    expect(await style(page.locator(".df-profile-workspace__controls .df-grouped-options__list").first(), "border-left-color")).toBe(
      presetRgb("--color-border-focus"),
    );
    // A plain text field: hover is a surface, focus the white frame.
    await page.keyboard.press("Escape");
    await page.getByRole("combobox", { name: "Search profile" }).blur();
    await page.getByRole("button", { name: "Select region Region A" }).click();
    const name = page.getByRole("combobox", { name: "Region name" });
    await expect(name).toBeEnabled();
    await rest(page);
    expect(await style(name, "background-color")).toBe(presetRgb("--color-surface-page"));
    await name.hover();
    expect(await style(name, "background-color"), "text field hover").toBe(presetRgb("--color-surface-panel-hover"));
    await name.focus();
    expect(await style(name, "border-top-color")).toBe(presetRgb("--color-border-focus"));
  });

  test("button: rest, hover, pressed; glyph icon/secondary at rest, icon/primary on hover", async ({ page }) => {
    await openProfile(page);
    const button = page.getByRole("button", { name: "Save as" });
    const glyph = button.locator("svg[data-icon]");
    await rest(page);
    expect(await style(button, "background-color")).toBe(presetRgb("--color-surface-panel"));
    expect(await style(glyph, "color")).toBe(presetRgb("--color-icon-secondary"));
    await button.hover();
    expect(await style(button, "background-color")).toBe(presetRgb("--color-surface-panel-hover"));
    expect(await style(glyph, "color")).toBe(presetRgb("--color-icon-primary"));
    await page.mouse.down();
    expect(await style(button, "background-color")).toBe(presetRgb("--color-surface-panel-pressed"));
    await page.mouse.move(1, 1);
    await page.mouse.up();
    // The tools under the picture and the zoom row: glyphs rest in icon/secondary.
    for (const name of ["Change screenshot", "Zoom in"]) {
      expect(await style(page.getByRole("button", { name }).locator("svg[data-icon]"), "color"), name).toBe(
        presetRgb("--color-icon-secondary"),
      );
    }
    // Side bar and switch glyphs too; the current destination is selected.
    expect(await style(page.locator('.df-side-nav a[href="/run"] svg[data-icon]'), "color")).toBe(presetRgb("--color-icon-secondary"));
    expect(await style(page.locator('.df-shell__switch a[href="/profiles"]'), "background-color")).toBe(
      presetRgb("--color-surface-panel-selected"),
    );
  });

  test("rows: hover, pressed and selected in Annotations, Search profile and the class groups", async ({ page }) => {
    await openProfile(page);
    const row = page.locator(".df-annotations__row").first();
    await page.locator(".df-annotations__row").nth(1).hover();
    expect(await style(page.locator(".df-annotations__row").nth(1), "background-color")).toBe(presetRgb("--color-surface-panel-hover"));
    await page.getByRole("button", { name: "Select region Region A" }).click();
    await rest(page);
    expect(await style(row, "background-color")).toBe(presetRgb("--color-surface-panel-selected"));

    // Class groups: the selected region makes them active; a checked item is
    // panel-selected with the border/focus outline.
    await page.getByRole("button", { name: "Expand group Numbers" }).click();
    const one = page.getByRole("checkbox", { name: "1", exact: true });
    await expect(one).toHaveAttribute("aria-checked", "true");
    await rest(page);
    expect(await style(one, "background-color")).toBe(presetRgb("--color-surface-panel-selected"));
    expect(await style(one, "border-top-color")).toBe(presetRgb("--color-border-focus"));
    const three = page.getByRole("checkbox", { name: "3", exact: true });
    expect(await style(three, "background-color")).toBe(presetRgb("--color-surface-page"));
    await three.hover();
    expect(await style(three, "background-color")).toBe(presetRgb("--color-surface-panel-hover"));
    await page.mouse.down();
    expect(await style(three, "background-color")).toBe(presetRgb("--color-surface-panel-pressed"));
    await page.mouse.move(1, 1);
    await page.mouse.up();

    // The open Search profile list: 35 px rows on surface/page, the open
    // profile selected, section labels 12 / 400 text/secondary, no marks.
    await page.getByRole("button", { name: "Expand list Game profiles" }).click();
    const chosen = page.getByRole("option", { name: /Polish profile/ });
    await rest(page);
    expect(await style(chosen, "background-color")).toBe(presetRgb("--color-surface-panel-selected"));
    expect(Math.round((await chosen.boundingBox())?.height ?? 0)).toBe(35);
    expect(await chosen.locator(".df-grouped-options__mark").count()).toBe(0);
    const fresh = page.getByRole("option", { name: "New profile" });
    expect(await style(fresh, "font-size")).toBe("12px");
    expect(await style(fresh, "font-weight")).toBe("300");
    await fresh.hover();
    expect(await style(fresh, "background-color")).toBe(presetRgb("--color-surface-panel-hover"));
    const heading = page.locator(".df-profile-workspace__controls .df-collapsible-group__title").filter({ hasText: "Saved profiles" });
    expect(await style(heading, "text-transform")).toBe("none");
    expect(await style(heading, "font-weight")).toBe("400");
    expect(await style(heading, "color")).toBe(presetRgb("--color-text-secondary"));
    const detail = chosen.locator(".df-grouped-options__detail");
    expect(await style(detail, "font-family")).not.toMatch(/mono/i);
    // FIX1: every text on a selected row reaches 4.5:1 — the label and the
    // metadata both use text/primary on panel-selected.
    await rest(page);
    const rowBackground = await style(chosen, "background-color");
    expect(await style(detail, "color")).toBe(presetRgb("--color-text-primary"));
    expect(contrast(await style(detail, "color"), rowBackground)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(await style(chosen.locator(".df-grouped-options__label"), "color"), rowBackground)).toBeGreaterThanOrEqual(4.5);
  });

  test("Save profile: Figma at rest, panel-selected when dirty — not white, readable, ≥ 3:1", async ({ page }) => {
    await openProfile(page);
    const save = page.getByRole("button", { name: "Save profile" });
    await rest(page);
    expect(await style(save, "background-color")).toBe(presetRgb("--color-surface-page"));
    await page.getByRole("button", { name: "Select region Region A" }).click();
    await page.getByLabel("Region name").fill("Region A2");
    await expect(save).toBeEnabled();
    await expect(save).toHaveClass(/df-button--emphasis/);
    await rest(page);
    const panel = await style(page.locator(".df-profile-workspace__controls"), "background-color");
    const background = await style(save, "background-color");
    expect(background).not.toBe("rgb(255, 255, 255)");
    expect(background).not.toBe(presetRgb("--color-border-focus"));
    expect(background).toBe(presetRgb("--color-surface-panel-selected"));
    expect(await style(save, "color")).toBe(presetRgb("--color-text-primary"));
    expect(contrast(await style(save, "color"), background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(await style(save, "border-top-color"), panel)).toBeGreaterThanOrEqual(3);
    // Distinct from the resting and the inactive state.
    expect(background).not.toBe(presetRgb("--color-surface-page"));
    expect(Number(await style(save, "opacity"))).toBe(1);
  });
});

// --- 3. rename in the row --------------------------------------------------------

for (const width of [1200, 360]) {
  test(`FE-025 renaming a class fits the row at ${String(width)} px`, async ({ page }) => {
    await openProfile(page, width);
    await page.getByRole("button", { name: "Rename class Life" }).click();
    const field = page.getByRole("textbox", { name: "New name of class Life" });
    await expect(field).toBeFocused();
    const geometry = await page.locator(".df-class-groups__row--editing").evaluate((row) => {
      const box = row.getBoundingClientRect();
      const input = row.querySelector("input")?.getBoundingClientRect();
      const actions = row.querySelector(".df-class-groups__actions")?.getBoundingClientRect();
      return {
        actionsRight: actions?.right ?? 0,
        inputHeight: input?.height ?? 0,
        inputWidth: input?.width ?? 0,
        overflow: row.scrollWidth - row.clientWidth,
        rowLeft: box.left,
        rowRight: box.right,
        rowWidth: box.width,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    if (width === 1200) {
      expect(Math.round((await page.locator(".df-profile-workspace__controls").boundingBox())?.width ?? 0)).toBe(247);
    }
    expect(geometry.overflow).toBeLessThanOrEqual(0);
    expect(geometry.pageOverflow).toBeLessThanOrEqual(0);
    expect(geometry.actionsRight).toBeLessThanOrEqual(geometry.rowRight + 0.5);
    // The field takes the row: everything but the two 34 px icon actions.
    expect(geometry.inputWidth).toBeGreaterThanOrEqual(geometry.rowWidth - 2 * 34 - 4 - 6 - 1);
    expect(Math.round(geometry.inputHeight)).toBe(34);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Rename class Life" })).toBeVisible();
  });
}

// --- 4. canvas -----------------------------------------------------------------

test.describe("FE-025 canvas: the whole picture fits, region outlines are 1 px", () => {
  test("Profile and Review start with the whole frame in the field; Run shows it contained", async ({ page }) => {
    for (const route of ["/profiles", "/annotations/run-1"]) {
      await open(page, route);
      await page.locator(".df-region-overlay__surface").first().waitFor({ state: "visible" });
      await expect(page.getByLabel("Canvas zoom").first()).toHaveText("100%");
      const fit = await page.locator(".df-region-overlay").first().evaluate((overlay) => {
        const box = overlay.getBoundingClientRect();
        const stage = overlay.querySelector(".df-region-overlay__zoom-stage")?.getBoundingClientRect();
        const image = overlay.querySelector("img") as HTMLImageElement | null;
        return {
          box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height },
          stage: stage === undefined ? null : { left: stage.left, top: stage.top, right: stage.right, bottom: stage.bottom, width: stage.width, height: stage.height },
          ratio: image === null ? 0 : image.naturalWidth / image.naturalHeight,
        };
      });
      expect(fit.stage, route).not.toBeNull();
      const stage = fit.stage as NonNullable<typeof fit.stage>;
      // Inside the field on every side (1 px border tolerance) …
      expect(stage.left, route).toBeGreaterThanOrEqual(fit.box.left - 0.5);
      expect(stage.top, route).toBeGreaterThanOrEqual(fit.box.top - 0.5);
      expect(stage.right, route).toBeLessThanOrEqual(fit.box.right + 0.5);
      expect(stage.bottom, route).toBeLessThanOrEqual(fit.box.bottom + 0.5);
      // … touching it on one axis, in the picture's own proportion, centred.
      const touches = Math.abs(stage.width - (fit.box.width - 2)) <= 2 || Math.abs(stage.height - (fit.box.height - 2)) <= 2;
      expect(touches, route).toBe(true);
      expect(stage.width / stage.height, route).toBeCloseTo(fit.ratio, 1);
      expect(Math.abs(stage.left - fit.box.left - (fit.box.right - stage.right)), route).toBeLessThanOrEqual(1.5);
      expect(Math.abs(stage.top - fit.box.top - (fit.box.bottom - stage.bottom)), route).toBeLessThanOrEqual(1.5);
    }
    await open(page, "/run");
    await page.getByRole("combobox", { name: "Profile" }).click();
    await page.getByRole("option", { name: "Polish profile" }).click();
    const img = page.locator(".df-reference-image__img");
    await img.waitFor({ state: "visible" });
    expect(await style(img, "object-fit")).toBe("contain");
  });

  test("region outlines are 1 screen px at 100 % and when zoomed; selection and focus do not thicken", async ({ page }) => {
    await openProfile(page);
    // FIX1: the on-screen width is the computed stroke-width (viewBox scale
    // neutralised by non-scaling-stroke) times every CSS scale above it —
    // measured as the stage's drawn width over its layout width.
    const onScreen = () =>
      page.locator(".df-region-overlay__shape-fill").evaluateAll((elements) =>
        elements.map((element) => {
          let scale = 1;
          for (let node = element.parentElement; node !== null; node = node.parentElement) {
            if (node instanceof HTMLElement && node.offsetWidth > 0) {
              const drawn = node.getBoundingClientRect().width;
              scale = drawn / node.offsetWidth;
              break;
            }
          }
          const style = getComputedStyle(element);
          return {
            effect: style.getPropertyValue("vector-effect"),
            width: Number.parseFloat(style.strokeWidth) * scale,
          };
        }),
      );
    const expectOnePixel = async (label: string) => {
      for (const outline of await onScreen()) {
        expect(outline.effect, label).toBe("non-scaling-stroke");
        expect(Math.abs(outline.width - 1), `${label}: ${String(outline.width)} px`).toBeLessThanOrEqual(0.1);
      }
    };
    await expectOnePixel("100 %");
    for (let step = 0; step < 3; step += 1) await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(page.getByLabel("Canvas zoom")).not.toHaveText("100%");
    await expectOnePixel("3 zoom steps");
    for (let step = 0; step < 5; step += 1) await page.getByRole("button", { name: "Zoom in" }).click();
    await expectOnePixel(`8 zoom steps (${await page.getByLabel("Canvas zoom").innerText()})`);
    await page.getByRole("button", { name: "Select region Region A" }).click();
    await expectOnePixel("selected");
    await page.locator(".df-region-overlay__shape").first().focus();
    await expectOnePixel("focused");
    expect(await style(page.locator(".df-region-overlay__shape-fill").first(), "stroke")).toBe(presetRgb("--color-border-focus"));
  });

  test("FIX1: Draw region pressed is panel-selected with the border/focus outline, not white", async ({ page }) => {
    await openProfile(page);
    const draw = page.getByRole("button", { name: "Draw region" });
    await rest(page);
    const restBorder = await style(draw, "border-top-color");
    await draw.click();
    await expect(draw).toHaveAttribute("aria-pressed", "true");
    await rest(page);
    await draw.evaluate((element) => element.blur());
    const panel = await style(page.locator(".df-profile-workspace__canvas"), "background-color");
    expect(await style(draw, "background-color")).toBe(presetRgb("--color-surface-panel-selected"));
    expect(await style(draw, "border-top-color")).toBe(presetRgb("--color-border-focus"));
    expect(await style(draw, "border-top-color")).not.toBe(restBorder);
    expect(contrast(await style(draw, "border-top-color"), panel)).toBeGreaterThanOrEqual(3);
    expect(await style(draw.locator("svg[data-icon]"), "color")).toBe(presetRgb("--color-icon-primary"));
    await draw.hover();
    expect(await style(draw, "background-color")).toBe(presetRgb("--color-surface-panel-selected"));
  });
});
