import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, type BBox } from "../../api";
import { errorEnvelope } from "../../test/fixtures";
import { stubFetch } from "../../test/harness";
import { executeReviewMutation, type ReviewMutationIntent } from "./reviewMutations";

const BBOX: BBox = { x: 11, y: 22, width: 33, height: 44 };

interface Case {
  expectedBody?: unknown;
  expectedMethod: string;
  expectedUrl: string;
  intent: ReviewMutationIntent;
  label: string;
}

const cases: Case[] = [
  {
    label: "zmiana klasy",
    intent: { kind: "category", annotationId: "ann-1", categoryId: "cat-2", expectedVersion: 3 },
    expectedMethod: "PATCH",
    expectedUrl: "/api/v1/annotations/ann-1",
    expectedBody: { category_id: "cat-2", expected_version: 3 },
  },
  {
    label: "delete",
    intent: { kind: "delete", annotationId: "ann-1", expectedVersion: 3 },
    expectedMethod: "DELETE",
    expectedUrl: "/api/v1/annotations/ann-1?expected_version=3",
  },
  {
    label: "narysowanie boksu",
    intent: { kind: "create", categoryId: "cat-1", bbox: BBOX, expectedVersion: 7 },
    expectedMethod: "POST",
    expectedUrl: "/api/v1/frames/frame-1/annotations",
    expectedBody: { category_id: "cat-1", bbox: BBOX, expected_version: 7 },
  },
  {
    label: "zmiana geometrii",
    intent: { kind: "geometry", annotationId: "ann-1", bbox: BBOX, expectedVersion: 3 },
    expectedMethod: "PATCH",
    expectedUrl: "/api/v1/annotations/ann-1",
    expectedBody: { bbox: BBOX, expected_version: 3 },
  },
  {
    label: "kopiowanie grupy z poprzedniej klatki",
    intent: {
      kind: "copy-previous",
      target: { category_id: "cat-1", scope: "category" },
      expectedVersion: 7,
    },
    expectedMethod: "POST",
    expectedUrl: "/api/v1/frames/frame-1/annotations/copy-previous",
    expectedBody: { scope: "category", category_id: "cat-1", expected_version: 7 },
  },
  {
    label: "kopiowanie podzbioru klas jednym żądaniem",
    intent: {
      kind: "copy-previous",
      target: { category_ids: ["cat-1", "cat-2"], scope: "categories" },
      expectedVersion: 7,
    },
    expectedMethod: "POST",
    expectedUrl: "/api/v1/frames/frame-1/annotations/copy-previous",
    expectedBody: {
      scope: "categories",
      category_ids: ["cat-1", "cat-2"],
      expected_version: 7,
    },
  },
  ...(["accept", "reject", "reopen"] as const).map((decision) => ({
    label: decision,
    intent: { kind: "review" as const, decision, expectedVersion: 7 },
    expectedMethod: "POST",
    expectedUrl: "/api/v1/frames/frame-1/review",
    expectedBody: { decision, expected_version: 7 },
  })),
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("review mutations", () => {
  it.each(cases)("$label sends expected_version and surfaces 409", async (testCase) => {
    const fetchSpy = stubFetch(() => ({
      status: 409,
      body: errorEnvelope("version_conflict"),
    }));

    await expect(executeReviewMutation("frame-1", testCase.intent)).rejects.toMatchObject({
      code: "version_conflict",
      status: 409,
    } satisfies Partial<ApiError>);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(testCase.expectedUrl);
    expect(init?.method).toBe(testCase.expectedMethod);
    if (testCase.expectedBody === undefined) {
      expect(init?.body).toBeUndefined();
    } else {
      expect(JSON.parse(String(init?.body))).toEqual(testCase.expectedBody);
    }
  });
});
