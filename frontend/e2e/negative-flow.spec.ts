import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProfileInWorkspace } from "./profileFlow";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const referenceImage = path.join(
  repositoryRoot,
  "backend/tests/fixtures/video/synthetic-frame.png",
);
const fixtureVideo = path.join(repositoryRoot, "backend/tests/fixtures/video/synthetic-hud.mkv");
const apiBase = `http://127.0.0.1:${process.env.DF_E2E_BACKEND_PORT ?? "8000"}/api/v1`;

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
  await createProfileInWorkspace(page, referenceImage, "Gra testowa E2E błędy");
  await page.goto("/materials");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Upload");
}

/** FE-022 Upload: the tile's Enter path fallback. */
async function importPath(page: Page, localPath: string): Promise<void> {
  const field = page.getByLabel("Video file path");
  if (!(await field.isVisible())) {
    await page.getByRole("button", { name: "Enter path" }).click();
  }
  await field.fill(localPath);
  await page.getByRole("button", { name: "Open", exact: true }).click();
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
    await page.goto("/materials");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Upload");
    const missingSource = path.join(runtimeRoot, "missing-source.mkv");
    expect(fs.existsSync(missingSource)).toBe(false);
    const sourceResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/materials" &&
        response.request().method() === "POST",
    );
    await importPath(page, missingSource);
    const sourceResponse = await sourceResponsePromise;
    expect(sourceResponse.status()).toBe(404);
    expect((await sourceResponse.json()) as { error: { code: string } }).toMatchObject({
      error: { code: "source_missing" },
    });
    const sourceAlert = page.getByRole("alert");
    await expect(sourceAlert).toContainText("The source file no longer exists at its saved path.");
    await expect(sourceAlert).toContainText("Put the file back in the same place");
    await expect(sourceAlert).toContainText("source_missing");

    await createProfile(page);
    await importPath(page, fixtureVideo);
    await expect(page.getByText(/synthetic-hud\.mkv/).first()).toBeVisible();

    // A second run takes the single run slot first, through the API.
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

    // FE-022: Run creates the run and starts it; the start meets 409.
    await page.goto("/run");
    await page.getByLabel("Source file", { exact: true }).click();
    await page.getByRole("option", { name: /synthetic-hud\.mkv/ }).click();
    await page.getByLabel("Profile", { exact: true }).click();
    await page.getByRole("option", { name: "Gra testowa E2E błędy" }).click();
    const createRunResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/v1/runs",
    );
    const conflictResponsePromise = page.waitForResponse(
      (response) =>
        /\/api\/v1\/runs\/[^/]+\/start$/.test(new URL(response.url()).pathname) &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Run", exact: true }).click();
    const createdRunResponse = await createRunResponse;
    expect(createdRunResponse.status(), await createdRunResponse.text()).toBe(201);
    queuedRunId = ((await createdRunResponse.json()) as RunSnapshot).id;
    const conflictResponse = await conflictResponsePromise;
    expect(conflictResponse.status()).toBe(409);
    expect((await conflictResponse.json()) as { error: { code: string } }).toMatchObject({
      error: { code: "active_run" },
    });
    const activeRunAlert = page.getByRole("alert").filter({ hasText: "active_run" });
    await expect(activeRunAlert).toContainText("Another run is already active.");
    await expect(activeRunAlert).toContainText("Pause or finish the current run");
    // The run the operator asked for waits, queued; the URL stays on Run.
    expect(new URL(page.url()).pathname).toBe("/run");
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

    // FE-022: with no Dashboard, local dependencies are reported next to the
    // OCR engine, behind ⋮.
    await page.goto("/materials");
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("button", { name: "OCR engine" }).click();
    const report = page.getByRole("dialog", { name: "OCR engine" });
    const workspaceRow = report.getByRole("listitem").filter({ hasText: "Workspace" });
    await expect(workspaceRow).toContainText("Unavailable");
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
