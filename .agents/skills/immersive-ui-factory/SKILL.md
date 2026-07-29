---
name: immersive-ui-factory
description: Create reusable, asset-driven visual systems and immersive interfaces from application screenshots, product context, existing designs, or individual UI assets. Use when Codex should analyze visual references, dynamically plan an asset-production workflow, guide a user checkpoint by checkpoint, generate or validate scalable panel/button/input frames, prepare 9-slice assets, create theme variants, run and compare versioned design iterations, select a final direction, package a framework-neutral theme, or adapt that package to Instatic or another frontend. Do not assume a fixed aesthetic, component list, image provider, target framework, or mandatory concept-render phase.
---

# Immersive UI Factory

Build a run-specific production graph instead of applying a fixed recipe. Treat generated images as source material and deterministic scripts as the authority for packaging, scaling, and validation.

## Start every run

1. Inspect the target application, supplied references, and requested output.
2. Identify existing authority: product truth, approved design, screenshots, assets, component system, target runtime.
3. Classify the run and select only required capabilities from [references/capabilities.md](references/capabilities.md).
4. Show the proposed capability graph, outputs, approval gates, and assumptions to the user.
5. Initialize the run with `bun scripts/init-design-run.ts --root <directory> --goal <goal> [--target <target>]` after approval.

Never require a full concept render when an approved design already exists. Never require 9-slice for assets that should be CSS, SVG, fixed-size imagery, or ordinary responsive layout.

## Execution loop

For every selected capability:

1. Name the artifact being produced now.
2. State its inputs, output path, size/format constraints, and acceptance criteria.
3. Produce or request the artifact.
4. Validate it with the applicable script or target renderer.
5. Stop at the declared approval gate.
6. Record accepted/rejected state and provenance in `run.json`.

Do not silently advance past an artistic or product decision. Do not generate all assets in one batch unless the user explicitly chooses unattended mode.

## Asset rules

- Keep text and product data in semantic UI, not baked into reusable graphics.
- Preserve neutral geometry masters separately from color variants.
- Record prompts, model/provider, input references, license, dimensions, checksum, and approval state.
- Use raster imagery only when material, texture, lighting, or authored illustration earns it.
- Keep components usable without decorative textures, motion, or audio.
- Never imitate protected game/studio assets directly; describe original materials and mechanics.

For scalable raster frames, read [references/nine-slice.md](references/nine-slice.md) and validate metadata with `bun scripts/validate-nine-slice.ts`.

## Target adapters

Build a framework-neutral theme package first. Load a target reference only when that target is selected:

- Instatic: [references/instatic.md](references/instatic.md)
- Other frameworks: inspect their native tokens, components, asset loader, and responsive primitives before defining an adapter.

An adapter may transform the package but must not become its source of truth.

## Iteration laboratory

When the user wants alternatives, comparison, or final-direction selection, read [references/design-iterations.md](references/design-iterations.md). Treat each variant as an independently restorable package. Evaluate against declared criteria and evidence; do not select a winner from visual preference alone.

## Quality gate

Before delivery:

- validate the run manifest and every produced asset;
- render all declared breakpoints and component states;
- test keyboard focus, contrast, reduced motion, missing asset fallback, and extreme component sizes;
- report omitted capabilities explicitly;
- keep publishing/deployment as a separate user decision.

Use [references/checkpoints.md](references/checkpoints.md) for approval and failure handling.
