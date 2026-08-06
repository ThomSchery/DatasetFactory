import { useMutation } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button } from "../components/common/Button";
import { InlineError } from "../components/common/UiStates";
import { renderWithQueryClient, stubFetch } from "../test/harness";
import { reviewFrame } from "./endpoints";
import { describeApiError } from "./messages";

/*
 * TECH_PLAN §5: accepting a frame whose kept manual boxes no longer fit returns
 * `400 bbox_invalid` with `details.annotation_ids` naming every offending box,
 * so the user fixes them all at once instead of one rejection at a time. This
 * test walks that payload from `fetch` all the way to rendered DOM.
 */

const OFFENDING_IDS = ["annotation-a1", "annotation-b2", "annotation-c3"];

const BBOX_INVALID_ENVELOPE = {
  error: {
    code: "bbox_invalid",
    message: "The annotation review request could not be completed.",
    details: {
      annotation_ids: OFFENDING_IDS,
      frame_width: 1920,
      frame_height: 1080,
    },
    request_id: "3f6f4a1e-0c47-4a3e-8d0f-0f7d4b0b1f11",
  },
};

/** A stand-in for the review screen F4 will build on this foundation. */
function ReviewPanel() {
  const mutation = useMutation({
    mutationFn: () => reviewFrame("frame-1", { decision: "accept", expected_version: 3 }),
  });

  const presentation = mutation.error === null ? null : describeApiError(mutation.error);

  return (
    <div>
      <Button
        loading={mutation.isPending}
        onClick={() => {
          mutation.mutate();
        }}
      >
        Zaakceptuj klatkę
      </Button>
      {presentation === null ? null : (
        <>
          <InlineError message={`${presentation.message} ${presentation.action}`} />
          <ul aria-label="Boksy do poprawy">
            {presentation.annotationIds.map((id) => (
              <li data-testid="offending-annotation" key={id}>
                {id}
              </li>
            ))}
          </ul>
          <output data-testid="raw-details">{JSON.stringify(presentation.details)}</output>
          <output data-testid="request-id">{presentation.requestId}</output>
        </>
      )}
    </div>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("error envelope details reaching the UI layer", () => {
  it("carries bbox_invalid annotation_ids from the client into rendered DOM", async () => {
    stubFetch(() => ({ status: 400, body: BBOX_INVALID_ENVELOPE }));
    const user = userEvent.setup();
    renderWithQueryClient(<ReviewPanel />);

    await user.click(screen.getByRole("button", { name: "Zaakceptuj klatkę" }));

    await waitFor(() => {
      expect(screen.getAllByTestId("offending-annotation")).toHaveLength(OFFENDING_IDS.length);
    });

    expect(
      screen.getAllByTestId("offending-annotation").map((node) => node.textContent),
    ).toEqual(OFFENDING_IDS);
  });

  it("hands the UI the whole details object, not just the ids it knows about", async () => {
    stubFetch(() => ({ status: 400, body: BBOX_INVALID_ENVELOPE }));
    const user = userEvent.setup();
    renderWithQueryClient(<ReviewPanel />);

    await user.click(screen.getByRole("button", { name: "Zaakceptuj klatkę" }));

    const details = await screen.findByTestId("raw-details");
    expect(JSON.parse(details.textContent ?? "{}")).toEqual(BBOX_INVALID_ENVELOPE.error.details);
  });

  it("translates the code centrally and keeps the request id for support", async () => {
    stubFetch(() => ({ status: 400, body: BBOX_INVALID_ENVELOPE }));
    const user = userEvent.setup();
    renderWithQueryClient(<ReviewPanel />);

    await user.click(screen.getByRole("button", { name: "Zaakceptuj klatkę" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Część boksów wykracza poza granice klatki.");
    expect(alert).toHaveTextContent("Popraw geometrię wskazanych boksów");
    expect(await screen.findByTestId("request-id")).toHaveTextContent(
      BBOX_INVALID_ENVELOPE.error.request_id,
    );
  });

  it("disables the mutation button and shows a spinner while the call is in flight", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await gate;
        return new Response(JSON.stringify(BBOX_INVALID_ENVELOPE), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const user = userEvent.setup();
    renderWithQueryClient(<ReviewPanel />);

    const button = screen.getByRole("button", { name: "Zaakceptuj klatkę" });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Ładowanie…" })).toBeDisabled();
    });
    expect(screen.getByRole("button", { name: "Ładowanie…" })).toHaveAttribute(
      "aria-busy",
      "true",
    );

    release?.();
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });
});
