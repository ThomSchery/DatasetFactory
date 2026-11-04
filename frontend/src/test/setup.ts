import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom does not implement the native dialog methods. Browser tests cover
// actual modality and focus behavior; this shim supplies the open state here.
if (typeof HTMLDialogElement.prototype.showModal !== "function") {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
}

// Vitest runs without `globals`, so Testing Library cannot install its own
// auto-cleanup. Without this, one test's DOM leaks into the next and queries
// start reporting duplicate matches.
afterEach(() => {
  cleanup();
});
