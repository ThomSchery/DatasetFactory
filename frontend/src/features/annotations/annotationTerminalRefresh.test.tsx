import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { queryKeys } from "../../api";
import {
  annotationFixture,
  frameDetailFixture,
  framePageFixture,
  frameSummaryFixture,
  profileFixture,
  runFixture,
} from "../../test/fixtures";
import { renderApp, stubFetch } from "../../test/harness";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("terminal annotation refresh", () => {
  it("refetches list and active detail once without losing the overlay preview", async () => {
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
        if (url.includes("page_size=100")) listReads += 1;
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

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await user.click(screen.getByRole("button", { name: "Klasa 7, 1 anotacji" }));
    const classButton = screen.getByRole("button", { name: "Klasa 7, 1 anotacji" });
    await user.click(classButton);
    classButton.focus();
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(screen.getByText("Niezapisane")).toBeVisible();

    await act(async () => {
      await queryClient.refetchQueries({ exact: true, queryKey: queryKeys.run("run-1") });
    });

    await waitFor(() => {
      expect(listReads).toBe(2);
      expect(frameReads).toBe(2);
      expect(
        within(screen.getByRole("listbox", { name: "Bbox anotacji na klatce" })).getAllByRole("option"),
      ).toHaveLength(2);
    });
    expect(screen.getByRole("dialog", { name: "Edytuj anotację 7" })).toBeVisible();
    expect(
      within(screen.getByRole("listbox", { name: "Bbox anotacji na klatce" })).getAllByRole(
        "option",
      )[0],
    ).toHaveAttribute(
      "aria-label",
      expect.stringContaining("x 103, y 120, szerokość 40, wysokość 32"),
    );
    expect(screen.getByText("Niezapisane")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Przerysuj bbox" })).not.toBeInTheDocument();

    await act(async () => {
      await queryClient.refetchQueries({ exact: true, queryKey: queryKeys.run("run-1") });
    });
    await waitFor(() => {
      expect(runReads).toBe(3);
      expect(listReads).toBe(2);
      expect(frameReads).toBe(2);
    });
  });

  it("commits the retained overlay preview with the refetched annotation version", async () => {
    const user = userEvent.setup();
    const profile = profileFixture({
      categories: [
        { id: "category-1", kind: "character", name: "7" },
        { id: "category-2", kind: "game", name: "health" },
      ],
    });
    const originalAnnotation = annotationFixture({ version: 3 });
    const serverUpdatedAnnotation = annotationFixture({
      category_id: "category-2",
      version: 4,
      width: 10,
      x: 144,
      y: 222,
    });
    let runReads = 0;
    let frameReads = 0;
    let patchBody: unknown;

    stubFetch((url, init) => {
      if (init?.method === "PATCH" && url === "/api/v1/annotations/ann-1") {
        patchBody = JSON.parse(String(init.body));
        return {
          body: { ...serverUpdatedAnnotation, version: 5, x: 101, y: 120, width: 40 },
          status: 200,
        };
      }
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
        return { body: framePageFixture(), status: 200 };
      }
      if (url === "/api/v1/frames/frame-1") {
        frameReads += 1;
        return {
          body: frameDetailFixture({
            annotations: [frameReads === 1 ? originalAnnotation : serverUpdatedAnnotation],
            version: frameReads === 1 ? 7 : 8,
          }),
          status: 200,
        };
      }
      throw new Error(`Nieobsłużone żądanie testowe: ${url}`);
    });
    const { queryClient } = renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    const classButton = screen.getByRole("button", { name: "Klasa 7, 1 anotacji" });
    await user.click(classButton);
    classButton.focus();
    await user.keyboard("{ArrowRight}");

    await act(async () => {
      await queryClient.refetchQueries({ exact: true, queryKey: queryKeys.run("run-1") });
    });

    await waitFor(() => {
      const editor = screen.getByRole("dialog", { name: "Edytuj anotację health" });
      expect(within(editor).getByRole("option", { name: "health" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(
        within(screen.getByRole("listbox", { name: "Bbox anotacji na klatce" })).getByRole(
          "option",
        ),
      ).toHaveAttribute(
        "aria-label",
        expect.stringContaining("x 101, y 120, szerokość 40, wysokość 32"),
      );
    });

    screen.getByRole("button", { name: "Klasa health, 1 anotacji" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(patchBody).toEqual({
        bbox: { x: 101, y: 120, width: 40, height: 32 },
        expected_version: 4,
      });
    });
  });

  it("keeps an invalid overlay preview and its alarm through a refetch", async () => {
    const user = userEvent.setup();
    const profile = profileFixture();
    const originalAnnotation = annotationFixture({ version: 3, width: 40, x: 1900 });
    const serverUpdatedAnnotation = annotationFixture({ version: 4, width: 40, x: 1900, y: 222 });
    let runReads = 0;
    let frameReads = 0;
    let geometryWrites = 0;

    stubFetch((url, init) => {
      if (init?.method === "PATCH" && url === "/api/v1/annotations/ann-1") {
        geometryWrites += 1;
        return { body: serverUpdatedAnnotation, status: 200 };
      }
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
        return { body: framePageFixture(), status: 200 };
      }
      if (url === "/api/v1/frames/frame-1") {
        frameReads += 1;
        return {
          body: frameDetailFixture({
            annotations: [frameReads === 1 ? originalAnnotation : serverUpdatedAnnotation],
            version: frameReads === 1 ? 7 : 8,
          }),
          status: 200,
        };
      }
      throw new Error(`Nieobsłużone żądanie testowe: ${url}`);
    });
    const { queryClient } = renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    const classButton = screen.getByRole("button", { name: "Klasa 7, 1 anotacji" });
    await user.click(classButton);
    classButton.focus();
    await user.keyboard("{ArrowLeft}{Enter}");
    expect(await screen.findByText(/Kod: bbox_invalid/)).toBeVisible();

    await act(async () => {
      await queryClient.refetchQueries({ exact: true, queryKey: queryKeys.run("run-1") });
    });

    await waitFor(() => {
      expect(
        within(screen.getByRole("listbox", { name: "Bbox anotacji na klatce" })).getByRole(
          "option",
        ),
      ).toHaveAttribute(
        "aria-label",
        expect.stringContaining("x 1899, y 120, szerokość 40, wysokość 32"),
      );
      expect(frameReads).toBe(2);
    });
    expect(screen.getByText("Niezapisane")).toBeVisible();
    expect(screen.getByText(/Kod: bbox_invalid/)).toBeVisible();

    screen.getByRole("button", { name: "Klasa 7, 1 anotacji" }).focus();
    await user.keyboard("{Enter}");
    expect(geometryWrites).toBe(0);
  });

  it("syncs the untouched overlay and category to the new server baseline", async () => {
    const user = userEvent.setup();
    const profile = profileFixture({
      categories: [
        { id: "category-1", kind: "character", name: "7" },
        { id: "category-2", kind: "game", name: "health" },
      ],
    });
    const updated = annotationFixture({
      category_id: "category-2",
      height: 36,
      version: 4,
      width: 50,
      x: 144,
      y: 222,
    });
    let runReads = 0;
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
        return { body: framePageFixture(), status: 200 };
      }
      if (url === "/api/v1/frames/frame-1") {
        frameReads += 1;
        return {
          body: frameDetailFixture({
            annotations: [frameReads === 1 ? annotationFixture({ version: 3 }) : updated],
            version: frameReads === 1 ? 7 : 8,
          }),
          status: 200,
        };
      }
      throw new Error(`Nieobsłużone żądanie testowe: ${url}`);
    });
    const { queryClient } = renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await user.click(screen.getByRole("button", { name: "Klasa 7, 1 anotacji" }));

    await act(async () => {
      await queryClient.refetchQueries({ exact: true, queryKey: queryKeys.run("run-1") });
    });

    await waitFor(() => {
      const editor = screen.getByRole("dialog", { name: "Edytuj anotację health" });
      expect(within(editor).getByRole("option", { name: "health" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(
        within(screen.getByRole("listbox", { name: "Bbox anotacji na klatce" })).getByRole(
          "option",
        ),
      ).toHaveAttribute(
        "aria-label",
        expect.stringContaining("x 144, y 222, szerokość 50, wysokość 36"),
      );
    });
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("resumes server overlay sync after a refetch catches up with the preview", async () => {
    const user = userEvent.setup();
    const profile = profileFixture();
    let frameReads = 0;

    stubFetch((url) => {
      if (url === "/api/v1/runs/run-1") {
        return {
          body: runFixture({ id: "run-1", profile_id: profile.id, status: "review_ready" }),
          status: 200,
        };
      }
      if (url === `/api/v1/profiles/${profile.id}`) {
        return { body: profile, status: 200 };
      }
      if (url.startsWith("/api/v1/runs/run-1/frames?")) {
        return { body: framePageFixture(), status: 200 };
      }
      if (url === "/api/v1/frames/frame-1") {
        frameReads += 1;
        const x = frameReads === 1 ? 100 : frameReads === 2 ? 101 : 188;
        return {
          body: frameDetailFixture({ annotations: [annotationFixture({ version: frameReads + 2, x })] }),
          status: 200,
        };
      }
      throw new Error(`Nieobsłużone żądanie testowe: ${url}`);
    });
    const { queryClient } = renderApp(["/annotations/run-1"]);

    const overlay = await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    const classButton = screen.getByRole("button", { name: "Klasa 7, 1 anotacji" });
    await user.click(classButton);
    classButton.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByText("Niezapisane")).toBeVisible();

    await act(async () => {
      await queryClient.refetchQueries({ exact: true, queryKey: queryKeys.frame("frame-1") });
    });
    await waitFor(() => {
      expect(screen.queryByText("Niezapisane")).not.toBeInTheDocument();
      expect(within(overlay).getByRole("option")).toHaveAttribute(
        "aria-label",
        expect.stringContaining("x 101, y 120"),
      );
    });

    await act(async () => {
      await queryClient.refetchQueries({ exact: true, queryKey: queryKeys.frame("frame-1") });
    });
    await waitFor(() => {
      expect(within(overlay).getByRole("option")).toHaveAttribute(
        "aria-label",
        expect.stringContaining("x 188, y 120"),
      );
      expect(screen.queryByText("Niezapisane")).not.toBeInTheDocument();
    });
  });

  it("does not treat navigation from running A to cached terminal B as one run transition", async () => {
    const profile = profileFixture();
    const reads = {
      frameA: 0,
      frameB: 0,
      listA: 0,
      listB: 0,
      runA: 0,
      runB: 0,
    };

    stubFetch((url) => {
      if (url === "/api/v1/runs/run-a") {
        reads.runA += 1;
        return {
          body: runFixture({ id: "run-a", profile_id: profile.id, status: "running" }),
          status: 200,
        };
      }
      if (url === "/api/v1/runs/run-b") {
        reads.runB += 1;
        return {
          body: runFixture({ id: "run-b", profile_id: profile.id, status: "review_ready" }),
          status: 200,
        };
      }
      if (url === `/api/v1/profiles/${profile.id}`) {
        return { body: profile, status: 200 };
      }
      if (url.startsWith("/api/v1/runs/run-a/frames?")) {
        if (url.includes("page_size=100")) reads.listA += 1;
        return {
          body: framePageFixture({ items: [frameSummaryFixture({ id: "frame-a" })] }),
          status: 200,
        };
      }
      if (url.startsWith("/api/v1/runs/run-b/frames?")) {
        if (url.includes("page_size=100")) reads.listB += 1;
        return {
          body: framePageFixture({ items: [frameSummaryFixture({ id: "frame-b" })] }),
          status: 200,
        };
      }
      if (url === "/api/v1/frames/frame-a") {
        reads.frameA += 1;
        return { body: frameDetailFixture({ id: "frame-a", run_id: "run-a" }), status: 200 };
      }
      if (url === "/api/v1/frames/frame-b") {
        reads.frameB += 1;
        return { body: frameDetailFixture({ id: "frame-b", run_id: "run-b" }), status: 200 };
      }
      throw new Error(`Nieobsłużone żądanie testowe: ${url}`);
    });
    const { queryClient, router } = renderApp(["/annotations/run-b"]);

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Wybierz klatkę" })).toHaveValue("frame-b"));
    queryClient.setQueryDefaults(queryKeys.run("run-b"), { staleTime: Infinity });
    queryClient.setQueryDefaults(queryKeys.frame("frame-b"), { staleTime: Infinity });

    await act(async () => {
      await router.navigate("/annotations/run-a");
    });
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Wybierz klatkę" })).toHaveValue("frame-a"));
    await waitFor(() => {
      expect(reads.frameA).toBe(1);
      expect(reads.listA).toBe(1);
    });

    await act(async () => {
      await router.navigate("/annotations/run-b");
    });
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Wybierz klatkę" })).toHaveValue("frame-b"));
    await waitFor(() => {
      expect(reads.runB).toBe(1);
      expect(reads.listB).toBe(1);
      expect(reads.frameB).toBe(1);
    });
  });
});
