# FE-012 — usunięcie formularza geometrii z panelu anotacji

## Plan i decyzje przed implementacją

### Cel i granice

Jedynym celem panelu po FE-012 jest wybór klasy, zapis klasy oraz usunięcie albo
porzucenie anotacji. Geometrię operator ustawia wyłącznie na `RegionOverlay`:
przeciąganiem bboxa, uchwytami narożników i strzałkami (`1 px`, z `Shift`
`10 px`), a oczekujący preview zatwierdza `Enter` spoza panelu.

Zakres nie obejmuje backendu, trybu ręki, zoomu ani mechaniki kanwy z FE-011.
Nie powstaje nowa kontrolka ani nowa treść panelu.

### Inwentarz UI

| Element | Decyzja FE-012 | Komponent / mechanizm |
|---|---|---|
| Nagłówek „Anotacja” / „Nowa anotacja · box” | zostaje | semantyczny `header` |
| Badge źródła i confidence | zostają | `StatusBadge` |
| Filtr i lista klas | zostają razem z `data-shortcut-scope` | `GroupedOptionList` |
| „Usuń” / „Porzuć box” | zostaje | `Button` |
| „Zapisz klasę” + wskazówka `Enter` | zostaje | `Button` |
| Badge i opis „Niezapisane” | zostaje dla preview | `StatusBadge` + tekst |
| Nagłówek `x · y · w · h` | usunąć | `details/summary` |
| Pola `x`, `y`, `width`, `height` | usunąć | cztery `TextField` |
| „Zapisz geometrię” | usunąć | `Button` |
| „Przerysuj bbox” / „Anuluj przerysowanie” | usunąć | `Button` + `redrawMode` |
| Bbox, uchwyty, drag, nudge i `Enter` | zostają jako jedyne sterowanie geometrią | `RegionOverlay` + `FrameEditor` |
| Notice o niezapisanym przesunięciu i blokada akceptacji | zostają | `Notice` + guard akcji |

Katalog wspólnych komponentów sprawdzony: używane pozostają `Button`,
`GroupedOptionList`, `StatusBadge`, `Notice` i `RegionOverlay`; `TextField` traci
tylko tego konsumenta. Nie ma podstaw do tworzenia nowego komponentu.

### Design Plan — moduły i ID wytycznych

- [x] Layout/siatka: moduł **Siatka i Odstępy**, `GRID-00/01/02/05/08/09/10`
  i `SPACING-01/02/03/04/07/08/13`. Panel zachowuje tokeny `--size-xs` i
  `--size-sm`; usunięcie sekcji usuwa jeden krok siatki, dzielnik i kontrolki,
  bez dodawania arbitralnych wymiarów.
- [x] Typografia: moduł **Typografia**, `TYPO-01/02/06/07/08`,
  `FONTSIZE-02/06/08/09`, `LHEIGHT-09/10/11/12`, `LSPACE-02/09` oraz
  `CASING-01/02`. Pozostaje istniejąca hierarchia nagłówka, mikrokopii i `kbd`;
  znika monospace'owy odczyt współrzędnych.
- [x] Kolory: moduł **Stylizacja elementów / Kolor**, `COLOR-01/07/08/09/10`.
  Bez nowych kolorów; warning „Niezapisane” nadal ma tekst i opis, więc znaczenie
  nie zależy wyłącznie od koloru.
- [x] Obramowania: moduł **Stylizacja elementów / Obramowanie i szerokość**,
  `BORDER-01/02/03/05/06`, `BWIDTH-01/02/03/06/09/10/11/12/13/14`.
  Usuwamy osierocony strukturalny `border-top` sekcji geometrii; fokus listy i
  przycisków pozostaje bez zmian.
- [x] Promienie: moduł **Stylizacja elementów / Promień**, `RADIUS-01/02/03/05`.
  Panel nadal używa `--radius-md`; nie wprowadzamy nowego zagnieżdżenia.
- [x] Cienie i warstwy: moduł **Stylizacja elementów / Nakładki i Cienie**,
  `OVERLAY-06`, `SHADOW-01/03/05`. Brak nowej warstwy lub cienia; interakcje
  overlayu pozostają widoczne i dostępne.
- [x] Interakcje: `GRID-05`, `COLOR-07`, `BORDER-06`, `OPACITY-01/02` oraz
  kontrakt `data-shortcut-scope`. Stany hover/active/disabled/focus istniejących
  wspólnych kontrolek nie zmieniają się.
- [x] Komponenty: katalog `frontend/src/AGENTS.md` / `new-component.md`
  sprawdzony; nowe komponenty wspólne nie są potrzebne.

### Decyzje techniczne

1. `FormState` zachowa wyłącznie baseline i bieżący wybór klasy. Stan draftu
   geometrii, jego synchronizacja oraz błędy formularza znikną.
2. `redrawMode` ma jedyne wejście w przycisku „Przerysuj bbox”; po usunięciu
   przycisku usunięte zostaną też typ, stan, warunki i gałąź `handleDraw`.
3. Walidacja przed `PATCH` nie zniknie. `FrameEditor` przejdzie na kanoniczne
   `fitsInSource`; helper zostanie uzupełniony o wymóg czterech liczb
   całkowitych, aby zachować cały kontrakt dawnego `parseGeometryDraft`.
   `geometryForm.ts` zostanie usunięty dopiero po potwierdzeniu braku konsumentów.
4. CSS usunie wyłącznie selektory należące do sekcji geometrii. Układ panelu,
   marker preview i dwukolumnowe osadzenie obok overlayu pozostają bez zmian.

### Plan dowodów regresyjnych

| Niezmiennik | Dowód po FE-012 |
|---|---|
| 1. Overlay = body żądania | nudge `100 → 103`; pełne `aria-label` bboxa na overlayu i dokładnie taki sam `bbox` w jednym `PATCH` po `Enter` |
| 2. Batching i bieżący CAS | trzy strzałki: zero `PATCH`; `Enter`: jeden `PATCH`, `expected_version` z bieżącej anotacji, także po refetchu |
| 3. Preview nie ginie | testy wyboru/zapisu klasy, błędu `PATCH`, refetchu i blokady akceptacji nadal czytają overlay oraz oba znaczniki „Niezapisane” |
| 4. Baseline gestu scoped | istniejące testy FE-009-FIX2/FIX3 zmiany anotacji/epoki nadal anulują stary gest bez wskrzeszenia preview |
| 5. Guard fokusu | strzałka w polu filtra klasy oraz na elemencie `data-shortcut-scope` nie zmienia `aria-label` bboxa i nie wysyła `PATCH` |
| 6. FE-009 + `Space` | pełny zestaw testów jednostkowych/integracyjnych oraz sondy FE-010 FIX2/FIX3/FIX4 pozostają w bramce |

Test komponentu dodatkowo sprawdzi brak odczytu `x/y/w/h`, czterech pól,
„Zapisz geometrię” i „Przerysuj bbox” zarówno dla anotacji zapisanej, jak i
świeżego draftu.

### Weryfikacja końcowa

- testy celowane komponentu, `FrameEditor`, geometrii i E2E;
- Playwright repozytoryjny jako zaakceptowany zamiennik in-app Browsera:
  screenshot panelu z niezapisanym preview oraz pomiar wysokości panelu i kanwy;
- jedna nieprzerwana bramka `scripts/check.ps1`, 9/9 bez SKIP;
- trzy etapy commitów: `docs(fe-012)`, `refactor(fe-012)`, `test(fe-012)`, a po
  wynikach końcowe uzupełnienie `docs(fe-012)`; bez push i merge.
