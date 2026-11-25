import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  errorEnvelope,
  framePageFixture,
  profileFixture,
  runFixture,
  runSummaryFixture,
} from "../../test/fixtures";
import { RUN_POLL_INTERVAL_MS } from "../../api";
import type { RunSummary } from "../../api";
import { renderApp, stubFetch } from "../../test/harness";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("shows persisted review progress and distinguishes a completed export", async () => {
  stubFetch((url) => {
    if (url.includes("/runs?")) {
      return {
        status: 200,
        body: {
          items: [
            runSummaryFixture(),
            runSummaryFixture({
              id: "run-2",
              profile_name: "Arena",
              status: "completed",
              exported: true,
              review_counts: { pending: 0, accepted: 25, rejected: 0, total: 25 },
              annotation_counts: { proposed: 0, accepted: 120, deleted: 0 },
            }),
          ],
          page: 1,
          page_size: 20,
          total: 2,
        },
      };
    }
    return { status: 404, body: {} };
  });

  renderApp(["/annotations"]);

  const quake = (await screen.findByText("Quake Champions")).closest("li");
  expect(quake).not.toBeNull();
  expect(within(quake as HTMLElement).getByText("Rejected: 3")).toBeInTheDocument();
  expect(within(quake as HTMLElement).getByText("Pending annotations")).toBeInTheDocument();
  expect(within(quake as HTMLElement).getByText("120")).toBeInTheDocument();
  expect(within(quake as HTMLElement).getByRole("progressbar")).toHaveAttribute("value", "3");
  expect(within(quake as HTMLElement).queryByText("Exported")).toBeNull();

  const exported = screen.getByText("Arena").closest("li");
  expect(exported).not.toBeNull();
  expect(within(exported as HTMLElement).getByText("Completed")).toBeInTheDocument();
  expect(within(exported as HTMLElement).getByText("Exported")).toBeInTheDocument();
});

it("opens the existing annotation deep-link for the selected run", async () => {
  const user = userEvent.setup();
  stubFetch((url) => {
    if (url.includes("/runs?")) {
      return {
        status: 200,
        body: { items: [runSummaryFixture()], page: 1, page_size: 20, total: 1 },
      };
    }
    if (url.endsWith("/runs/run-1")) {
      return { status: 200, body: runFixture({ id: "run-1", status: "review_ready" }) };
    }
    if (url.includes("/runs/run-1/frames?")) {
      return { status: 200, body: framePageFixture({ items: [], total: 0 }) };
    }
    if (url.endsWith("/profiles/profile-1")) {
      return { status: 200, body: profileFixture() };
    }
    return { status: 404, body: {} };
  });

  const app = renderApp(["/annotations"]);
  await user.click(await screen.findByRole("button", { name: "Open review" }));

  expect(app.router.state.location.pathname).toBe("/annotations/run-1");
  expect(
    await screen.findByRole("group", { name: "Frame status filter" }),
  ).toBeInTheDocument();
});

describe("deleting a run (FE-031)", () => {
  function stubRuns(
    onDelete: (url: string) => { status: number; body?: unknown },
    items = [runSummaryFixture()],
  ) {
    let listed = items;
    return stubFetch((url, init) => {
      if (init?.method === "DELETE") {
        const response = onDelete(url);
        if (response.status === 204) {
          listed = listed.filter((run) => !url.includes(`/runs/${run.id}?`));
        }
        return response;
      }
      if (url.includes("/runs?")) {
        return {
          status: 200,
          body: { items: listed, page: 1, page_size: 20, total: listed.length },
        };
      }
      return { status: 404, body: {} };
    });
  }

  it("asks first, sends the run's version and drops the run from the list", async () => {
    const user = userEvent.setup();
    const fetchSpy = stubRuns(() => ({ status: 204 }));

    renderApp(["/annotations"]);
    await user.click(await screen.findByRole("button", { name: "Delete run run-1" }));

    const dialog = screen.getByRole("dialog", { name: "Delete run" });
    expect(dialog).toHaveAccessibleDescription(
      "Run run-1 of Quake Champions is removed for good, with its 25 frames, their annotations and its exports. The video and the profile stay.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Delete run" }));

    expect(await screen.findByText("No runs yet")).toBeInTheDocument();
    const deletes = fetchSpy.mock.calls.filter(([, init]) => init?.method === "DELETE");
    expect(deletes).toHaveLength(1);
    expect(String(deletes[0]?.[0])).toContain("/runs/run-1?expected_version=3");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sends nothing when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    const fetchSpy = stubRuns(() => ({ status: 204 }));

    renderApp(["/annotations"]);
    await user.click(await screen.findByRole("button", { name: "Delete run run-1" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Delete run" })).getByRole("button", {
        name: "Cancel",
      }),
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchSpy.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    expect(screen.getByText("Quake Champions")).toBeInTheDocument();
  });

  it("keeps a refused delete in the dialog with the reason", async () => {
    const user = userEvent.setup();
    stubRuns(() => ({ status: 409, body: errorEnvelope("export_running") }));

    renderApp(["/annotations"]);
    await user.click(await screen.findByRole("button", { name: "Delete run run-1" }));
    const dialog = screen.getByRole("dialog", { name: "Delete run" });
    await user.click(within(dialog).getByRole("button", { name: "Delete run" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "An export of this run is already running. Wait for it to finish, then try again.",
    );
    expect(screen.getByText("Quake Champions")).toBeInTheDocument();
  });

  it("offers deletion once a processing run stops, without a reload", async () => {
    let status: RunSummary["status"] = "running";
    stubFetch((url) => {
      if (url.includes("/runs?")) {
        return {
          status: 200,
          body: {
            items: [runSummaryFixture({ status })],
            page: 1,
            page_size: 20,
            total: 1,
          },
        };
      }
      return { status: 404, body: {} };
    });

    renderApp(["/annotations"]);

    const button = await screen.findByRole("button", { name: "Delete run run-1" });
    expect(button).toBeDisabled();
    status = "review_ready";
    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: "Delete run run-1" })).toBeEnabled();
      },
      { timeout: RUN_POLL_INTERVAL_MS + 2000 },
    );
  });
});
