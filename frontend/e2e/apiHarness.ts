import type { Page, Route } from "@playwright/test";
import path from "node:path";

import type { Dashboard, Export, FrameDetail, PipelineRun } from "../src/api/types";
import {
  dashboardFixture,
  emptyDashboard,
  exportFixture,
  frameDetailFixture,
  framePageFixture,
  healthFixture,
  materialFixture,
  profileFixture,
  runFixture,
} from "../src/test/fixtures";

export type HarnessPhase =
  | "empty"
  | "profile"
  | "material"
  | "queued"
  | "review"
  | "accepted"
  | "exporting"
  | "exported"
  | "completed";

export type DashboardMode = "normal" | "empty" | "error" | "loading" | "populated";

export interface CapturedRequest {
  body: unknown;
  method: string;
  pathname: string;
}

const fixtureImage = path.resolve(
  process.cwd(),
  "../backend/tests/fixtures/video/synthetic-frame.png",
);

const profile = profileFixture({
  source_width: 1280,
  source_height: 852,
  regions: [{ id: "region-1", name: "Region 1", x: 320, y: 213, width: 640, height: 213 }],
});
const material = materialFixture({
  basename: "synthetic-hud.mp4",
  duration_ms: 8_000,
  size_bytes: 128_000,
  width: 1280,
  height: 852,
});
const queuedRun = runFixture({ total_frames: 1, version: 1 });
const reviewRun = runFixture({
  completed_frames: 1,
  current_frame_index: 17,
  current_stage: "review",
  review_revision: 4,
  status: "review_ready",
  total_frames: 1,
  version: 4,
});
const acceptedRun = runFixture({ ...reviewRun, review_revision: 5 });
const completedRun = runFixture({ ...acceptedRun, status: "completed", version: 5 });
const pendingFrame = frameDetailFixture({ width: 1280, height: 852 });
const acceptedFrame = frameDetailFixture({
  annotations: pendingFrame.annotations.map((annotation) => ({
    ...annotation,
    status: "accepted",
    version: annotation.version + 1,
  })),
  height: 852,
  review_revision: 5,
  review_status: "accepted",
  version: 8,
  width: 1280,
});
const completedExportBase = exportFixture({ input_revision: 5 });
const completedExport: Export = {
  ...completedExportBase,
  manifest: completedExportBase.manifest === null
    ? null
    : { ...completedExportBase.manifest, input_revision: 5 },
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status });
}

function apiError(route: Route, code: string, status: number) {
  return json(
    route,
    { error: { code, details: {}, message: "Fixture API error.", request_id: "e2e-request" } },
    status,
  );
}

export class ApiHarness {
  readonly requests: CapturedRequest[] = [];
  dashboardMode: DashboardMode;
  phase: HarnessPhase;
  private exportReads = 0;

  constructor(options: { dashboardMode?: DashboardMode; phase?: HarnessPhase } = {}) {
    this.dashboardMode = options.dashboardMode ?? "normal";
    this.phase = options.phase ?? "empty";
  }

  async install(page: Page): Promise<void> {
    await page.route("**/api/v1/**", (route) => this.handle(route));
  }

  private dashboard(): Dashboard {
    if (this.dashboardMode === "empty") {
      return emptyDashboard();
    }
    if (this.dashboardMode === "populated") {
      return dashboardFixture({
        profile,
        run: reviewRun,
        frame_counts: { accepted: 1, pending: 0, rejected: 0, total: 1 },
      });
    }
    const hasProfile = this.phase !== "empty";
    const hasRun = !["empty", "profile", "material"].includes(this.phase);
    const run = !hasRun
      ? null
      : this.phase === "completed"
        ? completedRun
        : this.phase === "queued"
          ? queuedRun
          : ["accepted", "exporting", "exported"].includes(this.phase)
            ? acceptedRun
            : reviewRun;
    return dashboardFixture({
      profile: hasProfile ? profile : null,
      project: hasProfile ? { id: "project-1", name: "DatasetFactory" } : null,
      run,
      frame_counts: {
        accepted: ["accepted", "exporting", "exported", "completed"].includes(this.phase) ? 1 : 0,
        pending: this.phase === "review" ? 1 : 0,
        rejected: 0,
        total: hasRun && this.phase !== "queued" ? 1 : 0,
      },
    });
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname.replace("/api/v1", "");
    const method = request.method();
    const body = request.postDataJSON?.() ?? null;
    this.requests.push({ body, method, pathname });

    if (pathname === "/dashboard" && method === "GET") {
      if (this.dashboardMode === "loading") {
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        await json(route, emptyDashboard());
        return;
      }
      if (this.dashboardMode === "error") {
        await apiError(route, "database_unavailable", 503);
        return;
      }
      await json(route, this.dashboard());
      return;
    }
    if (pathname === "/health" && method === "GET") {
      await json(route, healthFixture());
      return;
    }
    if (pathname === "/profiles/reference-preview" && method === "POST") {
      await json(route, { asset_id: "preview-asset-1", width: 1280, height: 852 }, 201);
      return;
    }
    if (pathname === "/profiles" && method === "POST") {
      this.phase = "profile";
      await json(route, profile, 201);
      return;
    }
    if (pathname === "/profiles/current" && method === "GET") {
      await json(route, this.phase === "empty" ? null : profile);
      return;
    }
    if (pathname === "/profiles/profile-1" && method === "GET") {
      await json(route, profile);
      return;
    }
    if (pathname.startsWith("/assets/references/") && method === "GET") {
      await route.fulfill({ contentType: "image/png", path: fixtureImage, status: 200 });
      return;
    }
    if (pathname === "/materials" && method === "POST") {
      this.phase = "material";
      await json(route, material, 201);
      return;
    }
    if (pathname === "/materials" && method === "GET") {
      const items = ["material", "queued", "review", "accepted", "exporting", "exported", "completed"].includes(this.phase)
        ? [material]
        : [];
      await json(route, { items, page: 1, page_size: 100, total: items.length });
      return;
    }
    if (pathname === "/runs" && method === "POST") {
      this.phase = "queued";
      await json(route, queuedRun, 201);
      return;
    }
    if (pathname === "/runs/run-1/start" && method === "POST") {
      this.phase = "review";
      await json(route, reviewRun, 202);
      return;
    }
    if (pathname === "/runs/run-1/complete" && method === "POST") {
      this.phase = "completed";
      await json(route, completedRun, 202);
      return;
    }
    if (pathname === "/runs/run-1" && method === "GET") {
      await json(
        route,
        this.phase === "completed"
          ? completedRun
          : ["accepted", "exporting", "exported"].includes(this.phase)
            ? acceptedRun
            : reviewRun,
      );
      return;
    }
    if (pathname === "/runs/run-1/frames" && method === "GET") {
      const accepted = ["accepted", "exporting", "exported", "completed"].includes(this.phase);
      await json(route, framePageFixture({
        items: accepted ? [] : [framePageFixture().items[0]!],
        total: accepted ? 0 : 1,
      }));
      return;
    }
    if (pathname === "/frames/frame-1" && method === "GET") {
      await json(route, this.phase === "review" ? pendingFrame : acceptedFrame);
      return;
    }
    if (pathname === "/frames/frame-1/image" && method === "GET") {
      await route.fulfill({ contentType: "image/png", path: fixtureImage, status: 200 });
      return;
    }
    if (pathname === "/frames/frame-1/review" && method === "POST") {
      this.phase = "accepted";
      await json(route, acceptedFrame);
      return;
    }
    if (pathname === "/exports" && method === "POST") {
      this.phase = "exporting";
      this.exportReads = 0;
      await json(route, exportFixture({
        error_code: null,
        input_revision: 5,
        manifest: null,
        output_relpath: null,
        status: "running",
      }), 202);
      return;
    }
    if (pathname === "/exports/latest" && method === "GET") {
      await json(
        route,
        ["exported", "completed"].includes(this.phase) ? completedExport : null,
      );
      return;
    }
    if (pathname === "/exports/export-1" && method === "GET") {
      this.exportReads += 1;
      if (this.exportReads === 1) {
        await json(route, exportFixture({
          error_code: null,
          input_revision: 5,
          manifest: null,
          output_relpath: null,
          status: "running",
        }));
      } else {
        this.phase = "exported";
        await json(route, completedExport);
      }
      return;
    }

    await apiError(route, "fixture_route_missing", 501);
  }
}

export function requestBody(harness: ApiHarness, pathname: string): unknown {
  const request = harness.requests.find(
    (item) => item.pathname === pathname && item.method !== "GET",
  );
  return request?.body;
}
