import { expect, test, type Browser, type BrowserContext, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import type { GameProfile } from "../src/api/types";
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
 * FE-022 — whole-screen parity with the Figma document of 2026-11-05.
 *
 * The only design source is `designs/figma-2026-11-05/geometry.json` (node
 * geometry read through MCP; no screenshots). For each of the 14 designed
 * frames the app is opened at the frame's width and a 900 px tall window, with
 * deterministic API data, and measured in the DOM:
 *
 *  - page margin 16 ± 1 px on both sides of the content area;
 *  - left column width ± 4 px, picture field ± 4 % in both dimensions;
 *  - key controls no lower than Figma's y + 32 px, and above the fold when
 *    Figma has them above it;
 *  - every text label of the frame present and visible (data texts aside);
 *  - content bottom ≤ Figma `contentBottom` + 10 %;
 *  - panel and control radii ∈ {4, 8}; no warning blocks; no text in the bar.
 *
 * The side bar (user decision 2026-11-05): visible from 768 px as a 56 px
 * strip, which Figma's frames do not contain. With the strip open the content
 * area starts at its right edge and fluid widths are compared with Figma
 * re-flowed to that narrower area (coordinator decision, option A). With the
 * strip collapsed (☰, FE-023) the 768/992/1200 frames are compared literally.
 *
 * 360 and 576 run in phone emulation (`isMobile`, overlay scrollbar), because
 * a desktop browser reserves a 15 px gutter (`scrollbar-gutter: stable`) a
 * phone does not have; see docs/tickets/FE-022/log.md.
 */

type Row = [string, number, number, number, number, ...unknown[]];

interface Frame {
  contentBottom: number;
  h: number;
  id: string;
  rows: Row[];
  w: number;
}

interface Geometry {
  frames: Record<string, Frame>;
  screenToFrame: Record<string, Record<string, string | null>>;
}

const geometry = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "../designs/figma-2026-11-05/geometry.json"), "utf8"),
) as Geometry;

const fixtureImage = path.resolve(process.cwd(), "../backend/tests/fixtures/video/synthetic-frame.png");
const RESULTS_PATH = path.resolve(
  process.env.DATASETFACTORY_CACHE_ROOT ?? "D:/DatasetFactory/cache",
  "playwright",
  "fe022-parity.jsonl",
);

type Screen = "upload" | "profile" | "run" | "review";

interface KeyControl {
  label: string;
  layer: string;
  pick: "first" | "last";
  selector: string;
}

interface ScreenSpec {
  column: { layer: string; selector: string } | null;
  /** Picture field: its height follows the width (`aspect`) or is fixed. */
  image: { layer: string; selector: string; height: "aspect" | "fixed" };
  keys: KeyControl[];
  ready: string;
  route: string;
  root: string;
}

const SCREENS: Record<Screen, ScreenSpec> = {
  upload: {
    column: null,
    image: { layer: "Frame 126", selector: ".df-file-tile__pick", height: "aspect" },
    keys: [],
    ready: ".df-file-tile__pick",
    root: ".df-upload",
    route: "/materials",
  },
  profile: {
    column: { layer: "frame-side", selector: ".df-profile-workspace__controls" },
    image: {
      layer: "Frame 126",
      selector: ".df-profile-workspace__canvas .df-region-overlay",
      height: "fixed",
    },
    keys: [
      { label: "Save profile", layer: "game-x", pick: "first", selector: ".df-profile-workspace__save" },
      { label: "Class groups", layer: "class-list", pick: "first", selector: ".df-class-groups" },
    ],
    ready: ".df-region-overlay__surface",
    root: ".df-profile-workspace",
    route: "/profiles",
  },
  run: {
    column: { layer: "cross-view", selector: ".df-run-setup__column" },
    image: { layer: "Frame 126", selector: ".df-run-setup__preview", height: "aspect" },
    keys: [{ label: "Run", layer: "save-profile", pick: "last", selector: ".df-run-setup__run" }],
    ready: ".df-reference-image__img",
    root: ".df-run-setup",
    route: "/run",
  },
  review: {
    column: { layer: "Frame 53", selector: ".df-review-workspace__side-column" },
    image: {
      layer: "Frame 126",
      selector: ".df-review-workspace__preview .df-region-overlay",
      height: "fixed",
    },
    keys: [
      { label: "Filters", layer: "frame-navi-filter", pick: "first", selector: ".df-review-frame-filters" },
      { label: "Repeat Previous", layer: "Frame 54", pick: "first", selector: ".df-review-copy" },
    ],
    ready: ".df-region-overlay__surface",
    root: ".df-review-workspace",
    route: "/annotations/run-1",
  },
};

/** Figma texts that are sample data, not interface labels. */
function isDataText(text: string): boolean {
  return (
    /^\(\d+\)$/.test(text) ||
    /^\d+(\/\d+)?$/.test(text) ||
    ["health & armour", "timer", "Quake champions (material title)", "Some profile title"].includes(
      text,
    )
  );
}

/** "All (25)" is a label with a data count: the label part must be there. */
function labelPart(text: string): string {
  return text.replace(/\s*\(\d+\)$/, "");
}

function layerRow(frame: Frame, layer: string, pick: "first" | "last"): Row {
  const rows = frame.rows.filter((row) => row[0] === "f" && row[row.length - 1] === layer);
  const row = pick === "first" ? rows[0] : rows[rows.length - 1];
  if (row === undefined) {
    throw new Error(`Figma frame ${frame.id} has no layer ${layer}`);
  }
  return row;
}

// --- deterministic API ------------------------------------------------------

const REGIONS = [
  { id: "region-a", name: "Region A", x: 40, y: 40, width: 220, height: 60, allowed_chars: "12", page_segmentation_mode: 7 },
  { id: "region-b", name: "Region B", x: 520, y: 30, width: 180, height: 50, allowed_chars: null, page_segmentation_mode: null },
  { id: "region-c", name: "Region C", x: 900, y: 600, width: 200, height: 80, allowed_chars: "3", page_segmentation_mode: 7 },
];

const CATEGORIES = [
  { id: "cat-life", name: "Life", kind: "game" as const },
  { id: "cat-clock", name: "Clock", kind: "game" as const },
  { id: "cat-1", name: "1", kind: "character" as const },
  { id: "cat-2", name: "2", kind: "character" as const },
  { id: "cat-3", name: "3", kind: "character" as const },
];

const PROFILE: GameProfile = profileFixture({
  categories: CATEGORIES,
  name: "Parity profile",
  regions: REGIONS,
  source_height: 852,
  source_width: 1280,
});

const SUMMARIES = [0, 1, 2].map((index) =>
  frameSummaryFixture({
    frame_index: index,
    height: 852,
    id: `frame-${String(index + 1)}`,
    timestamp_ms: index * 1000,
    width: 1280,
  }),
);

const FRAME = frameDetailFixture({
  annotations: [
    annotationFixture({ id: "ann-1", category_id: "cat-life", x: 60, y: 50, width: 180, height: 40 }),
    annotationFixture({ id: "ann-2", category_id: "cat-clock", x: 540, y: 40, width: 120, height: 36 }),
    annotationFixture({ id: "ann-3", category_id: "cat-2", x: 920, y: 610, width: 40, height: 50 }),
  ],
  frame_index: 0,
  height: 852,
  id: "frame-1",
  width: 1280,
});

const RUN = runFixture({ completed_frames: 3, current_stage: "review", status: "review_ready", total_frames: 3 });

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
    if (pathname === "/dashboard") {
      await fulfill(route, emptyDashboard());
      return;
    }
    if (pathname === "/materials") {
      await fulfill(route, {
        items: [materialFixture({ basename: "parity.mp4", height: 852, width: 1280 })],
        page: 1,
        page_size: 100,
        total: 1,
      });
      return;
    }
    if (pathname === "/profiles") {
      await fulfill(route, [
        profileSummaryFixture({ category_count: 5, name: PROFILE.name, region_count: 3, source_height: 852, source_width: 1280 }),
      ]);
      return;
    }
    if (pathname === "/profiles/current" || pathname === "/profiles/profile-1") {
      await fulfill(route, PROFILE);
      return;
    }
    if (pathname === "/runs/run-1") {
      await fulfill(route, RUN);
      return;
    }
    if (pathname === "/runs/run-1/frames") {
      const status = url.searchParams.get("review_status");
      const items = status === null || status === "pending" ? SUMMARIES : [];
      const pageSize = Number(url.searchParams.get("page_size") ?? "100");
      await fulfill(route, framePageFixture({ items: items.slice(0, pageSize), page_size: pageSize, total: items.length }));
      return;
    }
    if (pathname === "/frames/frame-1/annotations/previous-classes") {
      await fulfill(route, { classes: [], previous_frame_id: null, previous_frame_index: null });
      return;
    }
    if (pathname.startsWith("/frames/")) {
      await fulfill(route, FRAME);
      return;
    }
    await fulfill(route, dashboardFixture({ run: null }));
  });
}

// --- measurement --------------------------------------------------------------

interface Measured {
  barText: string;
  clientWidth: number;
  /** Right edge of the content area: `main`, which excludes the reserved gutter. */
  contentRight: number;
  column: DOMRectLike | null;
  contentBottom: number;
  image: DOMRectLike | null;
  keys: (DOMRectLike | null)[];
  notices: number;
  origin: number;
  radiusViolations: string[];
  root: DOMRectLike | null;
  scrollWidth: number;
  texts: string[];
}

interface DOMRectLike {
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

async function measure(page: Page, spec: ScreenSpec): Promise<Measured> {
  return page.evaluate(
    ({ columnSelector, imageSelector, keySelectors, rootSelector }) => {
      const visible = (element: Element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const rect = (selector: string | null) => {
        if (selector === null) return null;
        const element = Array.from(document.querySelectorAll(selector)).find(visible);
        if (element === undefined) return null;
        const box = element.getBoundingClientRect();
        return {
          height: box.height,
          left: box.left,
          right: box.right,
          top: box.top + window.scrollY,
          width: box.width,
        };
      };
      const strip = document.querySelector(".df-side-nav--strip");
      const origin = strip !== null && visible(strip) ? strip.getBoundingClientRect().right : 0;
      const main = document.querySelector("main");
      let contentBottom = 0;
      for (const element of Array.from(main?.querySelectorAll("*") ?? [])) {
        if (!visible(element)) continue;
        if (element.closest(".df-visually-hidden, [hidden], dialog")) continue;
        contentBottom = Math.max(contentBottom, element.getBoundingClientRect().bottom + window.scrollY);
      }
      const texts = new Set<string>();
      for (const line of document.body.innerText.split("\n")) {
        const trimmed = line.trim();
        if (trimmed !== "") texts.add(trimmed);
      }
      for (const element of Array.from(document.querySelectorAll("input, button, a, [aria-label]"))) {
        if (!visible(element)) continue;
        for (const value of [
          element.getAttribute("placeholder"),
          element.getAttribute("aria-label"),
          element instanceof HTMLInputElement ? element.value : null,
          element instanceof HTMLInputElement ? (element.labels?.[0]?.textContent ?? null) : null,
        ]) {
          if (value !== null && value.trim() !== "") texts.add(value.trim());
        }
      }
      const radiusViolations: string[] = [];
      const radiusTargets = document.querySelectorAll(
        "main .df-panel, main .df-button, main .df-field__control, main .df-grouped-options__control, main .df-region-overlay, main .df-file-tile__pick",
      );
      for (const element of Array.from(radiusTargets)) {
        if (!visible(element)) continue;
        if (element.closest(".df-review-frame-filters, .df-shell__segments")) continue;
        const style = getComputedStyle(element);
        const bordered =
          parseFloat(style.borderTopWidth) > 0 && !/rgba\(.*, 0\)$/.test(style.borderTopColor);
        if (!bordered) continue;
        const radius = parseFloat(style.borderTopLeftRadius);
        if (![4, 8].includes(Math.round(radius))) {
          radiusViolations.push(`${element.className.toString().slice(0, 60)}=${String(radius)}`);
        }
      }
      return {
        barText: document.querySelector("header")?.textContent === undefined
          ? ""
          : (document.querySelector("header") as HTMLElement).innerText.trim(),
        clientWidth: document.documentElement.clientWidth,
        column: rect(columnSelector),
        contentRight: document.querySelector("main")?.getBoundingClientRect().right ?? 0,
        contentBottom,
        image: rect(imageSelector),
        keys: keySelectors.map((selector) => rect(selector)),
        notices: document.querySelectorAll("main .df-notice").length,
        origin,
        radiusViolations,
        root: rect(rootSelector),
        scrollWidth: document.documentElement.scrollWidth,
        texts: Array.from(texts),
      };
    },
    {
      columnSelector: spec.column?.selector ?? null,
      imageSelector: spec.image.selector,
      keySelectors: spec.keys.map((key) => key.selector),
      rootSelector: spec.root,
    },
  );
}

async function openScreen(
  browser: Browser,
  screen: Screen,
  width: number,
  options: { collapseStrip?: boolean } = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const phone = width < 768;
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    hasTouch: phone,
    isMobile: phone,
    viewport: { height: 900, width },
  });
  const page = await context.newPage();
  await installApi(page);
  await page.goto(SCREENS[screen].route);
  await page.locator(SCREENS[screen].ready).first().waitFor({ state: "visible" });
  if (options.collapseStrip === true) {
    // FE-023: ☰ collapses the strip; the side bar has no |← control any more.
    const toggle = page.getByRole("button", { name: "Sections", exact: true });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  }
  // Fonts, images and the fill layout settle before measuring.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  return { context, page };
}

interface FrameResult {
  checks: Record<string, string>;
  failures: string[];
  frame: string;
  mode: "strip" | "collapsed" | "phone";
  screen: Screen;
  width: number;
}

/**
 * One JSON line per measured frame. Appended rather than collected in memory:
 * a failing test restarts the worker, and the table must keep every frame.
 */
function record(result: FrameResult): void {
  fs.mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
  fs.appendFileSync(RESULTS_PATH, `${JSON.stringify(result)}
`);
}

function within(actual: number, expected: number, tolerance: number): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

function checkFrame(
  screen: Screen,
  width: number,
  frame: Frame,
  measured: Measured,
  mode: FrameResult["mode"],
): FrameResult {
  const spec = SCREENS[screen];
  const failures: string[] = [];
  const checks: Record<string, string> = {};
  const contentWidth = measured.contentRight - measured.origin;
  // Option A: fluid widths shrink by what the strip and the platform take.
  const delta = mode === "strip" ? frame.w - contentWidth : 0;

  // Page margin.
  if (measured.root === null) {
    failures.push("screen root missing");
  } else {
    const left = measured.root.left - measured.origin;
    const right = measured.contentRight - measured.root.right;
    checks.margin = `${left.toFixed(0)}/${right.toFixed(0)}`;
    if (!within(left, 16, 1) || !within(right, 16, 1)) {
      failures.push(`margin ${checks.margin} ≠ 16±1`);
    }
  }

  // Left column.
  if (spec.column !== null) {
    const column = frame.rows.find((row) => row[0] === "f" && row[row.length - 1] === spec.column?.layer);
    if (column !== undefined && column[3] < frame.w - 40) {
      const expected = column[3];
      const actual = measured.column?.width ?? -1;
      checks.column = `${actual.toFixed(0)}/${String(expected)}`;
      if (!within(actual, expected, 4)) failures.push(`column ${checks.column} ≠ ±4`);
    }
  }

  // Picture field.
  const imageRow = layerRow(frame, spec.image.layer, "first");
  const expectedWidth = imageRow[3] - delta;
  const expectedHeight =
    spec.image.height === "aspect" ? imageRow[4] * (expectedWidth / imageRow[3]) : imageRow[4];
  const image = measured.image;
  if (image === null) {
    failures.push("picture field missing");
  } else {
    const dw = image.width / expectedWidth - 1;
    const dh = image.height / expectedHeight - 1;
    checks.image = `${image.width.toFixed(0)}×${image.height.toFixed(0)} vs ${expectedWidth.toFixed(0)}×${expectedHeight.toFixed(0)} (${(dw * 100).toFixed(1)}%/${(dh * 100).toFixed(1)}%)`;
    if (Math.abs(dw) > 0.04 || Math.abs(dh) > 0.04) failures.push(`picture ${checks.image} beyond ±4%`);
  }

  // Key controls.
  spec.keys.forEach((key, index) => {
    const row = frame.rows.filter((item) => item[0] === "f" && item[item.length - 1] === key.layer);
    const figma = key.pick === "first" ? row[0] : row[row.length - 1];
    const actual = measured.keys[index];
    if (figma === undefined) return;
    if (actual === null || actual === undefined) {
      failures.push(`${key.label} missing`);
      return;
    }
    checks[key.label] = `y ${actual.top.toFixed(0)}/${String(figma[2])}`;
    if (actual.top > figma[2] + 32) failures.push(`${key.label} y ${actual.top.toFixed(0)} > ${String(figma[2])}+32`);
    if (figma[2] < 900 && actual.top >= 900) failures.push(`${key.label} below the fold`);
  });

  // Labels.
  const missing = frame.rows
    .filter((row) => row[0] === "t")
    .map((row) => String(row[6]))
    .filter((text) => !isDataText(text))
    .map(labelPart)
    .filter((text) => !measured.texts.some((seen) => seen === text || seen.startsWith(`${text} `) || seen.startsWith(`${text}(`)));
  checks.labels = missing.length === 0 ? "ok" : `missing ${missing.join(", ")}`;
  if (missing.length > 0) failures.push(`labels missing: ${missing.join(", ")}`);

  // Content bottom.
  const limit = frame.contentBottom * 1.1;
  checks.bottom = `${measured.contentBottom.toFixed(0)}/${String(frame.contentBottom)}`;
  if (measured.contentBottom > limit) failures.push(`content bottom ${checks.bottom} > +10%`);

  // Radii, warnings, bar.
  if (measured.radiusViolations.length > 0) failures.push(`radii ${measured.radiusViolations.join("; ")}`);
  if (measured.notices > 0) failures.push(`${String(measured.notices)} warning blocks`);
  if (measured.barText !== "") failures.push(`bar text "${measured.barText}"`);
  if (measured.scrollWidth > measured.clientWidth) failures.push("horizontal scroll");

  return { checks, failures, frame: frame.id, mode, screen, width };
}


const FRAMES: [Screen, number, string][] = [];
for (const [screen, widths] of Object.entries(geometry.screenToFrame)) {
  for (const [width, frameId] of Object.entries(widths)) {
    if (frameId !== null) FRAMES.push([screen as Screen, Number(width), frameId]);
  }
}

test.describe("FE-022 Figma parity — the 14 designed frames", () => {
  test("covers exactly the 14 designed frames", () => {
    expect(FRAMES).toHaveLength(14);
    fs.rmSync(RESULTS_PATH, { force: true });
  });

  for (const [screen, width, frameId] of FRAMES) {
    test(`${screen} ${String(width)} (${frameId})`, async ({ browser }) => {
      const { context, page } = await openScreen(browser, screen, width);
      try {
        const measured = await measure(page, SCREENS[screen]);
        const result = checkFrame(screen, width, geometry.frames[frameId], measured, width < 768 ? "phone" : "strip");
        record(result);
        expect(result.failures, JSON.stringify(result.checks)).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }

  // With the strip collapsed the wide frames must match Figma 1:1.
  for (const [screen, width, frameId] of FRAMES.filter(([, w]) => w >= 768)) {
    test(`${screen} ${String(width)} (${frameId}) — strip collapsed, literal`, async ({ browser }) => {
      const { context, page } = await openScreen(browser, screen, width, { collapseStrip: true });
      try {
        const measured = await measure(page, SCREENS[screen]);
        expect(measured.origin).toBe(0);
        const result = checkFrame(screen, width, geometry.frames[frameId], measured, "collapsed");
        record(result);
        expect(result.failures, JSON.stringify(result.checks)).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
});

test.describe("FE-022 every screen at every width", () => {
  const WIDTHS = [360, 576, 768, 992, 1200, 1400, 1440, 1920];
  for (const screen of Object.keys(SCREENS) as Screen[]) {
    test(`${screen}: no horizontal scroll, side bar per width`, async ({ browser }) => {
      for (const width of WIDTHS) {
        const { context, page } = await openScreen(browser, screen, width);
        try {
          const scroll = await page.evaluate(() => ({
            client: document.documentElement.clientWidth,
            scroll: document.documentElement.scrollWidth,
          }));
          expect(scroll.scroll, `${screen} ${String(width)}`).toBeLessThanOrEqual(scroll.client);
          const toggle = page.getByRole("button", { name: "Sections", exact: true });
          if (width < 768) {
            await expect(page.locator(".df-side-nav--strip")).toHaveCount(0);
            await expect(toggle).toHaveAttribute("aria-expanded", "false");
            await toggle.click();
            const drawer = page.getByRole("dialog", { name: "Sections" });
            await expect(drawer).toBeVisible();
            await expect(drawer.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Annotations" })).toBeVisible();
            await page.keyboard.press("Escape");
            await expect(drawer).toBeHidden();
            await expect(toggle).toBeFocused();
          } else {
            const strip = page.getByRole("navigation", { name: "Sections" });
            await expect(strip).toBeVisible();
            await expect(strip.getByRole("link", { name: "Setup for scan" })).toBeVisible();
            await expect(toggle).toHaveAttribute("aria-expanded", "true");
          }
        } finally {
          await context.close();
        }
      }
    });
  }
});
