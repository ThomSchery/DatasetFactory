# FE-027 — log wykonania

## Diagnoza (2026-11-24)

`FrameEditor` renderuje edytor boksu (`AnnotationPopover`) jako pierwsze dziecko panelu Annotations, nad `ClassList` i Reject / Accept. Bez zaznaczenia zostaje tam nieaktywne pole „Class”; po narysowaniu boksu dochodzi nagłówek „New box” + odznaka, otwarta lista klas (autofocus otwiera combobox) i dwa przyciski — panel rośnie, a akcje boksu mieszają się z decyzją o całej klatce (zrzuty użytkownika z 2026-11-24).

Makiety obu opcji: kanwa `artifacts/datasetfactory-new-box` (Traycer). Wybrana opcja A.

## Decyzje

- Przenoszę cały `AnnotationPopover` bez zmiany jego zachowania do nowego `Panel` „Box” nad Annotations. Picker zostaje comboboxem (lista otwiera się przy autofocusie po narysowaniu, nie zamyka po wyborze, da się ją zwinąć) — dzięki temu FE-019 (stabilność kanwy przy zwijaniu listy) i cała logika zamykania „kliknięciem poza” działają bez zmian.
- Pusty stan zamiast nieaktywnego pola: podpowiedź mówi, co zrobić, a nieaktywny combobox niczego nie mówił. Region zachowuje nazwę „Annotation — nothing selected”.
- Odstępstwo od Figmy: kolumna `Frame 53` ma tylko Annotations i Repeat Previous; panel Box przesuwa Repeat Previous w dół. W specu zgodności FE-022 wyjątek z uzasadnieniem zamiast cichego poluzowania progu.

## Design Plan (2026-11-24, przed zmianą `frontend/src/`)

Przeczytane: `AGENTS.md`, `frontend/src/AGENTS.md`, `.agent/guidelines/new-component.md` (sekcje 2, 4, 5 — Panel, Button, GroupedOptionList), `tokens.css`, `AnnotationReviewScreen.css`, `Panel.tsx`.

### Elementy interfejsu

1. **Panel Box** — `Panel` (tytuł „Box”, `df-review-box`), pierwszy w `df-review-workspace__side-column`; odstęp do Annotations = gap kolumny `--element-gap-lg`.
2. **Pusty stan** — `<p>` w regionie „Annotation — nothing selected”, styl jak `df-review-note`: `--font-size-xs`, `--line-height-standard`, `--color-text-weak-default`, `margin: 0`.
3. **Edytor boksu** — bez zmian wizualnych (`df-annotation-popover`: nagłówek, odznaki `StatusBadge`, `GroupedOptionList`, `Button` sm, `InlineError`, komunikat niezapisanego przesunięcia).
4. **Annotations** — `ClassList` (stała wysokość 4 × `--list-row-height`), notatki, Reject / Accept / Reopen; bez zmian stylu.
5. **Repeat Previous** — bez zmian.

### Checklista

- [x] Layout/Siatka: kolumna `display: grid`, `gap: var(--element-gap-lg)` (GRID-01/02); nowy panel bez własnych marginesów.
- [x] Typografia: podpowiedź `--font-size-xs` / `--line-height-standard` (FONTSIZE-\*, LHEIGHT-\*), waga domyślna.
- [x] Kolory: `--color-text-weak-default` (COLOR-\*); powierzchnia i obrys z `Panel`.
- [x] Obramowania: z `Panel` (`border/default`, `--radius-md`) (BORDER-\*, RADIUS-\*).
- [x] Cienie: brak.
- [x] Interakcje: stany przycisków i listy bez zmian (komponenty wspólne).
- [x] Komponenty: `Panel`, `GroupedOptionList`, `Button`, `StatusBadge`, `InlineError` z `common/`; nowych nie ma.

## Bramka i review (2026-11-24)

- Vitest: Review 162/162 po zmianach; pełny Vitest w bramce 1032/1032.
- `check.ps1`, przebieg 1 (`58efc23`): backend testy 320 błędów setupu `PermissionError [WinError 32]` na `app.jsonl` w basetemp pytest — w tym samym czasie chodził mój równoległy, celowany przebieg E2E. FE-027 nie zmienia backendu.
- `check.ps1`, przebieg 2 (`e08c4ad`, bez równoległych procesów): backend format / lint / typy / testy, frontend typy / testy / build — PASS; E2E 94/95 — `fe025-figma-icons-polish.spec.ts:740` (obrysy regionów przy 195 % i 596 %) przekroczył limit 30 s przy obciążonej maszynie (backend testy 1068 s zamiast ~630 s).
- Ten spec osobno: 15/15 PASS. Pełne E2E ponownie (`npm run e2e`, porty 5197 / 8038 / 8039, środowisko jak w `check.ps1`): **95/95 PASS**; `npm run test:e2e-root`: 4/4 PASS. Łącznie wszystkie 9 bramek zielone na `e08c4ad`, ostatnie dwie w osobnym przebiegu.
- Celowane E2E przed bramką: zgodność z Figmą (z wyjątkiem `shiftedBy` dla Box), FE-015, FE-017, FE-019 — zielone; zrzuty `FE-019/annotation-expanded-1440x1000`, `FE-015/editor-no-selection-1440x1000` obejrzane.
- Cold review (codex gpt-6.1-sol high): **GOTOWE DO MERGE**, bez P1–P3. Uwaga porządkowa o komentarzu do `previousElementSibling` (w `Panel` edytor jest pierwszym dzieckiem `.df-panel__body`, obserwator nic nie obserwuje — tak samo przed FE-027) — komentarz poprawiony w `e08c4ad`.
