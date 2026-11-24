# FE-029 — log wykonania

## Diagnoza (2026-11-24)

`ClassGroupsPanel` łączył trzy rzeczy: Custom (zmiana nazwy i usuwanie klas `game` — po FE-026 dublował listę regionów), Numbers / Letters / Symbols (pola wyboru `allowed_chars` **zaznaczonego** regionu — bez zaznaczenia wyszarzone i puste, co wyglądało na „nic”) oraz zwijane „OCR settings” (PSM + 38-wierszowa lista zmiany nazw klas znakowych). Użytkownik widział duplikat regionów i nieczytelne pola.

## Decyzje

- Jeden panel „OCR settings”, zawsze rozwinięty. Grupy znaków zostają w `GroupedOptionList` `inline` (zwijane grupy z polem wyboru całej grupy) — to jest „nadkategoria z listą rozwijaną”, bez nowego komponentu.
- Bez zaznaczenia zamiast wyszarzonych pól podsumowanie per region; wiersz jest przyciskiem zaznaczającym region (wgląd + szybkie przejście).
- Liczba znaków „(all)” / „(n)” przy regionie w Annotations zostaje (wzorzec Figmy `(n)`); znika tylko kosz.
- Usuwanie regionu tylko na obrazie: `RegionOverlay` ma menu kontekstowe „Delete” i Delete / Backspace na zaznaczonym kształcie (sprawdzone w kodzie).

## Design Plan (2026-11-24, przed zmianą `frontend/src/`)

Przeczytane: `AGENTS.md`, `frontend/src/AGENTS.md`, `.agent/guidelines/new-component.md` (sekcje 2, 4, 5 — Panel, Button, GroupedOptionList, CollapsibleGroup), `tokens.css`, `ClassGroupsPanel.css`, `AnnotationsPanel.css`.

### Elementy interfejsu

1. **Panel OCR settings** — `Panel` (tytuł „OCR settings”, `aside` = nazwa zaznaczonego regionu), w miejscu dawnego panelu klas; promień `sm` jak dotąd.
2. **Notka o dziedziczeniu / podpowiedź** — `<p>` `--font-size-xs`, `--line-height-standard`, `--color-text-weak-default`.
3. **Text layout** — podtytuł jak `df-class-groups__subtitle` + `GroupedOptionList` single (bez zmian).
4. **Characters OCR reads** — podtytuł + `GroupedOptionList` multiple `inline`, grupy zwinięte na starcie; style wierszy przeniesione 1:1 z `ClassGroupsPanel.css` (40 px, `--class-row-height`, `surface/page`, zaznaczenie `surface/panel-selected` + `border/focus`).
5. **Podsumowanie regionów** — lista przycisków `Button` (`muted`), każdy: nazwa (`text/primary`), liczba znaków i układ (`text/secondary`), tło `surface/page`, promień `--radius-sm`, odstęp `--element-padding-y-md`.
6. **Annotations** — wiersz regionu bez kosza: przycisk zajmuje całą szerokość.

### Checklista

- [x] Layout/Siatka: panel `display: grid`, `gap` z tokenów (`--element-gap-md` / `--element-padding-y-md`) (GRID-01/02).
- [x] Typografia: `--font-size-xs`, wagi `--font-weight-light` / `regular` (FONTSIZE-\*, TYPO-\*).
- [x] Kolory: `--color-text-strong-default`, `--color-text-weak-default`, `--color-background-primary-default`, `--color-surface-neutral-selected` (COLOR-\*).
- [x] Obramowania: `--radius-sm`, `--border-width-default`, `--color-fill-brand-impeccable` dla zaznaczenia (BORDER-\*, RADIUS-\*).
- [x] Cienie: brak.
- [x] Interakcje: hover / active jak dotychczasowe wiersze (`surface-neutral-raised` / `pressed`), disabled `--opacity-hover` (OPACITY-\*).
- [x] Komponenty: `Panel`, `GroupedOptionList`, `Button`, `InlineError` z `common/`; nowych nie ma.
