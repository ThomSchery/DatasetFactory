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
    const editor = screen.getByRole("dialog", { name: "Edytuj anotację 7" });
    await user.click(within(editor).getByText(/^x 100/));
    const existingX = within(editor).getByLabelText("x");
    await user.clear(existingX);
    await user.type(existingX, "321");
    await user.click(within(editor).getByRole("button", { name: "Przerysuj bbox" }));

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
    expect(within(editor).getByLabelText("x")).toHaveValue(321);
    expect(screen.getByRole("dialog", { name: "Edytuj anotację 7" })).toBeVisible();
    expect(within(editor).getByRole("button", { name: "Anuluj przerysowanie" })).toBeVisible();

    await act(async () => {
      await queryClient.refetchQueries({ exact: true, queryKey: queryKeys.run("run-1") });
    });
    await waitFor(() => {
      expect(runReads).toBe(3);
      expect(listReads).toBe(2);
      expect(frameReads).toBe(2);
    });
  });

  it("syncs clean y, width and category beside dirty x and submits the visible CAS payload", async () => {
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
          body: { ...serverUpdatedAnnotation, version: 5, x: 1910 },
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
    await user.click(screen.getByRole("button", { name: "Klasa 7, 1 anotacji" }));
    const editor = screen.getByRole("dialog", { name: "Edytuj anotację 7" });
    await user.click(within(editor).getByText(/^x 100/));
    const xField = within(editor).getByLabelText("x");
    await user.clear(xField);
    await user.type(xField, "1910");
    await user.click(within(editor).getByRole("button", { name: "Zapisz geometrię" }));
    expect(await within(editor).findByText("Bbox musi mieścić się w granicach całej klatki.")).toBeVisible();

    await act(async () => {
      await queryClient.refetchQueries({ exact: true, queryKey: queryKeys.run("run-1") });
    });

    await waitFor(() => {
      expect(within(editor).getByLabelText("x")).toHaveValue(1910);
      expect(within(editor).getByLabelText("y")).toHaveValue(222);
      expect(within(editor).getByLabelText("width")).toHaveValue(10);
      expect(within(editor).getByLabelText("height")).toHaveValue(32);
      expect(within(editor).getByRole("option", { name: "health" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(
        within(editor).queryByText("Bbox musi mieścić się w granicach całej klatki."),
      ).not.toBeInTheDocument();
    });

    await user.click(within(editor).getByRole("button", { name: "Zapisz geometrię" }));
    await waitFor(() => {
      expect(patchBody).toEqual({
        bbox: { x: 1910, y: 222, width: 10, height: 32 },
        expected_version: 4,
      });
    });
  });

  it("keeps the geometry alarm when clean y syncs beside an empty dirty width", async () => {
    const user = userEvent.setup();
    const profile = profileFixture();
    const originalAnnotation = annotationFixture({ version: 3 });
    const serverUpdatedAnnotation = annotationFixture({ version: 4, y: 222 });
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
    await user.click(screen.getByRole("button", { name: "Klasa 7, 1 anotacji" }));
    const editor = screen.getByRole("dialog", { name: "Edytuj anotację 7" });
    await user.click(within(editor).getByText(/^x 100/));
    const widthField = within(editor).getByLabelText("width");
    await user.clear(widthField);
    await user.click(within(editor).getByRole("button", { name: "Zapisz geometrię" }));
    expect(
      await within(editor).findByText("Początek nie może być ujemny, a rozmiar musi być dodatni."),
    ).toBeVisible();

    await act(async () => {
      await queryClient.refetchQueries({ exact: true, queryKey: queryKeys.run("run-1") });
    });

    await waitFor(() => {
      expect(within(editor).getByLabelText("y")).toHaveValue(222);
      expect(widthField).toHaveValue(null);
      expect(
        within(editor).getByText("Początek nie może być ujemny, a rozmiar musi być dodatni."),
      ).toBeVisible();
      expect(frameReads).toBe(2);
    });
    expect(geometryWrites).toBe(0);
  });

  it("syncs every clean geometry field and category to the new server baseline", async () => {
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
    const editor = screen.getByRole("dialog", { name: "Edytuj anotację 7" });
    await user.click(within(editor).getByText(/^x 100/));

    await act(async () => {
      await queryClient.refetchQueries({ exact: true, queryKey: queryKeys.run("run-1") });
    });

    await waitFor(() => {
      expect(within(editor).getByLabelText("x")).toHaveValue(144);
      expect(within(editor).getByLabelText("y")).toHaveValue(222);
      expect(within(editor).getByLabelText("width")).toHaveValue(50);
      expect(within(editor).getByLabelText("height")).toHaveValue(36);
      expect(within(editor).getByRole("option", { name: "health" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
  });

  it("resumes server sync after a dirty field is manually restored to its baseline", async () => {
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
        const x = frameReads === 1 ? 100 : frameReads === 2 ? 144 : 188;
        return {
          body: frameDetailFixture({ annotations: [annotationFixture({ version: frameReads + 2, x })] }),
          status: 200,
        };
      }
      throw new Error(`Nieobsłużone żądanie testowe: ${url}`);
    });
    const { queryClient } = renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await user.click(screen.getByRole("button", { name: "Klasa 7, 1 anotacji" }));
    const editor = screen.getByRole("dialog", { name: "Edytuj anotację 7" });
    await user.click(within(editor).getByText(/^x 100/));
    const xField = within(editor).getByLabelText("x");
    await user.clear(xField);
    await user.type(xField, "321");

    await act(async () => {
      await queryClient.refetchQueries({ exact: true, queryKey: queryKeys.frame("frame-1") });
    });
    await waitFor(() => {
      expect(xField).toHaveValue(321);
    });

    await user.clear(xField);
    await user.type(xField, "144");
    await act(async () => {
      await queryClient.refetchQueries({ exact: true, queryKey: queryKeys.frame("frame-1") });
    });
    await waitFor(() => {
      expect(xField).toHaveValue(188);
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
