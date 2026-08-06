import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { restoreViewportWidth, setViewportWidth } from "../test/harness";
import { WidthGuard } from "./WidthGuard";
import { WORKSPACE_MIN_WIDTH } from "./viewport";

/*
 * FE-07: below the minimum working width the application says so instead of
 * squeezing the layout. A compressed box editor would quietly produce bad
 * annotations rather than obviously refusing.
 */

afterEach(() => {
  restoreViewportWidth();
});

const UNSUPPORTED_TITLE = "Okno jest za wąskie dla DatasetFactory";

describe("WidthGuard", () => {
  it("renders the normal layout at the minimum working width", () => {
    setViewportWidth(WORKSPACE_MIN_WIDTH);
    render(
      <WidthGuard>
        <p>Normalny układ</p>
      </WidthGuard>,
    );

    expect(screen.getByText("Normalny układ")).toBeInTheDocument();
    expect(screen.queryByText(UNSUPPORTED_TITLE)).toBeNull();
  });

  it("renders the normal layout above the minimum working width", () => {
    setViewportWidth(1440);
    render(
      <WidthGuard>
        <p>Normalny układ</p>
      </WidthGuard>,
    );

    expect(screen.getByText("Normalny układ")).toBeInTheDocument();
  });

  it("replaces the layout with a message below the minimum working width", () => {
    setViewportWidth(WORKSPACE_MIN_WIDTH - 1);
    render(
      <WidthGuard>
        <p>Normalny układ</p>
      </WidthGuard>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(UNSUPPORTED_TITLE);
    expect(screen.queryByText("Normalny układ")).toBeNull();
  });

  it("names the required and the current width so the message is actionable", () => {
    setViewportWidth(1024);
    render(
      <WidthGuard>
        <p>Normalny układ</p>
      </WidthGuard>,
    );

    const message = screen.getByRole("region", { name: UNSUPPORTED_TITLE });
    expect(message).toHaveTextContent(`${WORKSPACE_MIN_WIDTH} px`);
    expect(message).toHaveTextContent("1024 px");
  });

  it("reacts to the window being resized in both directions", () => {
    setViewportWidth(1440);
    render(
      <WidthGuard>
        <p>Normalny układ</p>
      </WidthGuard>,
    );
    expect(screen.getByText("Normalny układ")).toBeInTheDocument();

    setViewportWidth(900);
    expect(screen.queryByText("Normalny układ")).toBeNull();
    expect(screen.getByText(UNSUPPORTED_TITLE)).toBeInTheDocument();

    setViewportWidth(1600);
    expect(screen.getByText("Normalny układ")).toBeInTheDocument();
    expect(screen.queryByText(UNSUPPORTED_TITLE)).toBeNull();
  });
});
