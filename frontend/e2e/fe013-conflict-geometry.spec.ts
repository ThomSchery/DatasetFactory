import { expect, test, type Locator, type Page } from "@playwright/test";

import { ApiHarness } from "./apiHarness";
import { showWholeFrame } from "./profileFlow";

/*
 * FE-013-FIX2 FIX-A. The conflict alert used to take the docked panel's `auto`
 * column, starve the action column and push "Save class" past the panel's left
 * edge: the button was still visible and still worked from the keyboard, so
 * `toBeVisible` passed while a plain mouse click landed on the dialog instead.
 * These assertions are therefore geometric — containment plus a hit test —
 * and finish with a real mouse click that has to produce the PATCH.
 */

interface PanelGeometry {
  hitTag: string;
  hitIsSaveButton: boolean;
  panel: { bottom: number; left: number; right: number; top: number };
  save: { bottom: number; left: number; right: number; top: number };
}

async function measure(page: Page, panel: Locator, save: Locator): Promise<PanelGeometry> {
  return panel.evaluate((panelElement, saveSelector) => {
    const saveElement = panelElement.querySelector(saveSelector);
    if (!(saveElement instanceof HTMLElement)) {
      throw new Error("FE-013 save button is not in the panel");
    }
    const panelRect = panelElement.getBoundingClientRect();
    const saveRect = saveElement.getBoundingClientRect();
    const hit = document.elementFromPoint(
      saveRect.left + saveRect.width / 2,
      saveRect.top + saveRect.height / 2,
    );
    return {
      hitTag: hit === null ? "none" : hit.tagName.toLowerCase(),
      hitIsSaveButton: hit !== null && hit.closest(saveSelector) === saveElement,
      panel: {
        bottom: panelRect.bottom,
        left: panelRect.left,
        right: panelRect.right,
        top: panelRect.top,
      },
      save: {
        bottom: saveRect.bottom,
        left: saveRect.left,
        right: saveRect.right,
        top: saveRect.top,
      },
    };
  }, '[aria-label="Change class: assign another class to this box"]');
}

function expectContained(geometry: PanelGeometry): void {
  expect(geometry.save.left).toBeGreaterThanOrEqual(geometry.panel.left);
  expect(geometry.save.right).toBeLessThanOrEqual(geometry.panel.right);
  expect(geometry.save.top).toBeGreaterThanOrEqual(geometry.panel.top);
  expect(geometry.save.bottom).toBeLessThanOrEqual(geometry.panel.bottom);
  expect(geometry.hitIsSaveButton).toBe(true);
}

const conflicts = [
  { id: "long-s", name: "ſ", typed: "s", proposed: "S" },
  { id: "ligature-ff", name: "ﬀ", typed: "ff", proposed: "ff" },
];

for (const conflict of conflicts) {
  test(`FE-013 keeps the save button clickable after the ${conflict.name} conflict`, async ({
    page,
  }) => {
    const api = new ApiHarness({
      categoryConflict: {
        detail: "details",
        winner: { id: conflict.id, kind: "game", name: conflict.name },
      },
      phase: "review",
    });
    await api.install(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/annotations/run-1");
    await showWholeFrame(page);

    await page.getByRole("button", { name: /Class .* 1 annotations/ }).click();
    const panel = page.getByRole("dialog", { name: /Edit annotation/ });
    const filter = panel.getByRole("combobox", { name: "Class" });
    await filter.fill(conflict.typed);
    await panel
      .getByRole("button", { name: `Create and assign class “${conflict.proposed}”` })
      .click();

    await expect(panel.getByRole("alert")).toContainText("already exists in the profile");
    const save = panel.getByRole("button", { name: "Change class: assign another class to this box" });
    const afterConflict = await measure(page, panel, save);
    expectContained(afterConflict);

    // The alert carries operator input, so its length is not bounded by the
    // dictionary copy. Both a very long wrapping message and one unbreakable
    // token have to leave the action row where it is.
    for (const injected of ["Lista ".repeat(300), "ſ".repeat(400)]) {
      await panel.getByRole("alert").evaluate((alert, text) => {
        const target = alert.querySelector("span:not([aria-hidden])");
        if (!(target instanceof HTMLElement)) {
          throw new Error("FE-013 alert has no message span");
        }
        target.textContent = text;
      }, injected);
      expectContained(await measure(page, panel, save));
    }
    await expect(panel.getByRole("alert")).toBeVisible();

    const writesBefore = api.requests.filter(
      (request) => !["GET", "HEAD", "OPTIONS"].includes(request.method),
    ).length;
    await save.click();

    await expect
      .poll(() =>
        api.requests.filter(
          (request) => request.method === "PATCH" && request.pathname.startsWith("/annotations/"),
        ),
      )
      .toHaveLength(1);
    const patch = api.requests.find((request) => request.method === "PATCH");
    expect(patch?.body).toEqual({ category_id: conflict.id, expected_version: 3 });
    expect(
      api.requests.filter((request) => !["GET", "HEAD", "OPTIONS"].includes(request.method)).length,
    ).toBe(writesBefore + 1);

    console.log(
      `FE013_FIX2_GEOMETRY ${JSON.stringify({
        conflict: conflict.name,
        hitTag: afterConflict.hitTag,
        panel: afterConflict.panel,
        save: afterConflict.save,
      })}`,
    );
  });
}

test("FE-013 offers manual recovery when the backend names no winner", async ({ page }) => {
  const api = new ApiHarness({
    categoryConflict: { detail: "none", winner: { id: "long-s", kind: "game", name: "ſ" } },
    phase: "review",
  });
  await api.install(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/annotations/run-1");
  await showWholeFrame(page);

  await page.getByRole("button", { name: /Class .* 1 annotations/ }).click();
  const panel = page.getByRole("dialog", { name: /Edit annotation/ });
  const filter = panel.getByRole("combobox", { name: "Class" });
  await filter.fill("s");
  await panel.getByRole("button", { name: "Create and assign class “S”" }).click();

  const alert = panel.getByRole("alert");
  await expect(alert).toContainText("A class with this name already exists in the profile.");
  await expect(alert).toContainText("Pick the existing class from the list");
  await expect(alert).not.toContainText("wybrana");
  await expect(filter).toHaveValue("");
  await expect(panel.getByRole("option", { name: "ſ" })).toBeVisible();
  await expect(panel.getByRole("option", { name: "ſ" })).toHaveAttribute("aria-selected", "false");
  await expect(panel.getByRole("button", { name: "Change class: assign another class to this box" })).toBeDisabled();
  await expect(panel.getByRole("button", { name: /Create and assign class/ })).toHaveCount(0);

  await panel.getByRole("option", { name: "ſ" }).click();
  const save = panel.getByRole("button", { name: "Change class: assign another class to this box" });
  expectContained(await measure(page, panel, save));
  await save.click();

  await expect
    .poll(() => api.requests.filter((request) => request.method === "PATCH"))
    .toHaveLength(1);
  expect(api.requests.find((request) => request.method === "PATCH")?.body).toEqual({
    category_id: "long-s",
    expected_version: 3,
  });
});
