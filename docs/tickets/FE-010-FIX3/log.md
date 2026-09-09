# FE-010-FIX3 — log implementacji

## Zakres i przyczyna

FIX2 poprawnie odłożył decyzję o anulowaniu natywnej aktywacji przycisku do
`keyup`, ale usunął anulowanie każdego `keydown Space`. Dla nieinteraktywnego
fokusu dokumentu Chromium przewija stronę już na `keydown`, zanim LMB może
rozpocząć pan. Naprawa obejmuje wyłącznie rozstrzygnięcie celu `keydown` w
`RegionOverlay`.

Reguła ma rozpoznać w jednym miejscu trzy intencje celu:

1. cel edycyjny — zachowuje `Space` i nie uzbraja panu;
2. cel z własną aktywacją — zachowuje natywny `keydown`, ale utrzymuje kontrakt
   FIX2 pozwalający późniejszemu `Space` + LMB rozpocząć pan;
3. cel nieinteraktywny — uzbraja pan i, wyłącznie przy wskaźniku nad kanwą,
   anuluje `keydown` zanim przeglądarka przewinie dokument.

## Design Plan

### Elementy interfejsu i stosowane wytyczne

| Element | Decyzja | Moduły / ID UI/UX |
| --- | --- | --- |
| Powierzchnia `RegionOverlay` | Przy nieinteraktywnym celu i wskaźniku nad powierzchnią `keydown Space` jest konsumowany przed natywnym scrollem; późniejszy LMB używa istniejącego panu. Bez zmian wizualnych, warstw, geometrii i markerów pointerdown. | FE-08; UI & Visuals: `OVERLAY-06`, `COLOR-07`; Typography: `OPACITY-02` |
| Dokument / `body` | Nad kanwą `Space` oznacza gotowość do panu i nie przewija dokumentu. Poza kanwą zachowuje natywny scroll strony. `body` nie dostaje sztucznego `tabIndex`. | FE-08; UI & Visuals: `COLOR-07`; Typography: `OPACITY-02` |
| `Button` w toolbarze i `AnnotationPopover` | Natywna aktywacja `Space` bez panu oraz anulowanie `keyup` po realnym panie pozostają dokładnie zgodne z FIX2. | FE-08; UI & Visuals: `COLOR-07`; Typography: `OPACITY-02`; katalog komponentów `new-component.md`, sekcje 4–5 |
| `GroupedOptionList` | Lista klas zachowuje własną obsługę `Space` w zakresie `data-shortcut-scope`; nie jest traktowana jak nieinteraktywny dokument. | FE-08; UI & Visuals: `COLOR-07`; Typography: `OPACITY-02`; katalog komponentów `new-component.md`, sekcje 4–5 |
| `TextField`, natywne pola i `contenteditable` | Wpisywanie `Space` pozostaje lokalne niezależnie od położenia wskaźnika i nie uzbraja panu. | FE-08; UI & Visuals: `COLOR-07`; Typography: `OPACITY-02`; katalog komponentów `new-component.md`, sekcje 4–5 |

### Obowiązkowa checklista

- [x] **Layout/Siatka:** brak zmian układu, spacingu i tokenów `--size-*`.
- [x] **Typografia:** brak zmian `fontSize`, `lineHeight`, `fontWeight` i copy.
- [x] **Kolory:** brak nowych kolorów i zmian wizualnych stanów interakcji
  (`COLOR-07`).
- [x] **Obramowania:** brak zmian obrysów, szerokości i promieni.
- [x] **Cienie:** brak nowych warstw i cieni.
- [x] **Interakcje:** jedno rozstrzygnięcie celu `Space`; `body` nad kanwą nie
  scrolluje, `body` poza kanwą scrolluje, kontrolki zachowują FIX2, pola i lista
  klas zachowują własną obsługę (`OVERLAY-06`, `COLOR-07`, `OPACITY-02`).
- [x] **Komponenty:** zmiana pozostaje w istniejącym `RegionOverlay`; używane
  `Button`, `GroupedOptionList` i `TextField` nie zmieniają API ani wyglądu.

## Plan regresji

- Vitest `RegionOverlay`: `Space` na `body` nad kanwą anuluje `keydown` i
  pozwala przesunąć transformację; poza kanwą `keydown` oraz `keyup` pozostają
  natywne.
- Istniejące sondy FIX2: fokus przycisku bez panu, fokus „Usuń” z późniejszym
  panem, auto-repeat, dwa pany, blur i remount pozostają zielone.
- Istniejące testy `GroupedOptionList` i `TextField`: własna obsługa `Space`
  pozostaje niezależna od wskaźnika.
- Chromium bez sztucznego `tabIndex`: `activeElement === body`, `scrollY=0`,
  zoom 125%, wskaźnik nad kanwą; po `keydown` nadal `scrollY=0`, drag zmienia
  transformację i wykonuje zero mutacji. Osobna sonda poza kanwą potwierdza
  natywny scroll.
- Pełna bramka `scripts/check.ps1`: jeden nieprzerwany przebieg 9/9, zero SKIP.

