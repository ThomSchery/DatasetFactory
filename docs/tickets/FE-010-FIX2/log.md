# FE-010-FIX2 — log implementacji

## Zakres i przyczyna

Fixup obejmuje wyłącznie cykl klawisza `Space` w `RegionOverlay`. FIX1
rozstrzygał gotowość do panu i anulowanie natywnego zachowania na podstawie
bieżącego położenia wskaźnika podczas `keydown`. To rozdzieliło dwie decyzje:
`Space` mógł rozpocząć pan po późniejszym wejściu na kanwę, mimo że jego
`keydown` nie został anulowany, albo mógł zostać anulowany nad kanwą bez
jakiegokolwiek panu.

Naprawa ma rozstrzygać anulowanie dopiero na `keyup`, na podstawie zapisanego
faktu rozpoczęcia gestu `Space` + LMB. Bez panu przeglądarka zachowuje pełną
natywną obsługę aktywnego przycisku. Nie zmieniamy `WeakSet<Event>` dla
outside-dismiss, geometrii, wysokości panelu ani obsługi kółka.

## Design Plan

### Elementy interfejsu i stosowane wytyczne

| Element | Decyzja | Moduły / ID UI/UX |
| --- | --- | --- |
| Powierzchnia `RegionOverlay` | `Space` nadal sygnalizuje gotowość do panu i z LMB rozpoczyna istniejący gest. Informacja, że bieżące naciśnięcie `Space` zostało użyte do panu, jest zapisywana przy rzeczywistym `pointerdown` gestu i konsumowana na odpowiadającym `keyup`. Bez zmian wizualnych, hit-testingu i mapowania współrzędnych. | UI & Visuals: `OVERLAY-06`, `COLOR-07`; Typography: `OPACITY-02` |
| `Button` „Usuń” w dokowanym panelu anotacji | Gdy `Space` posłużył do panu, `keyup` jest anulowany i nie może uruchomić destrukcyjnej natywnej aktywacji. Panel, anotacja i liczba żądań pozostają bez zmian. | UI & Visuals: `COLOR-07`; Typography: `OPACITY-02`; katalog komponentów `new-component.md`, sekcje 4–5 |
| `Button` „Dopasuj kanwę do widoku” („Resetuj zoom”) | Gdy nie wystąpił pan, `keydown` i `keyup Space` pozostają natywne nawet przy wskaźniku nad kanwą, więc przycisk resetuje zoom z klawiatury. | UI & Visuals: `COLOR-07`; Typography: `OPACITY-02`; katalog komponentów `new-component.md`, sekcje 4–5 |
| Pozostałe przyciski dokowanego panelu | Ten sam kontrakt natywnej aktywacji bez panu; bez zmian callbacków, copy, focus ringów i stanów disabled. | UI & Visuals: `COLOR-07`; Typography: `OPACITY-02`; katalog komponentów `new-component.md`, sekcje 4–5 |

### Obowiązkowa checklista

- [x] **Layout/Siatka:** brak zmian layoutu i spacingu; istniejące tokeny
  `--size-*` pozostają nietknięte.
- [x] **Typografia:** brak zmian `fontSize`, `lineHeight`, `fontWeight` i copy.
- [x] **Kolory:** brak nowych kolorów i zmian stanów wizualnych; istniejący
  kontrakt interakcji `COLOR-07` pozostaje bez zmian.
- [x] **Obramowania:** brak zmian obrysów, szerokości i promieni.
- [x] **Cienie:** brak nowych warstw i cieni.
- [x] **Interakcje:** `Space` bez panu pozostaje natywny; `Space` użyty do panu
  anuluje wyłącznie kończący go `keyup`. Niewidoczne warstwy nadal nie blokują
  wskaźnika (`OVERLAY-06`), a wygląd pressed/disabled nadal wynika z istniejących
  tokenów (`COLOR-07`, `OPACITY-02`).
- [x] **Komponenty:** zmiana pozostaje wewnątrz istniejącego `RegionOverlay` i
  reużywa istniejący `Button`; nie powstaje nowy komponent ani inline control.

## Plan regresji

- Vitest `RegionOverlay`: osobno natywne `Space` na reset zoomu bez panu oraz
  anulowanie `keyup` po `Space` + LMB; dodatkowo zabezpieczenie powtórzeń
  `keydown`, aby nie zgubiły faktu użycia klawisza do panu.
- Vitest ekranu anotacji: pełna kolejność z findingu z fokusem na „Usuń”,
  wejściem wskaźnika na kanwę po `keydown`, panem i zerem żądań `DELETE`;
  osobny przycisk panelu zachowuje natywną aktywację bez panu.
- Chromium: obie sondy recenzenta uruchomione osobno i raportowane z liczbą
  żądań mutujących; ponowna weryfikacja dziewięciu zachowań FE-009.
- Pełna bramka `scripts/check.ps1`: jeden nieprzerwany przebieg 9/9, zero SKIP.

