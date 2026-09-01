# FE-003 — log implementacji

## Decyzje ryzyka przed kodem

### D1 — wybór aktywnego profilu

Wybór mieszka w nullable `projects.active_profile_id`. Projekt pozostaje jedynym
kontenerem F15, więc stan nie trafia ani do ustawień procesu, ani do frontendu.
Migracja `0006` dodaje kolumnę, klucz obcy do `game_profiles.id` i backfilluje
każdy istniejący projekt profilem, który dotychczas wygrałby regułę
`created_at DESC, id DESC`. Dzięki temu istniejący profil `Quake Champions`
pozostaje aktywny po migracji, a utworzenie kolejnego profilu nie zmienia wyboru.
Nullable zachowuje zgodność dla projektu bez profili; `GET /profiles/current`
stosuje dotychczasowy fallback „najnowszy”, gdy pole pozostaje puste.

### D2 — przełączenie podczas pracy runu

Przełączenie jest blokowane kodem `active_run` tylko wtedy, gdy globalny
`workflow_slot` jest zajęty: run faktycznie działa albo trwa atomowa rezerwacja
jego wznowienia. To jest dokładna granica konkurencji z pipeline'em. Run
`paused`, `review_ready`, `failed` lub `cancelled` bez rezerwacji zachowuje własny
`profile_id`, więc wybór innego profilu nie zmienia jego klatek ani anotacji.
Lista runów pokazuje profil każdego runu, dlatego dwa konteksty nie są ukryte.

### D3 — zakres listy runów

`GET /runs` jest globalne dla jedynego projektu i stronicowane. Filtrowanie
aktywnym profilem ponownie ukryłoby starsze runy — dokładnie problem, który
naprawia ticket. Każdy wiersz niesie nazwę i identyfikator profilu, więc globalny
widok nie traci kontekstu. Filtry i porównywanie runów pozostają poza zakresem.

## Interpretacja F3

Domyślna ścieżka formularza wybiera materiał i moment w sekundach. Endpoint
ekstrakcji zwraca nieprzezroczysty `asset_id` oraz wymiary podglądu. Asset jest
publikowany jako plik tymczasowego podglądu i promowany do wiersza
`reference_assets` atomowo z utworzeniem profilu; niezapisany podgląd ma tę samą
semantykę procesu co obecny `POST /profiles/reference-preview`. Ręczna ścieżka
bezwzględna zostaje alternatywą. Nie dodajemy sprzątania osieroconych podglądów —
to otwarte pytanie artefaktu, nie kryterium FE-003.

## Design Plan (przed kodem UI)

Tryb: **Operate**. Kierunek: rozszerzenie istniejącego baseline'u
`Home — Impeccable`; bez nowej tożsamości, fontów, tokenów lub efektów.

### Elementy interfejsu

1. **Ekran profili `/profiles`:** panel kolekcji, wiersze profili, nazwa,
   rozdzielczość, data, liczniki regionów/klas, `StatusBadge` aktywnego profilu,
   `Button` wyboru, stany `Loading`/`Empty`/`FatalError`, panel szczegółów
   wybranego profilu z `DataList`, listą klas i podglądem regionów przez
   niezmieniony `RegionOverlay`, akcja `Button` „Utwórz nowy profil”.
2. **Formularz nowego profilu na tym samym ekranie:** `SelectField` materiału,
   `TextField` momentu, `Button` generowania podglądu, `DataList` wymiarów,
   `RegionEditor` otrzymujący URL assetu (bez zmian w samym komponencie),
   `Button` pokazujący alternatywną ścieżkę ręczną, istniejący `TextField`
   ścieżki, `CategoryEditor`, submit oraz `InlineError`.
3. **Ekran `/annotations`:** panel globalnej listy runów, stronicowane wiersze z
   `StatusBadge` statusu i eksportu, nazwą profilu, interwałem, datą,
   `DataList` liczników weryfikacji, `Progress`, `Button` wejścia do
   `/annotations/:runId`, `Loading`/`Empty`/`FatalError`, przyciski poprzedniej
   i następnej strony.
4. **Nawigacja i routing:** `NavItem` „Profil gry” prowadzi do `/profiles`,
   `NavItem` „Anotacje” do `/annotations`; deep-link
   `/annotations/:runId` oraz zgodność `/profiles/new` pozostają.

### Moduły i ID wytycznych

- [ ] **Layout/Siatka:** moduł „Siatka i Odstępy”; `GRID-01/02` — wyłącznie
  `--size-*`; `GRID-09` — copy do `--measure-copy`; `GRID-10` — krótki moment i
  pełna ścieżka; `GRID-11` — wiersze min. 48 px; `GRID-12` — siatki składają się
  do jednej kolumny; `SPACING-01/02/03/04/06/11/12/13` — bliskość, grupowanie,
  formularze, miejsce na błędy, oddech obrazu i kontrolki.
- [ ] **Typografia:** moduł „Typografia”; `TYPO-02/07/08` — istniejący sans,
  hierarchia wagą i kolorem; `FONTSIZE-02/03/08/09/10` — istniejące
  `--font-size-xs/sm/md/lg`; `LHEIGHT-09/10/11` — istniejące tokeny; `LSPACE-02`
  i `LSPACE-07/09` dla krótkich uppercase badge/eyebrow; `TYPO-15/16/17` oraz
  `PARASPACE-01/02/05/06`; `CASING-01/02` — polski sentence case.
- [ ] **Kolory:** moduł „Stylizacja Elementów / Kolor”; `COLOR-01/02/05/06/08`
  — istniejąca ciemna paleta i kontrast; `COLOR-07` — stany interakcji;
  `COLOR-09/10` — semantyczne statusy i tokeny bez nowych wartości.
- [ ] **Obramowania:** moduły „Border”, „Border Width”, „Border Radius”;
  `BORDER-02/03/05/06/07`, `BWIDTH-02/03/06/09/10/11/12/13`,
  `RADIUS-02/03/04/05`. Struktura przede wszystkim odstępem; weak dla wierszy i
  ram obrazu, strong/focus dla kontrolek, `--radius-md/lg` zgodnie z katalogiem.
- [ ] **Cienie:** moduł „Shadows”; `SHADOW-01/02/03/05`. Nie dokładamy cieni do
  zagnieżdżonych wierszy; na ciemnym baseline głębię niosą powierzchnie.
- [ ] **Interakcje:** `COLOR-07`, `BORDER-06`, `BWIDTH-09..13`, `OPACITY-01/02`,
  `TYPO-18/19/20`, `GRID-03/05`. Akcje tylko przez `Button`, nawigacja przez
  `NavItem`; aktywny profil ma badge i semantyczny stan, nie sam kolor; busy
  blokuje kontrolki bez optimistic update.
- [ ] **Komponenty:** używane istniejące `Button`, `UiStates`, `NavItem`,
  `StatusBadge`, `Panel`, `Notice`, `TextField`, `SelectField`, `DataList`,
  `RegionOverlay`. Nie powstaje nowy komponent wspólny, więc katalog
  `new-component.md` nie wymaga aktualizacji. `RegionOverlay`, `FrameEditor`
  i `geometry.ts` nie będą modyfikowane.

## Plan commitów

1. **F1:** ticket + log, migracja aktywnego profilu, listowanie/wybór API,
   ekran kolekcji profili i testy.
2. **F2:** stronicowane globalne `GET /runs`, ekran listy i wejście do anotacji,
   nawigacja oraz testy.
3. **F3:** ekstrakcja klatki z materiału, podgląd i domyślna ścieżka formularza,
   zgodność wymiarów i testy.
