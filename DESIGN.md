# DatasetFactory — Signal Rack

> **Status (2026-07-30): not the v1 baseline.** The user chose `Home — Impeccable`
> as the implementation baseline for v1; the extracted artifact lives in
> `designs/baseline-impeccable/` and the decision is recorded in `docs/CONTEXT.md`.
> This direction contract stays on file as a design candidate, not as the
> constraint implementation follows.

## Direction contract

**THESIS:** Autolabeling is a signal chain, not a grid of dashboard cards. The interface refuses the familiar sidebar-plus-metrics arrangement.

**OWN-WORLD:** A broadcast equipment rack: charcoal enclosure, warm grey module faces, screen-printed labels, amber VU readings, red tally lamps, restrained test-bar colour, square mechanical controls.

**STORY:** The user sees where footage enters, which stage is active, what requires verification, and what action advances the session.

**FIRST VIEWPORT:** A five-module processing rack dominates the canvas. A verification monitor sits below it. The left patchbay preserves the five required destinations; import is the primary control.

**FORM:** Direction 6, “broadcast equipment room,” chosen from the Impeccable direction roll in Operate mode. The staging is a horizontal rack above a verification monitor.

## Durable rules

- The physical scene is one person working beside a game at night; the shell is dark and low-glare.
- Navigation contains exactly: Dashboard, Profile gier, Materiały, Anotacje, Eksporty.
- The pipeline is always a connected signal path: Próbkowanie → Regiony HUD → OCR → SAM 3 → Weryfikacja.
- Colour is instrumentation, not decoration: amber means measured/working, red is the active tally or an error, green is ready/confirmed, test-bar colours appear only in media/signal contexts.
- Every lamp, meter and readout must have a text label. State is never communicated by colour alone.
- Module faces use square or lightly rounded corners, inset seams, screen-printed labels and tabular measurements. Avoid generic floating cards, neon glows and glass.
- Monospace is reserved for measurements, identifiers and machine state. Interface copy uses a compact workhorse sans.
- Primary controls look like deliberate hardware controls but retain native focus, disabled and busy states.
- At narrow widths the rack becomes a vertical signal chain; navigation becomes a compact top patchbay without removing destinations.
- Demonstration values must be marked as illustrative until connected to real project data.
