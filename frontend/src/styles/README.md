# Styles — the design centre

`design-preset.css` is the single source of design values. It is the export of
the user's **figma-tailwind-tokens** plugin (Preset_3: Colors Dark,
Dimensions / Borders / Typography / Variable collection Mode 1) and is
committed byte for byte, never edited by hand. Everything else in this folder
either maps onto it (`tokens.css`) or holds what the preset does not export yet.

The project does not use Tailwind (decision F16 in `docs/CONTEXT.md`). The
preset's `@theme static { … }` block is converted to plain `:root { … }`
variables at build time by `designPreset.ts`, registered in `vite.config.ts`
(dev server, `vite build`, the Playwright dev server). Vitest reads the file
through the same function.

## Swapping the preset

1. Export the preset from the plugin (the same modes as above).
2. Overwrite `frontend/src/styles/design-preset.css` with the export. Do not
   edit it; keep the plugin's header comment.
3. Run the gate: `scripts/check.ps1`. It converts the file, checks every
   application token still maps onto an existing preset variable, measures
   contrast through the `var()` chain, and compares what the browser paints
   with the values read from the file (`e2e/fe024-design-preset.spec.ts`).
4. If the export uses Tailwind syntax the converter does not support
   (`@theme reference`, `@utility`, `@variant`, `@apply`,
   `@import "tailwindcss"`, `--color-*: initial`, nested rules), the build
   fails with the file and line instead of dropping the values.
5. If the export adds a variable for something listed under
   "Not in the preset yet", move that token up into section 1 of `tokens.css`
   and extend `EXPECTED_MAPPINGS` in `src/test/architecture.test.ts`.

## Files

| File | Role |
|---|---|
| `design-preset.css` | The plugin export. Values. Never edited. |
| `designPreset.ts` | `convertThemeBlocks` (`@theme` → `:root`), `parseRootVariables`, the Vite plugin. |
| `tokens.css` | Application tokens: section 1 maps onto the preset with `var()`; section 2 "Not in the preset yet" holds annotated own values. |
| `breakpoints.ts` | The canonical width thresholds 576 / 768 / 992 / 1200 (`max-width` queries use the value − 0.02). CSS repeats them literally because `@media` cannot read a variable; the architecture test allows no other width. |
| `global.css`, `fonts.css` | Resets, root background, focus ring, bundled Inter. |

## Preset variable → application token

| Preset variable | Value | Application token | Note |
|---|---|---|---|
| `--spacing-0` | 0 | `--size-none` | |
| `--spacing-4` | 4px | `--size-xxs` | |
| `--spacing-8` | 8px | `--size-xs` | |
| `--spacing-16` | 16px | `--size-sm` | |
| `--spacing-24` | 24px | `--size-md` | |
| `--spacing-32` | 32px | `--size-lg` | |
| `--spacing-gap-48` | 48px | `--size-xl` | |
| `--spacing-site-padding-xs` | 16px | `--site-padding` | page margin at every width (FE-022 D07) |
| `--spacing-element-padding-l-r-l` | 16px | `--element-padding-x-lg` | |
| `--spacing-element-padding-l-r-m` | 8px | `--element-padding-x-md` | |
| `--spacing-element-padding-l-r-s` | 6px | `--element-padding-x-sm` | |
| `--spacing-element-padding-u-d-l` | 8px | `--element-padding-y-lg` | |
| `--spacing-element-padding-u-d-m` | 4px | `--element-padding-y-md` | |
| `--spacing-element-gap-l` | 8px | `--element-gap-lg` | |
| `--spacing-element-gap-m` | 6px | `--element-gap-md` | |
| `--text-p-sm` | 12px | `--font-size-xs` | **deviation**: the smallest text is 12 px, not `text-p-xs` 10 / `text-p-xxs` 8 (FE-021) |
| `--text-p-md` | 16px | `--font-size-md` | |
| `--radius-0` | 0 | `--radius-none` | |
| `--radius-4` | 4px | `--radius-sm` | |
| `--radius-8` | 8px | `--radius-md` | |
| `--radius-16` | 16px | `--radius-lg` | |
| `--border-width-1` | 1px | `--border-width-default` | |
| `--color-surface-page` | #23262C | `--color-background-primary-default` | |
| `--color-surface-panel` | #2B303A | `--color-surface-neutral-default` | |
| `--color-surface-panel-hover` | #383F4C | `--color-surface-neutral-raised`, `--color-stroke-weak-default` | the second stands in for Figma `border/subtle`, same value, not exported |
| `--color-surface-panel-selected` | #4B5465 | `--color-surface-neutral-selected`, `--color-fill-brand-default` | |
| `--color-text-primary` | #F6F7F8 | `--color-text-strong-default`; `--color-surface-neutral-hover` = 6 % of it | hover layer via `color-mix` (COLOR-07) |
| `--color-text-secondary` | #B9BFCB | `--color-text-weak-default`, `--color-stroke-strong-default` | |
| `--color-text-placeholder` | #959EB0 | `--color-text-placeholder-default` | |
| `--color-icon-placeholder` | #959EB0 | `--color-stroke-control-default` | **deviation**: control outlines need 3:1 on every surface; `border/strong` #626C80 gives 2.87:1 on the page (FE-021) |
| `--color-icon-inverse` | #23262C | `--color-text-on-brand` | Figma `text/inverse`, not exported; same value |
| `--color-border-default` | #4B5465 | `--color-stroke-panel-default` | |
| `--color-border-focus` | #F6F7F8 | `--color-fill-brand-impeccable`; `-hover` / `-active` = 80 %, `-soft` = 12 % of it | the document's accent; `*-impeccable` names are fixed by `new-component.md` |

Preset variables with no application token yet: `--spacing-2`, `--spacing-6`,
`--spacing-site-padding-m` / `-l`, `--spacing-gap-16` / `-32`,
`--spacing-size-16` / `-40`, `--radius-element-s`, `--radius-32`,
`--radius-40`, `--text-p-xxs`, `--text-p-xs`, `--color-surface-panel-pressed`,
`--color-icon-primary` / `-secondary`, `--color-border-strong`. They are on
`:root` and may be mapped when a component needs them.

## Not in the preset yet

Section 2 of `tokens.css`; each entry names its source.

| Group | Tokens | Source |
|---|---|---|
| Spacing above 48 | `--size-xxl` 64, `--size-3xl` 80 | 8-point scale, FE-SETUP |
| Control heights | `--control-height-sm/md/lg` 32 / 40 / 48, `--measure-copy` | FE-SETUP |
| Geometry | top bar 44, icon 24, strip 56, fields 34 / 42, rows 35 / 40, columns 247 / 205 / 261 / 361, picture heights, `--workspace-panel-width`, `--data-list-column-min` 160 | Figma 05.11 `geometry.json` (FE-022), FE-SETUP |
| Width thresholds | 576 / 768 / 992 / 1200 | `breakpoints.ts`; `@media` cannot read a variable |
| Fonts | families, weights 300 / 400 / 600 / 700 | Figma uses Inter; the plugin exports no family or weight |
| Text sizes | `--font-size-sm` 14, `-lg` 20, `-xl` 24, `-2xl` 32 | Figma 03.11 scale; `text/p/*` stops at 16 |
| Line height, letter spacing | `--line-height-*`, `--letter-spacing-*` | FE-SETUP |
| Radius | `--radius-pill` | FE-SETUP |
| Border widths | `--border-width-emphasis` 2, focus ring 2 / 2 | FE-SETUP; the preset has `border-width-1` only |
| Shadows, scrim | `--shadow-elevation-*`, `--color-overlay-scrim` | FE-021, tuned to the page colour |
| Status colours | error #F3877D / #3E1916 (Figma 03.11 `text/error`, `surface/error`), success, warning | the preset exports no status colour |
| Interaction | `--opacity-hover`, `--opacity-disabled`, `--spinner-duration`, `--color-surface-transparent` | FE-SETUP |

## The two deviations

Both are recorded in `docs/tickets/FE-021/log.md` and kept as mappings, so a
new export still drives them:

1. **Control outline**: `--color-stroke-control-default` → `icon/placeholder`
   #959EB0 (5.63:1 / 4.91:1 / 3.93:1), not `border/strong` #626C80 (2.87:1 on
   the page, 2.0:1 on a raised panel). `src/styles/contrast.test.ts` pins it.
2. **Smallest text**: `--font-size-xs` → `text/p/sm` 12 px, not the 8 / 10 px
   the document labels compact controls with.
