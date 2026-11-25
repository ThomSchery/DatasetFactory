# FE-030 — log wykonania

## Diagnoza (2026-11-25)

- Klasa usuniętego regionu: po FE-029 szkic zawsze wysyła zapisane klasy (`categoriesToSend`), więc klasa usuniętego regionu zostawała, a UI nie miało już sposobu jej usunąć. Tylko backend wie, czy boxy jej używają.
- Strzałka „▾” w polu nazwy regionu: `TextField` z `list=` (podpowiedzi nazw klas) — Chromium rysuje wskaźnik `::-webkit-calendar-picker-indicator`, poza tokenami.
- Ucięte teksty: `.df-grouped-options__label` ma `nowrap` + wielokropek (wzorzec FE-025 dla list jednego wyboru), a podsumowanie FE-029 miało wielokropek na nazwie; zamknięte pole combobox pokazuje `label` wybranej opcji (`GroupedOptionList.tsx`, wartość inputu), który dla PSM jest długim opisem.

## Decyzje

- Usuwanie klasy po stronie backendu, w transakcji zapisu, z warunkiem „żaden wiersz annotations” (FK RESTRICT liczy też `deleted`) i „żaden aktywny region po zapisie nie nosi tej nazwy”. Front bez zmian logiki.
- PSM: pełna nazwa zostaje opisem w liście (test „explains every option”), krótka do pola i podsumowania — bez utraty informacji.

## Design Plan (2026-11-25, przed zmianą `frontend/src/`)

Przeczytane: `AGENTS.md`, `frontend/src/AGENTS.md`, `.agent/guidelines/new-component.md` (sekcje 2, 4, 5 — TextField, GroupedOptionList), `tokens.css`, `GroupedOptionList.css`, `OcrSettingsPanel.css`.

### Elementy interfejsu

1. **Pole nazwy regionu** — bez wskaźnika `datalist` (`display: none`), podpowiedzi zostają.
2. **Podsumowanie regionów** — nazwa zawija się (`overflow-wrap: anywhere`), bez `nowrap` / wielokropka.
3. **Lista PSM (otwarta)** — etykiety wierszy zawijają się w panelu OCR settings; wiersz dostaje `padding-block: var(--element-padding-y-md)`, `min-height` 35 px bez zmian.
4. **Pole PSM (zamknięte)** — krótka nazwa przez `GroupedOption.selectedLabel`.

### Checklista

- [x] Layout/Siatka: bez zmian szerokości kolumny (247 px), odstępy z tokenów (SPACING-\*).
- [x] Typografia: zawijanie zamiast wielokropka (TYPO-\*), rozmiary bez zmian.
- [x] Kolory: bez zmian (COLOR-\*).
- [x] Obramowania: bez zmian.
- [x] Cienie: brak.
- [x] Interakcje: bez zmian.
- [x] Komponenty: `TextField`, `GroupedOptionList` (opcjonalny `selectedLabel`, domyślnie `label`), `Button`; nowych nie ma.
