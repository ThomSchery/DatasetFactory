import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const referenceImage = path.join(
  repositoryRoot,
  "backend/tests/fixtures/video/synthetic-frame.png",
);
const fixtureVideo = path.join(repositoryRoot, "backend/tests/fixtures/video/synthetic-hud.mkv");
const apiBase = "http://127.0.0.1:8000/api/v1";

interface RunSnapshot {
  id: string;
  status: string;
  version: number;
}

async function apiJson<T>(request: APIRequestContext, pathname: string): Promise<T> {
  const response = await request.get(`${apiBase}${pathname}`);
  expect(response.ok(), `${pathname}: ${await response.text()}`).toBe(true);
  return response.json() as Promise<T>;
}

function isDashboardGet(response: { request(): { method(): string }; url(): string }): boolean {
  return (
    response.request().method() === "GET" &&
    new URL(response.url()).pathname === "/api/v1/dashboard"
  );
}

function currentWindowsIdentity(): string {
  const result = spawnSync("whoami.exe", [], { encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
  const identity = result.stdout.trim();
  expect(identity).not.toBe("");
  return identity;
}

function denyWorkspaceWrites(workspaceRoot: string, identity: string): void {
  const result = spawnSync(
    "icacls.exe",
    [workspaceRoot, "/deny", `${identity}:(DC)`, `${identity}:(OI)(IO)(D)`],
    { encoding: "utf8" },
  );
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
}

function restoreWorkspaceWrites(workspaceRoot: string, identity: string): void {
  const result = spawnSync("icacls.exe", [workspaceRoot, "/remove:d", identity], {
    encoding: "utf8",
  });
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  for (const entry of fs.readdirSync(workspaceRoot)) {
    if (entry.startsWith(".df-write-")) {
      fs.rmSync(path.join(workspaceRoot, entry), { force: true });
    }
  }
}

async function createProfile(page: Page): Promise<void> {
  await page.goto("/profiles/new");
  await page.getByLabel("Nazwa profilu").fill("Gra testowa E2E błędy");
  await page.getByRole("button", { name: "Użyj ścieżki ręcznej" }).click();
  await page.getByLabel("Ścieżka obrazu referencyjnego").fill(referenceImage);
  await page.getByRole("button", { name: "Wczytaj podgląd" }).click();
  const surface = page.getByRole("listbox", {
    name: "Regiony HUD na obrazie referencyjnym",
  });
  const bounds = await surface.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error("Region drawing surface has no browser geometry");
  }
  const from = { clientX: bounds.x + bounds.width * 0.2, clientY: bounds.y + bounds.height * 0.2 };
  const to = { clientX: bounds.x + bounds.width * 0.8, clientY: bounds.y + bounds.height * 0.6 };
  await surface.dispatchEvent("pointerdown", { ...from, pointerId: 11 });
  await surface.dispatchEvent("pointermove", { ...to, pointerId: 11 });
  await surface.dispatchEvent("pointerup", { ...to, pointerId: 11 });
  await page.getByRole("button", { name: "7", exact: true }).click();
  const initialDashboardResponse = page.waitForResponse(isDashboardGet);
  await page.getByRole("button", { name: "Utwórz profil" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Materiały");
  expect((await initialDashboardResponse).ok()).toBe(true);
}

async function cancelRunBestEffort(request: APIRequestContext, runId: string | null) {
  if (runId === null) {
    return;
  }
  const current = await request.get(`${apiBase}/runs/${runId}`);
  if (!current.ok()) {
    return;
  }
  const run = (await current.json()) as RunSnapshot;
  if (run.status === "completed" || run.status === "cancelled") {
    return;
  }
  await request.post(`${apiBase}/runs/${runId}/cancel`, {
    data: { expected_version: run.version },
  });
}

test("pokazuje kod i copy dla brakującego źródła, active_run i workspace", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const runtimeRoot = process.env.DATASETFACTORY_E2E_ROOT;
  expect(runtimeRoot).toBeTruthy();
  if (runtimeRoot === undefined) {
    throw new Error("E2E runtime root was not configured by the launcher");
  }
  const controlRoot = path.join(runtimeRoot, "control");
  const holdOcr = path.join(controlRoot, "hold-ocr");
  const ocrEntered = path.join(controlRoot, "ocr-entered");
  const workspaceRoot = path.join(runtimeRoot, "workspace");
  const windowsIdentity = currentWindowsIdentity();
  fs.mkdirSync(controlRoot, { recursive: true });
  fs.rmSync(holdOcr, { force: true });
  fs.rmSync(ocrEntered, { force: true });

  let queuedRunId: string | null = null;
  let slotOwnerRunId: string | null = null;
  let workspaceWriteDenied = false;
  try {
    const initialMaterialsDashboard = page.waitForResponse(isDashboardGet);
    await page.goto("/materials");
    expect((await initialMaterialsDashboard).ok()).toBe(true);
    const missingSource = path.join(runtimeRoot, "missing-source.mkv");
    expect(fs.existsSync(missingSource)).toBe(false);
    await page.getByLabel("Ścieżka pliku wideo").fill(missingSource);
    const sourceResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/materials" &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Zaimportuj materiał" }).click();
    const sourceResponse = await sourceResponsePromise;
    expect(sourceResponse.status()).toBe(404);
    expect((await sourceResponse.json()) as { error: { code: string } }).toMatchObject({
      error: { code: "source_missing" },
    });
    const sourceAlert = page.getByRole("alert");
    await expect(sourceAlert).toContainText("Plik źródłowy nie istnieje pod zapisaną ścieżką.");
    await expect(sourceAlert).toContainText("Przywróć plik w tym samym miejscu");
    await expect(page.getByText("source_missing", { exact: true })).toBeVisible();

    await createProfile(page);
    await page.getByLabel("Ścieżka pliku wideo").fill(fixtureVideo);
    await page.getByRole("button", { name: "Zaimportuj materiał" }).click();
    const materialSelect = page.getByRole("combobox", { name: "Materiał", exact: true });
    await expect(materialSelect).toContainText("synthetic-hud.mkv");
    await materialSelect.selectOption({ index: 1 });
    await page
      .getByRole("combobox", { name: "Profil gry", exact: true })
      .selectOption({ index: 1 });
    const createRunResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/v1/runs",
    );
    const createdDashboardResponse = page.waitForResponse(isDashboardGet);
    await page.getByRole("button", { name: "Utwórz run" }).click();
    const createdRunResponse = await createRunResponse;
    expect(createdRunResponse.status(), await createdRunResponse.text()).toBe(201);
    const queuedRun = (await createdRunResponse.json()) as RunSnapshot;
    queuedRunId = queuedRun.id;
    const dashboardAfterCreate = await createdDashboardResponse;
    expect(dashboardAfterCreate.ok(), await dashboardAfterCreate.text()).toBe(true);
    expect((await dashboardAfterCreate.json()) as { run: RunSnapshot | null }).toMatchObject({
      run: { id: queuedRunId, status: "queued" },
    });
    const visibleStart = page.getByRole("button", { name: "Uruchom" });
    await expect(visibleStart).toBeVisible();

    const profile = await apiJson<{ id: string }>(request, "/profiles/current");
    const materials = await apiJson<{ items: { id: string }[] }>(
      request,
      "/materials?page=1&page_size=100",
    );
    const materialId = materials.items[0]?.id;
    expect(materialId).toBeTruthy();
    if (materialId === undefined) {
      throw new Error("Imported material id missing");
    }
    const createSlotOwner = await request.post(`${apiBase}/runs`, {
      data: { interval_ms: 1000, profile_id: profile.id, video_id: materialId },
    });
    expect(createSlotOwner.status(), await createSlotOwner.text()).toBe(201);
    const slotOwner = (await createSlotOwner.json()) as RunSnapshot;
    slotOwnerRunId = slotOwner.id;

    fs.writeFileSync(holdOcr, "0", "utf8");
    const startSlotOwner = await request.post(`${apiBase}/runs/${slotOwner.id}/start`, {
      data: { expected_version: slotOwner.version },
    });
    expect(startSlotOwner.status(), await startSlotOwner.text()).toBe(202);

    const conflictResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/v1/runs/${queuedRunId}/start` &&
        response.request().method() === "POST",
    );
    await visibleStart.click();
    const conflictResponse = await conflictResponsePromise;
    expect(conflictResponse.status()).toBe(409);
    expect((await conflictResponse.json()) as { error: { code: string } }).toMatchObject({
      error: { code: "active_run" },
    });
    const activeRunAlert = page.getByRole("alert");
    await expect(activeRunAlert).toContainText("Inny run jest już aktywny.");
    await expect(activeRunAlert).toContainText("Zatrzymaj lub dokończ bieżący run");
    await expect.poll(() => fs.existsSync(ocrEntered), { timeout: 20_000 }).toBe(true);

    fs.rmSync(holdOcr, { force: true });
    await cancelRunBestEffort(request, slotOwnerRunId);
    await expect
      .poll(async () => (await apiJson<RunSnapshot>(request, `/runs/${slotOwner.id}`)).status, {
        timeout: 20_000,
      })
      .toBe("cancelled");
    await cancelRunBestEffort(request, queuedRunId);

    denyWorkspaceWrites(workspaceRoot, windowsIdentity);
    workspaceWriteDenied = true;
    const healthResponse = await request.get(`${apiBase}/health`);
    expect(healthResponse.status()).toBe(503);
    expect(
      (await healthResponse.json()) as {
        error: { code: string; details: { health: { workspace: unknown } } };
      },
    ).toMatchObject({
      error: {
        code: "dependency_unavailable",
        details: {
          health: {
            workspace: { available: false, critical: true, detail: "unavailable" },
          },
        },
      },
    });

    await page.goto("/");
    const systemPanel = page.getByRole("region", { name: "Stan systemu" });
    await expect(systemPanel).toContainText("Niedostępny");
    const workspaceRow = systemPanel.getByRole("listitem").filter({ hasText: "Katalog roboczy" });
    await expect(workspaceRow).toContainText("Niedostępny");
    await expect(workspaceRow).toContainText("unavailable");
  } finally {
    fs.rmSync(holdOcr, { force: true });
    if (workspaceWriteDenied) {
      restoreWorkspaceWrites(workspaceRoot, windowsIdentity);
      workspaceWriteDenied = false;
    }
    await cancelRunBestEffort(request, slotOwnerRunId);
    await cancelRunBestEffort(request, queuedRunId);
  }

  const restoredHealth = await request.get(`${apiBase}/health`);
  expect(restoredHealth.ok(), await restoredHealth.text()).toBe(true);
});
