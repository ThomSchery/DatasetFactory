import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { queryKeys } from "../../api";
import {
  annotationFixture,
  frameDetailFixture,
  framePageFixture,
  profileFixture,
  runFixture,
} from "../../test/fixtures";
import { renderApp, stubFetch } from "../../test/harness";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("terminal annotation refresh", () => {
  it("refetches list and active detail once without losing dirty editor state", async () => {
    const user = userEvent.setup();
    const profile = profileFixture({
      categories: [
        { id: "category-1", kind: "character", name: "7" },
        { id: "category-2", kind: "game", name: "health" },
      ],
    });
    const originalAnnotation = annotationFixture({ version: 3 });
    const serverUpdatedAnnotation = annotationFixture({ version: 4, x: 144 });
    const newAnnotation = annotationFixture({
      category_id: "category-2",
      id: "ann-2",
      version: 1,
      x: 400,
    });
    let runReads = 0;
    let listReads = 0;
    let frameReads = 0;

    stubFetch((url) => {
      if (url === "/api/v1/runs/run-1") {
        runReads += 1;
        return {
          body: runFixture({
            id: "run-1",
            profile_id: profile.id,
            status: runReads === 1 ? "running" : "review_ready",
          }),
          status: 200,
        };
      }
      if (url === `/api/v1/profiles/${profile.id}`) {
        return { body: profile, status: 200 };
      }
      if (url.startsWith("/api/v1/runs/run-1/frames?")) {
        listReads += 1;
        return { body: framePageFixture(), status: 200 };
      }
      if (url === "/api/v1/frames/frame-1") {
        frameReads += 1;
        return {
          body:
            frameReads === 1
              ? frameDetailFixture({ annotations: [originalAnnotation], version: 7 })
              : frameDetailFixture({
                  annotations: [serverUpdatedAnnotation, newAnnotation],
                  version: 8,
                }),
          status: 200,
        };
      }
      throw new Error(`Nieobsłużone żądanie testowe: ${url}`);
    });
    const { queryClient } = renderApp(["/annotations/run-1"]);

    await screen.findByRole("heading", { name: "Obraz i bbox" });
    const originalRow = within(screen.getByRole("list", { name: "Aktywne anotacje" })).getAllByRole(
      "listitem",
    )[0]!;
    const existingX = within(originalRow).getByLabelText("x");
    await user.clear(existingX);
    await user.type(existingX, "321");
    await user.type(screen.getByLabelText("Nowy x"), "55");
    await user.click(
      within(originalRow).getByRole("button", { name: "Narysuj nową geometrię" }),
    );

    await act(async () => {
      await queryClient.refetchQueries({ exact: true, queryKey: queryKeys.run("run-1") });
    });

    await waitFor(() => {
      expect(listReads).toBe(2);
      expect(frameReads).toBe(2);
      expect(
        within(screen.getByRole("list", { name: "Aktywne anotacje" })).getAllByRole("listitem"),
      ).toHaveLength(2);
    });
    const refreshedFirstRow = within(
      screen.getByRole("list", { name: "Aktywne anotacje" }),
    ).getAllByRole("listitem")[0]!;
    expect(within(refreshedFirstRow).getByLabelText("x")).toHaveValue(321);
    expect(screen.getByLabelText("Nowy x")).toHaveValue(55);
    expect(within(refreshedFirstRow).getByRole("button", { name: "Zaznaczona" })).toBeVisible();
    expect(screen.getByText(/Tryb zmiany geometrii: 7 \(ann-1\)/)).toBeVisible();
    expect(screen.getByText("x 144, y 120, w 40, h 32")).toBeVisible();

    await act(async () => {
      await queryClient.refetchQueries({ exact: true, queryKey: queryKeys.run("run-1") });
    });
    await waitFor(() => {
      expect(runReads).toBe(3);
      expect(listReads).toBe(2);
      expect(frameReads).toBe(2);
    });
  });
});
