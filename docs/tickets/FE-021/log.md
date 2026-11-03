# FE-021 — Design Plan (2026-11-03)

Źródło nadrzędne: obejrzane eksporty Figma profile/run/review/upload desktop i mobile oraz snapshot zmiennych. Puste ramki nie usuwają funkcji. Kontrolki: top navigation Upload/Profile/Run i menu wszystkich destynacji; pola i selektory, import i empty state obrazu, RegionOverlay, grupy klas, szkic accept/reject, zapisz/Save as i modal, dirty/conflict notices; run setup i postęp; review: filtry, paginacja, lista anotacji, Repeat Previous, zoom/pan/reset i menu kontekstowe; loading/error/disabled we wszystkich ścieżkach.

- [x] Layout: GRID-01..14, SPACING-01..13; tokeny size-xs/sm/md/lg; desktop panel + elastyczny obraz, mobile kolejność obrazu i kontrolek, 48px dla dotyku; zachować scrollbar-gutter.
- [x] Typografia: TYPO-01..21, WEIGHT (reguły TYPO-06..11), FONTSIZE-01..11, LHEIGHT-01..14, LSPACE-01..09; lokalny Inter, 400/600, tokeny font-size/line-height/letter-spacing. Etykiety 8/10px Figmy zwiększyć do czytelnego minimum 12px i zachować semantykę.
- [x] Kolory: COLOR-01..10; semantyczne tokeny powierzchni #23262C/#2B303A i tekstu #F6F7F8; stan/kontrast nie wyłącznie kolorem.
- [x] Obramowania: BORDER-01..09 (bez nieistniejącego 04), BWIDTH-01..14, RADIUS-01..05; stroke-weak struktura, strong kontrolki, 1px, radius-sm/md, wyraźny focus.
- [x] Nakładki i cienie: OVERLAY-01..07, SHADOW-01..05; obraz chroniony obrysem, modal z scrim, przestrzenne cienie tylko gdy potrzebne.
- [x] Interakcje: COLOR-07, OPACITY-01..02; hover/focus/active/disabled/pending i komunikaty błędów, klawiatura i dotyk.
- [x] Komponenty: użyć Button, NavItem, Panel, Notice, TextField, SelectField, GroupedOptionList, CollapsibleGroup, UiStates i RegionOverlay; nowe prymitywy tylko po aktualizacji katalogu.

Odstępstwo: Figma jawnie wymaga panelowych obrysów i zwartej siatki, zastępuje poprzednią pomarańczową markę i minimum 1280px. Obrazów gry ani liczników z Figmy nie wprowadzać jako danych. Projektowany zapis historii wymaga uzgodnienia z koordynatorem.

## Decyzja koordynatora — trwałość (2026-11-03)

Save profile pozostaje dostępny dla profilu z ukończoną historią: snapshot ID i geometrii regionów per run, migracja backfill z dostępnych aktualnych definicji, użycie snapshotu w processing record i wymiarach próbek; soft retirement zachowuje ID i dane OCR, aktywne nazwy mogą być ponownie użyte. Blokada dotyczy queued/running/paused/failed/cancelled. Kategorie używane przez anotacje pozostają; Custom dopisywany, whitelist i PSM per region. Race start/save, rollback i stary/nowy run wymagają testów. Izolowane porty E2E z zachowaniem domyślnych wartości zostały zatwierdzone.
