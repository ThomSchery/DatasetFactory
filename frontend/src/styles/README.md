# Styles - the design centre

The active baseline is **Instatic / DatasetFactory - Final mockup (grid)**,
page `df-final-mockup`, approved on 2026-11-27 (FE-036). It replaces the previous
Figma palette and fixed workspace columns. The original Figma preset is kept
in `designs/final-mockup-grid/previous-preset.css`.

## Where to change the design

| File | Responsibility |
| --- | --- |
| `design-preset.css` | Palette, base spacing, base radius and type sizes. |
| `tokens.css`, section 1 | Semantic mappings onto the preset, with no copied values. |
| `tokens.css`, section 2 | Named geometry and values the preset does not export. |
| `breakpoints.ts` | Canonical thresholds; CSS repeats them because media queries cannot read CSS variables. |
| `global.css`, `fonts.css` | Reset, canvas background, focus ring and locally bundled Inter. |
| `designPreset.ts` | Converts `@theme` to `:root` and validates supported syntax. |

The project uses plain CSS, not Tailwind (F16). `main.tsx` imports the preset as
its own module so Vite applies the converter. Vitest reads it through the same
conversion. Keep colours, radius, spacing and shared geometry in this directory;
components consume semantic variables.

## Active palette

| Preset variable | Value | Role |
| --- | --- | --- |
| `--color-surface-page` | `#1b1e25` | Application background |
| `--color-surface-panel` | `#23272f` | Options and run cards |
| `--color-surface-panel-hover` | `#2a2f39` | Hover and raised states |
| `--color-surface-panel-pressed` | `#1e222a` | Fields and pressed state |
| `--color-surface-panel-selected` | `#39362f` | Selected neutral surface |
| `--color-text-primary` | `#e6e8ee` | Strong text |
| `--color-text-secondary` | `#9aa1b1` | Secondary text and resting icons |
| `--color-icon-placeholder` | `#8a91a2` | Accessible control outlines |
| `--color-border-default` | `#363b47` | Structural outlines |
| `--color-border-focus` | `#e8b04a` | Amber focus and selection |
| `--color-icon-primary` | `#f5d58e` | Selected and hovered icons |

`tokens.css` also names the canvas, top bar and rail surfaces absent from the
preset. The historical `*-impeccable` application names remain aliases for the
current accent because the common component catalogue refers to those names.
The minimum text size remains 12px. Contrast tests resolve the full variable
chain and check text at 4.5:1 and control/region outlines at 3:1.

## Responsive layout

The shell has a 24px outer margin, 12px radius and a collapsible icon rail at
every width (44px on compact screens, 52px from SM). Shared frame max widths,
control sizes and panel radii live in `tokens.css`.

Setup and Run show the preview before options through 768px inclusive. At 769px
they become a 12-column grid with a 24px gutter: controls 5/12 and preview 7/12;
from 992px, 4/12 and 8/12; from 1200px, 3/12 and 9/12. The Annotations list
becomes a compact information row at XL and stacked cards below it.

The canonical thresholds are 576, 768, 992, 1200 and 1400px, with 769px as the
explicit workspace exception. Architecture tests reject other width literals
and raw component colours.

## Data and interactions

Run engine cards read the API probes, including unavailable states and whether
the engine consumes a region text layout. Scan rules show the saved profile
values. Their edit action opens that exact profile through
`/profiles?profile=...`; the API has no per-run OCR rule overrides. Sample rate
presets set the same validated form field as manual entry. Existing import,
save, conflict, review, export and error flows continue to use their APIs.

## Replacing the preset

1. Replace `design-preset.css` with the next approved palette/export and keep
   its source in the header. Preserve the variable names the mapping consumes.
2. Put new geometry absent from that preset in the annotated section 2 of
   `tokens.css`. If a new preset variable replaces an own token, move its mapping
   to section 1 and update `EXPECTED_MAPPINGS` in the architecture test.
3. Run the frontend build and tests. The converter rejects unsupported Tailwind
   directives instead of silently dropping them; architecture tests check
   mappings, contrast and component token use.
4. Inspect populated screens at the breakpoints, especially 768/769px, including
   focus, disabled and error states. The old Figma parity specifications remain
   historical evidence; FE-036 intentionally replaces their visual geometry.
