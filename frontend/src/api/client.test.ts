import { afterEach, describe, expect, it, vi } from "vitest";

import { stubFetch } from "../test/harness";
import { API_BASE_PATH, apiRequest, buildUrl } from "./client";
import {
  ApiError,
  ApiTransportError,
  annotationIdsFromError,
  apiErrorFromBody,
} from "./errors";
import {
  createAnnotation,
  deleteAnnotation,
  getCurrentProfile,
  getExport,
  getFrame,
  getHealth,
  getLatestExport,
  listRunFrames,
  reviewFrame,
  updateAnnotation,
} from "./endpoints";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildUrl", () => {
  it("prefixes the versioned API base path", () => {
    expect(buildUrl("/health")).toBe(`${API_BASE_PATH}/health`);
  });

  it("drops undefined query params instead of serialising them", () => {
    expect(buildUrl("/materials", { page: 2, page_size: undefined })).toBe(
      `${API_BASE_PATH}/materials?page=2`,
    );
  });
});

describe("apiRequest", () => {
  it("sends JSON bodies with the right method and content type", async () => {
    const spy = stubFetch(() => ({ status: 201, body: { id: "annotation-1" } }));

    await createAnnotation("frame-9", {
      category_id: "category-1",
      bbox: { x: 4, y: 8, width: 16, height: 24 },
      expected_version: 2,
    });

    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe(`${API_BASE_PATH}/frames/frame-9/annotations`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      category_id: "category-1",
      bbox: { x: 4, y: 8, width: 16, height: 24 },
      expected_version: 2,
    });
  });

  it("passes expected_version as a query param on DELETE", async () => {
    const spy = stubFetch(() => ({ status: 204 }));

    await deleteAnnotation("annotation-7", 5);

    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe(`${API_BASE_PATH}/annotations/annotation-7?expected_version=5`);
    expect(init?.method).toBe("DELETE");
  });

  it("accepts an empty 204 body", async () => {
    stubFetch(() => ({ status: 204 }));
    await expect(deleteAnnotation("annotation-7", 5)).resolves.toBeUndefined();
  });

  it("returns null when the current profile is unset", async () => {
    stubFetch(() => ({ status: 200, body: null }));
    await expect(getCurrentProfile()).resolves.toBeNull();
  });

  it("raises ApiError with code, details and request id preserved", async () => {
    stubFetch(() => ({
      status: 409,
      body: {
        error: {
          code: "version_conflict",
          message: "stale",
          details: { expected_version: 3, actual_version: 5 },
          request_id: "req-1",
        },
      },
    }));

    const error = await reviewFrame("frame-1", {
      decision: "accept",
      expected_version: 3,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(409);
    expect(apiError.code).toBe("version_conflict");
    expect(apiError.details).toEqual({ expected_version: 3, actual_version: 5 });
    expect(apiError.requestId).toBe("req-1");
  });

  it("raises ApiTransportError when the failure body is not an envelope", async () => {
    stubFetch(() => ({ status: 502, body: { detail: "bad gateway" } }));
    await expect(getHealth()).rejects.toBeInstanceOf(ApiTransportError);
  });

  it("raises ApiTransportError when fetch itself rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );
    await expect(getHealth()).rejects.toBeInstanceOf(ApiTransportError);
  });

  it("serialises frame list filters", async () => {
    const spy = stubFetch(() => ({
      status: 200,
      body: { items: [], page: 1, page_size: 20, total: 0 },
    }));

    await listRunFrames("run-1", { review_status: "pending", page: 2, page_size: 50 });

    expect(String(spy.mock.calls[0][0])).toBe(
      `${API_BASE_PATH}/runs/run-1/frames?review_status=pending&page=2&page_size=50`,
    );
  });

  it("sends a PATCH with bbox omitted when only the category changes", async () => {
    const spy = stubFetch(() => ({ status: 200, body: { id: "annotation-3" } }));

    await updateAnnotation("annotation-3", { category_id: "cat-2", expected_version: 4 });

    const init = spy.mock.calls[0][1];
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({
      category_id: "cat-2",
      expected_version: 4,
    });
  });

  it("percent-encodes path segments", async () => {
    const spy = stubFetch(() => ({ status: 200, body: {} }));
    await getFrame("frame/../secret");
    expect(String(spy.mock.calls[0][0])).toBe(`${API_BASE_PATH}/frames/frame%2F..%2Fsecret`);
  });

  it("reads a finished export without inventing fields", async () => {
    stubFetch(() => ({
      status: 200,
      body: {
        id: "export-1",
        run_id: "run-1",
        status: "failed",
        input_revision: 7,
        error_code: "export_revision_conflict",
        manifest: null,
        output_relpath: null,
      },
    }));

    await expect(getExport("export-1")).resolves.toMatchObject({
      error_code: "export_revision_conflict",
      input_revision: 7,
    });
  });

  it("reads the latest export through a controlled run_id query", async () => {
    const spy = stubFetch(() => ({ status: 200, body: null }));

    await expect(getLatestExport("run/foreign")).resolves.toBeNull();

    expect(String(spy.mock.calls[0][0])).toBe(
      `${API_BASE_PATH}/exports/latest?run_id=run%2Fforeign`,
    );
  });
});

describe("apiErrorFromBody", () => {
  it("defaults a missing details object rather than dropping the error", () => {
    const error = apiErrorFromBody(400, {
      error: { code: "validation_error", message: "bad", request_id: "req-2" },
    });
    expect(error?.details).toEqual({});
  });

  it("returns null for a body that is not an envelope", () => {
    expect(apiErrorFromBody(500, { oops: true })).toBeNull();
  });
});

describe("annotationIdsFromError", () => {
  it("reads string ids out of details", () => {
    const error = new ApiError({
      status: 400,
      code: "bbox_invalid",
      message: "x",
      details: { annotation_ids: ["a", "b"] },
      requestId: "req-3",
    });
    expect(annotationIdsFromError(error)).toEqual(["a", "b"]);
  });

  it("returns an empty array when the key is absent or malformed", () => {
    const noIds = new ApiError({
      status: 409,
      code: "review_locked",
      message: "x",
      details: {},
      requestId: "req-4",
    });
    const wrongShape = new ApiError({
      status: 400,
      code: "bbox_invalid",
      message: "x",
      details: { annotation_ids: "annotation-1" },
      requestId: "req-5",
    });
    expect(annotationIdsFromError(noIds)).toEqual([]);
    expect(annotationIdsFromError(wrongShape)).toEqual([]);
    expect(annotationIdsFromError(new Error("plain"))).toEqual([]);
  });
});
