import { expect, test } from "@playwright/test";
import path from "node:path";

const apiBase = `http://127.0.0.1:${process.env.DF_E2E_BACKEND_PORT ?? "8000"}/api/v1`;
const imagePath = path.resolve(process.cwd(), "../backend/tests/fixtures/video/synthetic-frame.png");

test("FIX2: move and resize the selected profile region and persist its geometry", async ({ page, request }) => {
  const created = await request.post(`${apiBase}/profiles`, { data: {
    name: `FIX2 geometry ${Date.now()}`, reference_image_path: imagePath,
    regions: [{ name: "HUD", x: 100, y: 100, width: 600, height: 300, allowed_chars: "7", page_segmentation_mode: 7 }],
    categories: [{ name: "7", kind: "character" }],
  } });
  expect(created.status(), await created.text()).toBe(201);
  const profile = await created.json();
  expect((await request.post(`${apiBase}/profiles/${profile.id}/activate`)).ok()).toBe(true);
  await page.goto("/profiles");
  await page.getByRole("button", { name: "Zaznacz region HUD" }).click();
  const shape = page.getByRole("option", { name: "HUD" });
  await expect(shape.locator('[data-overlay-handle="south-east"]')).toBeAttached();
  const surface = page.getByRole("listbox", { name: "Regiony HUD na zrzucie referencyjnym" });
  await surface.scrollIntoViewIfNeeded();
  const box = await surface.boundingBox();
  if (!box) throw new Error("No surface");
  const point = (x: number, y: number) => ({ x: box.x + box.width * x / 1280, y: box.y + box.height * y / 852 });
  const move = async (from: {x:number;y:number}, to: {x:number;y:number}) => {
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 }); await page.mouse.up();
  };
  const rect = shape.locator(".df-region-overlay__shape-fill");
  const start = point(400, 250); const end = point(450, 290);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await expect(rect).toHaveAttribute("x", "150"); // preview before pointerup
  await page.mouse.up();
  await expect(rect).toHaveAttribute("x", "150");
  await expect(rect).toHaveAttribute("y", "140");
  await move(point(750, 440), point(800, 480));
  await expect(rect).toHaveAttribute("width", "650");
  await expect(rect).toHaveAttribute("height", "340");
  // Blur cancels a preview instead of committing it to the draft.
  await page.mouse.move(point(450, 290).x, point(450, 290).y); await page.mouse.down();
  await page.mouse.move(point(500, 330).x, point(500, 330).y, { steps: 4 });
  await expect(rect).toHaveAttribute("x", "200");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.mouse.up();
  await expect(rect).toHaveAttribute("x", "150");
  await expect(page.getByRole("button", { name: "Save profile" })).toBeEnabled();
  const saved = page.waitForResponse((res) => res.request().method() === "PUT" && res.url().endsWith(`/profiles/${profile.id}/definition`));
  await page.getByRole("button", { name: "Save profile" }).click();
  expect((await saved).status()).toBe(200);
  const reloaded = await (await request.get(`${apiBase}/profiles/${profile.id}`)).json();
  expect(reloaded.regions[0]).toMatchObject({ x: 150, y: 140, width: 650, height: 340 });
  await page.getByRole("button", { name: "Zaznacz region HUD" }).click();
  await page.getByRole("button", { name: "Draw region" }).click();
  await move(point(300, 200), point(500, 350));
  await expect(page.getByLabel("Nazwa narysowanego regionu")).toBeVisible();
  await expect(rect).toHaveAttribute("x", "150");
});
