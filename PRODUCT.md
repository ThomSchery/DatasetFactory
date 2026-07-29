# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A single person building their own training dataset from their own gameplay
recordings. Confirmed situation: solo, usually in the evening, on the same
monitor they play on, alongside the game itself. Not a labeling team, not a
shift; the session ends when they decide it ends.

No second audience has been confirmed.

## Product Purpose

DatasetFactory turns gameplay video into labeled training data. The user defines
what the game's HUD looks like once, imports a recording, lets autolabeling run,
and checks the result before it leaves the tool as a dataset.

Success is a dataset the user trusts enough to train on — which means the
verification step is part of the product, not a formality after it.

## Positioning

The unit of work is a **game profile**, not an image. The user describes one
game's HUD — its regions and its classes, including numbers that can be negative
and game-specific readings like health and armour — and that profile is what
makes every later recording of that game labelable without touching it again.
A general-purpose annotation tool starts from images and asks the human to
supply meaning per image; this starts from the game and supplies meaning per
recording.

## Operating Context

- Source material is the user's own gameplay capture, in `MP4`, `MKV` or `MOV`.
- Sampling defaults to one frame per second.
- The autolabeling pipeline has five named stages, in order: Próbkowanie →
  Regiony HUD → OCR → SAM 3 → Weryfikacja.
- Class families the HUD profile covers: `negative-number`, `health`, `armour`,
  `letters A-Z`, `digits 0-9`, `game-specific classes`.
- Models run locally. The interface reports GPU state ("GPU offline", "Modele
  uruchamiane lokalnie"), so compute availability is a fact the user sees and
  works around, not an implementation detail.
- Interface language is Polish; technical terms (OCR, SAM 3, HUD, class names)
  stay in English.

## Capabilities and Constraints

- Five screens, and this set is a fixed constraint the user confirmed for design
  work: **Dashboard, Profile gier, Materiały, Anotacje, Eksporty**.
- Confirmed actions in the incumbent interface: create a game profile
  (stated at roughly 3 minutes), import a video, open the most recent project.
- **Undecided / not established:** export formats, dataset size limits, project
  or run naming, multi-user or sharing behavior, pricing, any accuracy figure.
  Earlier design mockups in this epic invented placeholder metrics, project
  names and export format names — those are demonstration material, not product
  truth, and must not be promoted to fact here.

## Brand Commitments

Name: **DatasetFactory**. The five-screen sidebar set above is a binding
constraint on new design work. Nothing else has been made binding — the current
`.df-*` token system and the Impeccable/Console page variants are incumbent
evidence, explicitly not authority over a replacement world.

## Evidence on Hand

- Incumbent interface: Instatic CMS at `D:\my\Projects\Instatic`, pages `index`
  (`Home`), `impeccable` (`Home — Impeccable`), `console` (`Home — Console`),
  stored as node trees in `.tmp/dev.db` (`data_rows`, `table_id = 'pages'`).
- Incumbent design system: `.df-*` classes and `--df-*` / `--color-*` tokens in
  `site.settings_json → styleRules`.
- **Absent:** real datasets, real runs, real accuracy numbers, real user
  quotes. Any figure a new surface shows is authored demonstration data and must
  be labeled as such.

## Product Principles

1. **The profile is the asset.** Effort spent describing a game pays back on
   every later recording of it; the interface should make that payback visible.
2. **Nothing leaves unverified.** Autolabeling proposes; the user disposes. The
   verification stage is the product's spine, not its last chore.
3. **Local compute is a visible condition.** GPU state, queue depth and stage
   progress are facts the user plans around, so they belong on the surface.
4. **One person, one session, their own footage.** No collaboration ceremony, no
   assignment queues, no reviewer roles.

## Accessibility & Inclusion

No product-specific requirement has been established beyond ordinary web
accessibility. The confirmed usage scene — evening, single monitor shared with
the game — is a design input, not an accessibility exemption.
