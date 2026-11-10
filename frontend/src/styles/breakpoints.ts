/*
 * FE-024 — the one canonical set of width thresholds. CSS cannot read custom
 * properties inside `@media`, so the stylesheets repeat these numbers
 * literally; `src/test/architecture.test.ts` allows no other width in any
 * `@media` of `frontend/src`, and no literal threshold in TS outside this
 * file. The Figma document of 2026-11-05 draws its frames at 360 / 576 / 768 /
 * 992 / 1200 px; 360 is the smallest supported window, not a threshold.
 */
export const BREAKPOINTS = {
  /** Phone → wide phone: the Review picture gets its tool row, Run Setup its aspect ratio. */
  sm: 576,
  /** The side bar becomes a strip; the three workspaces get their fixed left column. */
  md: 768,
  /** Wide desktop: the Review picture grows with the window. */
  lg: 992,
  /** Figma's widest frame. */
  xl: 1200,
} as const;

export type BreakpointName = keyof typeof BREAKPOINTS;

/**
 * Upper bound for a `max-width` query that must not overlap `min-width: <bp>`
 * at the same breakpoint: `767.98px` pairs with `768px`.
 */
export function maxWidthBelow(name: BreakpointName): number {
  return Math.round((BREAKPOINTS[name] - 0.02) * 100) / 100;
}

/** Every value a `@media (min-width: …)` in `frontend/src` may use, in px. */
export const MIN_WIDTH_QUERY_VALUES: readonly number[] = Object.values(BREAKPOINTS);

/** Every value a `@media (max-width: …)` in `frontend/src` may use, in px. */
export const MAX_WIDTH_QUERY_VALUES: readonly number[] = (
  Object.keys(BREAKPOINTS) as BreakpointName[]
).map(maxWidthBelow);
