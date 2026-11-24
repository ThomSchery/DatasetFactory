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
