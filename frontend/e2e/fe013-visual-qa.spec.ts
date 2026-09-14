import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { ApiHarness } from "./apiHarness";
import { deterministicPng } from "./deterministicPng";

const screenshotDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/tickets/FE-013/screenshots",
);

test("FE-013 pokazuje jawną akcję utworzenia klasy bez efektu pustego Enter", async ({ page }) => {
  const api = new ApiHarness({ phase: "review" });
  await api.install(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/annotations/run-1");

  await page.getByRole("button", { name: /Klasa .* 1 anotacji/ }).click();
  const panel = page.getByRole("dialog", { name: /Edytuj anotację/ });
  const filter = panel.getByRole("textbox", { name: "Klasa" });
  await expect(panel).toBeVisible();
  await expect(filter).toBeFocused();

  await filter.press("Enter");
  expect(
    api.requests.filter((request) => !["GET", "HEAD", "OPTIONS"].includes(request.method)),
  ).toEqual([]);

  await filter.fill("Health");
  const createAction = panel.getByRole("button", {
    name: "Utwórz i przypisz klasę „Health”",
  });
  await expect(createAction).toBeVisible();
  await expect(createAction).toBeInViewport();

  const panelBounds = await panel.boundingBox();
  const actionBounds = await createAction.boundingBox();
  if (panelBounds === null || actionBounds === null) {
    throw new Error("FE-013 panel or create action has no browser geometry");
  }
  expect(panelBounds.x + panelBounds.width).toBeLessThanOrEqual(1440.5);
  expect(panelBounds.y + panelBounds.height).toBeLessThanOrEqual(900.5);
  /*
   * FE-013-FIX2: the create action owns the panel's whole content track. The
   * old absolute floor of 320 px encoded the panel's pre-FE-014 width; in the
   * 288 px side column the same invariant is the panel width less its padding
   * (2 × 16 px) and border (2 × 1 px).
   */
  expect(actionBounds.width).toBeGreaterThanOrEqual(panelBounds.width - 34);

  await mkdir(screenshotDirectory, { recursive: true });
  await writeFile(
    path.join(screenshotDirectory, "create-class-action-1440.png"),
    deterministicPng(await panel.screenshot({ animations: "disabled" })),
  );

  console.log(
    `FE013_PANEL ${JSON.stringify({
      action: actionBounds,
      panel: panelBounds,
      viewport: { height: 900, width: 1440 },
    })}`,
  );
});
