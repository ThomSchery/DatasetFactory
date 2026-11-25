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

## Cold review i FIX1 (2026-11-25)

- Bramka na `a891adc` przerwana po backend testy (PASS, 602 s) i frontend typy (PASS) — i tak potrzebny pełny przebieg po FIX1.
- Cold review (claude opus high): **GOTOWE DO MERGE**, bez P1/P2. FIX1 zamyka:
  1. P3-1 — stara nazwa przemianowanego regionu, którego klasa nie poszła za nim (adopcja istniejącej klasy), też jest kandydatem do usunięcia; testy: „region renamed onto a removed name leaves no orphan”, zaktualizowany test adopcji FE-026 (stara klasa `HUD` bez regionu i boxów znika).
  2. P3-2 — `Save as` (`createRequestFrom`) kopiuje klasy `game` tylko z regionem (kopia nie ma boxów).
  3. P3-4 — filtr `GroupedOptionList` dopasowuje też `selectedLabel`.
  4. P3-5 — reguły FE-026/FE-030 dopisane do kontraktu `PUT .../definition` w `docs/TECH_PLAN.md` (odpowiedź może mieć mniej klas, niż wysłano).
  5. P3-6 — test: anotacja `deleted` zatrzymuje klasę.
- Bez zmian (do decyzji użytkownika): P3-3 — eksport COCO numeruje kategorie pozycyjnie (`enumerate` po ordinalu), więc usunięcie klasy przesuwa `category_id` następnych w kolejnym eksporcie; stabilne id = osobny ticket (`ordinal + 1`).
