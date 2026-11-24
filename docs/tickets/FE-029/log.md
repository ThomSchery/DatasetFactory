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

## Bramka 1 i cold review (2026-11-24)

- `check.ps1` na `1434985` (bez równoległych procesów): backend format / lint / typy / testy (613 s), frontend typy / testy (1028) / build — PASS; E2E 94/95 — `fe019-visual-qa.spec.ts:102` szukał regionu „Classes”.
- Cold review (claude opus high; codex wyczerpał limit): WYMAGA POPRAWEK — P1 ten sam FE-019; P2 komentarz mówił, że klasa znika z regionem, a zapisana zostaje (decyzja dla użytkownika, na razie wariant „zostaje”); P3 brak testów: zmiana znaków w regionie null/null, podsumowanie null/null, usunięcie regionu na obrazie; P4 liczniki niespójne między panelami i liczące znaki spoza profilu („40 of 38”); P5 notka o dziedziczeniu tylko przy `allowed_chars === null`; P6 long-press na iOS (pytanie, nie blokuje — aplikacja lokalna na Windows).

## FIX1

1. P1: `fe019-visual-qa` szuka regionu „OCR settings”.
2. P2: komentarz w `ProfileWorkspaceScreen` i docstring `OcrSettingsPanel` mówią prawdę — zapisana klasa zostaje po usunięciu regionu; w tickecie dopisane jako decyzja do podjęcia przez użytkownika.
3. P3: trzy testy w `profileWorkspace.test.tsx` — region null/null po zmianie znaku zapisuje parę `{allowed_chars: "7", page_segmentation_mode: 7}`, podsumowanie „all 2 characters, Layout inherited”, usunięcie regionu klawiszem Delete na obrazie czyści listę i panel, a zapis niesie zapisaną klasę.
4. P4: `regionCharacterCount` w `profileDraft.ts` (bez powtórzeń, tylko znaki profilu), używany przez Annotations i OCR settings; test „779X” → 1.
5. P5: notka o dziedziczeniu przy `allowed_chars === null || page_segmentation_mode === null`.
6. Kosmetyka: tytuł testu FE-016.
