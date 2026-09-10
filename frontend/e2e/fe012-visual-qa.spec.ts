import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { ApiHarness } from "./apiHarness";
import { deterministicPng } from "./deterministicPng";

const screenshotDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/tickets/FE-012/screenshots",
);

/**
 * The panel after FE-012, in a real browser: no geometry controls, and the
 * unsaved marker reached the only way that is left — arrows on the canvas.
 * The measurement it prints is what the ticket asks for, so the panel height
 * and the canvas it shares the screen with come from one run.
 */
test("FE-012 panel bez sekcji geometrii nadal pokazuje niezapisane przesunięcie", async ({
  page,
}) => {
  const api = new ApiHarness({ phase: "review" });
  await api.install(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/annotations/run-1");

  const classChip = page.getByRole("button", { name: /Klasa .* 1 anotacji/ });
  await classChip.click();
  const panel = page.getByRole("dialog", { name: /Edytuj anotację/ });
  await expect(panel).toBeVisible();

  await expect(panel.getByRole("spinbutton")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Zapisz geometrię" })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Przerysuj bbox" })).toHaveCount(0);
  await expect(panel.locator("summary")).toHaveCount(0);

  const canvas = page.getByRole("listbox", { name: "Bbox anotacji na klatce" });
  const shape = canvas.getByRole("option").first();
  await classChip.focus();
  for (let step = 0; step < 3; step += 1) {
    await page.keyboard.press("ArrowRight");
  }
  await expect(shape).toHaveAttribute(
    "aria-label",
    /x 103, y 120, szerokość 40, wysokość 32/,
  );
  await expect(panel.getByText("Niezapisane")).toBeVisible();
  expect(
    api.requests.filter((request) => !["GET", "HEAD", "OPTIONS"].includes(request.method)),
  ).toEqual([]);

  const image = page.getByRole("img", { name: /Klatka .* runu/ });
  const imageBounds = await image.boundingBox();
  const panelBounds = await panel.boundingBox();
  if (imageBounds === null || panelBounds === null) {
    throw new Error("FE-012 panel or canvas has no browser geometry");
  }
  const panelBox = await panel.evaluate((element) => {
    const styles = getComputedStyle(element);
    const root = getComputedStyle(document.documentElement);
    return {
      borderWidthDefault: root.getPropertyValue("--border-width-default").trim(),
      clientHeight: element.clientHeight,
      controlHeightSm: root.getPropertyValue("--control-height-sm").trim(),
      overflowY: styles.overflowY,
      rowGap: styles.rowGap,
      scrollHeight: element.scrollHeight,
      sizeXs: root.getPropertyValue("--size-xs").trim(),
    };
  });

  expect(panelBounds.y, "panel must remain below the canvas").toBeGreaterThanOrEqual(
    imageBounds.y + imageBounds.height,
  );
  expect(panelBounds.y + panelBounds.height, "panel must fit in the viewport").toBeLessThanOrEqual(
    1000.5,
  );

  await mkdir(screenshotDirectory, { recursive: true });
  await writeFile(
    path.join(screenshotDirectory, "panel-without-geometry-1440.png"),
    deterministicPng(await panel.screenshot({ animations: "disabled" })),
  );
  await writeFile(
    path.join(screenshotDirectory, "review-1440.png"),
    deterministicPng(await page.screenshot({ animations: "disabled", fullPage: false })),
  );

  console.log(
    `FE012_PANEL ${JSON.stringify({
      canvas: { height: imageBounds.height, width: imageBounds.width },
      panel: {
        height: panelBounds.height,
        top: panelBounds.y,
        width: panelBounds.width,
        ...panelBox,
      },
      viewport: { height: 1000, width: 1440 },
    })}`,
  );
});
