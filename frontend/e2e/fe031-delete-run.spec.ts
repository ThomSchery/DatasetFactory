import { expect, test, type APIRequestContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { createProfileInWorkspace } from "./profileFlow";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const referenceImage = path.join(
  repositoryRoot,
  "backend/tests/fixtures/video/synthetic-frame.png",
);
const fixtureVideo = path.join(repositoryRoot, "backend/tests/fixtures/video/synthetic-hud.mkv");
const apiBase = `http://127.0.0.1:${process.env.DF_E2E_BACKEND_PORT ?? "8000"}/api/v1`;
const profileName = "Gra testowa E2E delete";

interface Versioned {
  id: string;
  status: string;
  version: number;
}

async function post<T>(request: APIRequestContext, pathname: string, data: unknown): Promise<T> {
  const response = await request.post(`${apiBase}${pathname}`, { data });
  expect(response.ok(), `${pathname}: ${await response.text()}`).toBe(true);
  return response.json() as Promise<T>;
}

async function get<T>(request: APIRequestContext, pathname: string): Promise<T> {
  const response = await request.get(`${apiBase}${pathname}`);
  expect(response.ok(), `${pathname}: ${await response.text()}`).toBe(true);
  return response.json() as Promise<T>;
}

function rowsOf(runtimeRoot: string, runId: string): Record<string, number> {
  const database = new DatabaseSync(path.join(runtimeRoot, "workspace", "project.db"), {
    readOnly: true,
  });
  try {
    const count = (sql: string) =>
      Number((database.prepare(sql).get(runId) as { n: number }).n);
    return {
      runs: count("SELECT COUNT(*) AS n FROM pipeline_runs WHERE id = ?"),
      frames: count("SELECT COUNT(*) AS n FROM frames WHERE run_id = ?"),
      annotations: count(
        "SELECT COUNT(*) AS n FROM annotations AS a JOIN frames AS f ON f.id = a.frame_id WHERE f.run_id = ?",
      ),
      checkpoints: count("SELECT COUNT(*) AS n FROM stage_checkpoints WHERE run_id = ?"),
    };
  } finally {
    database.close();
  }
}

test("FE-031: a finished run is deleted from the run list with its rows and files", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const runtimeRoot = process.env.DATASETFACTORY_E2E_ROOT;
  expect(runtimeRoot).toBeTruthy();
  if (runtimeRoot === undefined) throw new Error("E2E runtime root was not configured");

  await createProfileInWorkspace(page, referenceImage, profileName);
  const profiles = await get<{ id: string; name: string }[]>(request, "/profiles");
  const profile = profiles.find((item) => item.name === profileName);
  expect(profile).toBeDefined();
  if (profile === undefined) throw new Error("Saved profile is missing from the list");
  const video = await post<{ id: string }>(request, "/materials", { local_path: fixtureVideo });
  const created = await post<Versioned>(request, "/runs", {
    profile_id: profile.id,
    video_id: video.id,
    interval_ms: 500,
  });
  await post<Versioned>(request, `/runs/${created.id}/start`, {
    expected_version: created.version,
  });
  await expect
    .poll(async () => (await get<Versioned>(request, `/runs/${created.id}`)).status, {
      timeout: 30_000,
    })
    .toBe("review_ready");
  const runFiles = path.join(runtimeRoot, "workspace", "runs", created.id);
  expect(fs.existsSync(runFiles)).toBe(true);
  expect(rowsOf(runtimeRoot, created.id).frames).toBeGreaterThan(0);

  await page.goto("/annotations");
  const opener = page.getByRole("button", { name: `Delete run ${created.id}` });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Delete run" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`Run ${created.id} of ${profileName} is removed for good`);
  await page.screenshot({ path: "../docs/tickets/FE-031/delete-run-dialog.png" });

  // Escape keeps the run.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();

  await opener.click();
  const deleted = page.waitForResponse(
    (response) =>
      response.request().method() === "DELETE" &&
      new URL(response.url()).pathname === `/api/v1/runs/${created.id}`,
  );
  await dialog.getByRole("button", { name: "Delete run" }).click();
  expect((await deleted).status()).toBe(204);
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: `Delete run ${created.id}` })).toHaveCount(0);

  const detail = await request.get(`${apiBase}/runs/${created.id}`);
  expect(detail.status()).toBe(404);
  expect(rowsOf(runtimeRoot, created.id)).toEqual({
    runs: 0,
    frames: 0,
    annotations: 0,
    checkpoints: 0,
  });
  expect(fs.existsSync(runFiles)).toBe(false);
  // The run's inputs stay.
  const stillListed = await get<{ id: string }[]>(request, "/profiles");
  expect(stillListed.some((item) => item.id === profile.id)).toBe(true);
});
