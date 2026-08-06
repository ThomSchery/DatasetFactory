import { useSyncExternalStore } from "react";

/**
 * Mirrors `--workspace-min-width` in `src/styles/tokens.css`. Vitest does not
 * load CSS into jsdom, so reading the custom property at runtime would return
 * an empty string under test. The token stays the source for CSS, this
 * constant the source for TypeScript, and the two are documented as a pair.
 */
export const WORKSPACE_MIN_WIDTH = 1280;

function subscribe(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
  };
}

function getSnapshot(): number {
  return window.innerWidth;
}

/** Current viewport width in CSS pixels, re-read on every `resize`. */
export function useViewportWidth(): number {
  return useSyncExternalStore(subscribe, getSnapshot);
}
