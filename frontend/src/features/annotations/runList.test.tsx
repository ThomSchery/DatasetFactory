import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import {
  framePageFixture,
  profileFixture,
  runFixture,
  runSummaryFixture,
} from "../../test/fixtures";
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
  expect(within(quake as HTMLElement).getByText("Odrzucone: 3")).toBeInTheDocument();
  expect(within(quake as HTMLElement).getByText("Oczekujące anotacje")).toBeInTheDocument();
  expect(within(quake as HTMLElement).getByText("120")).toBeInTheDocument();
  expect(within(quake as HTMLElement).getByRole("progressbar")).toHaveAttribute("value", "3");
  expect(within(quake as HTMLElement).queryByText("Wyeksportowany")).toBeNull();

  const exported = screen.getByText("Arena").closest("li");
  expect(exported).not.toBeNull();
  expect(within(exported as HTMLElement).getByText("Ukończony")).toBeInTheDocument();
  expect(within(exported as HTMLElement).getByText("Wyeksportowany")).toBeInTheDocument();
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
  await user.click(await screen.findByRole("button", { name: "Otwórz weryfikację" }));

  expect(app.router.state.location.pathname).toBe("/annotations/run-1");
  expect(await screen.findByRole("region", { name: "Filtr klatek" })).toBeInTheDocument();
});
