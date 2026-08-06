import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest runs without `globals`, so Testing Library cannot install its own
// auto-cleanup. Without this, one test's DOM leaks into the next and queries
// start reporting duplicate matches.
afterEach(() => {
  cleanup();
});
