import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { render, type RenderResult } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { vi } from "vitest";

import { createQueryClient } from "../app/queryClient";
import { appRoutes } from "../app/routes";

/*
 * Shared test harness. It wires the real query client and the real route table
 * so tests exercise the shipped composition rather than a parallel one.
 */

export interface RenderAppResult extends RenderResult {
  queryClient: QueryClient;
}

/** Renders the whole shell and route table at `initialEntries`. */
export function renderApp(initialEntries: string[] = ["/"]): RenderAppResult {
  const queryClient = createQueryClient();
  const router = createMemoryRouter(appRoutes, { initialEntries });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

/** Renders an arbitrary tree inside a query client, without routing. */
export function renderWithQueryClient(ui: ReactNode): RenderAppResult {
  const queryClient = createQueryClient();
  const result = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return { ...result, queryClient };
}

const DEFAULT_INNER_WIDTH = window.innerWidth;

/** Sets `window.innerWidth` and emits `resize`, the way a real window would. */
export function setViewportWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  fireEvent(window, new Event("resize"));
}

export function restoreViewportWidth(): void {
  setViewportWidth(DEFAULT_INNER_WIDTH);
}

export interface StubbedResponse {
  status: number;
  body?: unknown;
}

/**
 * Replaces `globalThis.fetch` with a handler and returns the spy, so a test can
 * assert on the URL, method and body the API client actually sent.
 */
export function stubFetch(
  respond: (url: string, init: RequestInit | undefined) => StubbedResponse,
) {
  const spy = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const { status, body } = respond(String(input), init);
    const payload = body === undefined ? "" : JSON.stringify(body);
    return Promise.resolve(
      new Response(payload === "" ? null : payload, {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}
