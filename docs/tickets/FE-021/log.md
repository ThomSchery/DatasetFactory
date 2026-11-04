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

## Wykonanie backendu (2026-11-03)

- `RegionOcrSnapshot` przenosi geometrię (`bbox`) obok whitelisty i PSM; `pipeline_runs.ocr_region_config_json` oraz `stage_checkpoints.ocr_region_config_json` są odtąd jedynym źródłem geometrii dla runu. `FrameRepository._processing_record` czyta snapshot runu, w tym `width`/`height` w `SampleRecord`; żywe `hud_regions` służą tylko runom bez snapshotu (brak regionów).
- Migracja `0008_region_snapshot_geometry`: backfill geometrii do runów i checkpointów z aktualnych definicji (walidacja całości przed pierwszym UPDATE — SQLite nie daje transakcyjnego DDL), kolumna `hud_regions.retired_at`, zamiana `uq_hud_regions_profile_name` na częściowy indeks `uq_hud_regions_profile_name_active ... WHERE retired_at IS NULL`. Downgrade zdejmuje geometrię i przywraca stary unique, a odmawia, gdy istnieje region retired (nie ma go jak reprezentować przed 0008).
- `PUT /api/v1/profiles/{id}/definition` zapisuje cały draft atomowo: `BEGIN IMMEDIATE`, `expected_version`, blokada runów queued/running/paused/failed/cancelled, walidacja przez `DatasetDefinitionEngine.validate_profile` (granice obrazu, unikalność nazw, whitelist tylko z klas draftu). Dopasowanie po ID: istniejące ID aktualizuje wiersz, brak ID wstawia, pominięty aktywny region jest retired. Zmiany nazw idą dwufazowo przez nazwę techniczną, więc swap nazw w jednym zapisie nie łamie indeksu.
- Kategorie: usunięcie klasy używanej przez anotacje zwraca 409 `category_in_use` z listą ID/nazw (droga dalej to Save as); nieużywana jest usuwana, ordinal nigdy nie jest odtwarzany ani przesuwany. Nowa Custom jest dopisywana z `kind: game`.
- Save as: `POST /api/v1/profiles` z `reference_asset_id` wskazującym trwały asset kopiuje plik referencyjny pod nowym ID — nowy profil nie dziedziczy cudzego wiersza `reference_assets`.
- Poprawka spójności: `ProfileRepository.create` zwraca odczytany agregat, nie echo draftu, więc kolejność regionów z POST jest tą samą co z każdego GET.
- Testy: `backend/tests/test_profile_definition_save_api.py` (22 przypadki: resize i stary run przed/po, nowy run z nową definicją, retire + ponowne użycie nazwy, blokada per status, run wystartowany między load a save, konflikt wersji, rollback, swap nazw, duplikaty, nieznane ID, `category_in_use` + Save as, ordinal, run bez snapshotu), `test_migrations.py` (backfill, odmowa przy brakującym regionie, downgrade, odmowa downgrade przy retired), `test_ocr_region_snapshots.py` (geometria wymagana i walidowana).
- Bramka backendu lokalnie: ruff format, ruff check, mypy, pytest 446/446 przed dołożeniem testów migracji; po nich pytest celowanych modułów 98/98.

## Wykonanie UI — etap 1: tokeny, font, powłoka (2026-11-03)

- `tokens.css` przepisane na paletę z `designs/figma-2026-11-03/token-values.json`. Kolory zapisane jako `hsl()` (parser testu kontrastu nie czyta hex), hex z Figmy w komentarzu przy każdym tokenie. Dokument jest monochromatyczny — nie ma barwy marki, więc akcentem fokusu/zaznaczenia/regionu jest `border/focus` = `text/primary` #F6F7F8. Nazwy `*-impeccable` zostają, bo `new-component.md` jest chroniony i je wymienia; zmieniły się tylko wartości.
- Odstępstwo świadome: Figma `border/strong` #626C80 ma 2.87:1 na stronie i 2.0:1 na panelu, czyli poniżej progu 3:1 dla obrysu kontrolki ustalonego w 0f1cf87. `--color-stroke-control-default` używa kolejnej wartości z tej samej rodziny, `icon/placeholder` #959EB0 (5.63/4.91/3.93).
- Odstępstwo świadome: etykiety 8 i 10 px z dokumentu podniesione do 12 px (`--font-size-xs`). Kroki 4/6/12 px z Figmy sprowadzone do siatki 8-punktowej (GRID-01); doszedł tylko półkrok `--size-xxs: 4px`.
- Inter offline: `@fontsource-variable/inter` 5.2.8 (OFL-1.1), własne `@font-face` w `src/styles/fonts.css` wskazujące wyłącznie dwa podzbiory łacińskie (48 + 85 kB po zbudowaniu). `--font-family-ui` wskazuje teraz na ten sam stos, bo dokument nie używa drugiego kroju.
- Powłoka: stała szyna 280 px zastąpiona paskiem (marka + nazwa ekranu + menu) i przełącznikiem Upload / Profil / Run. Wszystkie dotychczasowe destynacje żyją w menu `AppMenu` — Escape, klik poza, powrót fokusu, `aria-expanded`, lista w DOM z `hidden`. `WidthGuard` i `viewport.ts` usunięte: FE-07 blokował poniżej 1280 px, dokument użytkownika zaczyna się od 360 px.
- Nowe komponenty wspólne: `Icon` (dekoracyjne glify inline, `aria-hidden`) i `AppMenu`. `NavItem` dostał wariant `segment` oraz slot `icon` — zapisane tutaj, bo `new-component.md` jest plikiem chronionym i jego sekcja 5 nie może zostać uzupełniona przez wykonawcę.
- Rozdział Upload/Run zgodnie z makietami: `MaterialsScreen` kończy się na liście materiałów, nowa trasa `/run` (`RunSetupScreen`) niesie wąski panel kontrolek i duży obraz profilu po prawej. Ostrzeżenie OCR jest na obu ekranach. Stare adresy działają bez zmian.
- Bramka etapu lokalnie: `tsc --noEmit`, `vitest run` 734/734, `vite build`.

## Kontynuacja — testy workspace (2026-11-04)

- Naprawiono fixture `category_in_use` oraz dodano shim metod dialogu dla jsdom; rzeczywista modalność i fokus nadal wymagają sprawdzenia w przeglądarce.
- Dodano blokowanie nawigacji i ostrzeżenie `beforeunload` dla draftu/szkicu i aktywnych mutacji; test obejmuje powrót i odrzucenie zmian przy nawigacji.
- Typecheck PASS; testy punktowe 33/33; pełny Vitest 721/721. Nie jest to pełna bramka 9/9.
- Otwarte: starsze regiony z nullable OCR są ładowane jako pusty whitelist / domyślny PSM, lecz nowy endpoint save wymaga obu wartości niepustych. Trzeba zachować semantykę tych ustawień przy nadpisaniu i Save as oraz dodać regresję. Trzeba także odtworzyć pokrycie usuniętych testów, zbadać późne mutacje, sprawdzić dialog w prawdziwej przeglądarce i dokończyć review/responsywność/QA.

## Kontynuacja — OCR, draft i responsywność (2026-11-04)

- `null/null` OCR pozostaje dziedziczone przez zapis i kopię; jawna zmiana kontrolki tworzy pełną konfigurację. Odrzucane są puste lub częściowe konfiguracje. Backend: 27 testów modułu, w tym stary i nowy run; mypy i ruff PASS. Commit `300e543`.
- Przywrócono edycję nazw klas OCR i Custom z ostrzeżeniem o zmianie grupy; nazwy regionów blokujących zmianę są widoczne. Testy obejmują wersję, konflikty, nieudany obraz, kopiowanie i przełączanie kontekstu.
- Chromium: dialog Save as, zamknięcie Escape, powrót i pułapka fokusu; rysowanie profilu 360/768/1440; pomiary review 360–1920. Obejrzano porównanie z PNG: naprawiono rozciągniętą ikonę menu i nachodzący toolbar; na telefonie kontrolki zoomu przeniesiono pod obraz. Makieta review nadal wymaga dalszej oceny względem Figmy i zachowania całego edytora.
- Próba pełnej bramki została celowo przerwana podczas pytest po odkryciu brakującej edycji nazw klas OCR; wynik nie jest PASS i wymaga ponownego uruchomienia po zakończeniu zmian.

## Kontynuacja — pełna ścieżka (2026-11-04)

- Chromium ujawnił błąd Strict Mode: klucz nowego regionu był generowany wewnątrz updatera stanu, przez co wybór OCR trafiał w inny klucz. Generowanie i wybór są teraz jedną spójną akcją; asercję wyboru dodano do testu workspace.
- Run Setup wybiera dowolny zapisany profil i pokazuje jego obraz. Przed odświeżeniem dashboardu po utworzeniu runu anulowany jest starszy odczyt w locie; rzeczywisty E2E wykrył wyścig w którym stary odczyt zasłaniał nowy run.
- Pionowy test Chromium przeszedł: utworzenie profilu, import, run, restart backendu, wznowienie, korekta anotacji i eksport. Scenariusz błędów również przeszedł w przebiegu wspólnym; trzy historyczne testy wizualne FE-016/018/019 przeszły po przeniesieniu asercji do nowego flow. Historyczne PNG przywrócono byte-for-byte. Typecheck i Vitest 731/731 PASS.
- Druga próba bramki 9/9 została przerwana przed ukończeniem, ponieważ testy E2E nadal zawierały usunięty flow. Konieczne jest nowe pełne uruchomienie po zmianach.

## Domknięcie — E2E, review vs Figma, bramka (2026-11-04)

Bramka na `9b2b553`: 8 bramek PASS, E2E 27/29 FAIL, root safety SKIP. Dwie porażki, obie po stronie testów, nie regresje dostępności:

- `visual-qa.spec.ts` „pięć tras…”: Tab nie dochodził do `getByLabel("Nazwa profilu")`, bo tego pola nie ma — nowy profil zaczyna się od zrzutu, a nazwę dostaje w dialogu Save as. Checkpoint przeniesiony na pierwsze własne pole trasy, „Ścieżka zrzutu ekranu”. Po tej zmianie ten sam test odsłonił drugi nieistniejący cel: stany loading/empty celowały w link „Dashboard” z dawnej szyny; teraz checkpointem jest wyzwalacz menu „Wszystkie sekcje”, które trzyma ten link. Asercje osiągalności z klawiatury, widocznego ringu i screenshotu z fokusem bez zmian.
- `fe017-layout-stability.spec.ts`: boczna kolumna Figmy sama ma ok. 860 px, więc przy 1280×1000, 1440×1000 i 1920×1080 dokument przewijał się już przed „Niezapisane” (scrollHeight 1124 > 1000) i trigger nigdy nie przełączał stanu. Klasa błędu nadal jest możliwa (dokument się przewija, plakietka dokłada ok. 267 px), więc scenariusz przywrócono techniką FE-019: dla każdej szerokości viewport jest dopasowany do dokumentu z otwartą anotacją, a plakietka musi wywołać overflow — teraz wymagane na każdej szerokości, nie „na co najmniej jednej”. Kontrola mutacyjna: z `scrollbar-gutter: auto` test pada (1223 → 1208 px przy 1280). Pierwsza pełna bramka po zmianie ujawniła wyścig (odczyt wysokości przed reflow po resize przy 1440); odczyt czeka teraz na dwie klatki i wymaga dwóch zgodnych pomiarów, 8/8 powtórzeń PASS.

Ocena review względem `review.png` (768) i `review-mobile.png` (360):

- Defekt: przy 360 px dwie strzałki 48 px i licznik zostawiały selektorowi klatki ok. 66 px — pokazywał samą strzałkę. Poniżej 700 px nawigacja to strzałka / selektor / strzałka w jednym wierszu (jak w Figmie mobile), licznik pod spodem; kolejność DOM i Tab bez zmian. Selektor ma teraz ok. 155 px.
- Defekt: przy 768 px pływające kontrolki zoomu zakrywały ok. 3/4 górnego wiersza HUD. Poniżej 992 px (granica `lg`, jak w Profile/Run) idą pod obraz; od 992 px zostają na obrazie zgodnie z FE-015.
- Defekt (widoczny na `profile-1440.png`): `Icon` ma `display: block`, więc w inline `.df-button__content` łamał linię i stawiał ikonę nad etykietą (Nowy profil, Save profile, Save as, Wczytaj zrzut). Treść z ikoną jest teraz wierszem `inline-flex`; nadpisania per ekran nienaruszone.
- E2E `fe021-dialog.spec.ts` sprawdza dodatkowo: minimalną szerokość selektora klatki na 7 szerokościach, brak nakładania zoomu na obraz poniżej 992 px i ikonę w linii z etykietą na 360/768/1440. Obie nowe asercje ikon/zoomu sprawdzone mutacyjnie.
- Świadome odstępstwa od makiety (bez zmian): decyzje Zaakceptuj/Odrzuć i filtry zostają w pasku nad obrazem zamiast w panelu Annotations — asercje geometrii FE-010..FE-019 (pasek przed kanwą, kanwa kończy się z paskiem, panel po lewej) chronią ten układ, a wymaganie 10 ticketu każe zachować pełny edytor. Pasek FE-021 Upload/Profil/Run jest też na review, bo powłoka jest wspólna. Etykieta „Klatka NN” w rogu kanwy pochodzi z wcześniejszych ticketów i została.

Bramka końcowa na `b41113b` (porty 5193/8033/8034, `PYTEST_ADDOPTS=--basetemp=D:/tmp/fe021-gate-pytest`): **9/9 PASS, 0 SKIP** — ruff format, ruff check, mypy, pytest 455/455, tsc, Vitest 733/733, vite build, Playwright 29/29, E2E root safety 2/2 (skipped 0). Commity etapu: `d1eeb5f` (E2E na nową powłokę i FE-017), `f0b7c92` (selektor klatki i zoom), `b746eb2` (stabilne dopasowanie FE-017), `b41113b` (ikona w przycisku). Po bramce 44 historyczne PNG FE-001…FE-019 przywrócone z HEAD (`git checkout`, byte-for-byte); zrzuty FE-021 z tej bramki zacommitowane razem z tym wpisem. Commit z logiem zmienia wyłącznie `docs/tickets/FE-021/`.

## FIX1 — Design Plan (2026-11-04)

Elementy: przyciski Save profile i Save as oraz widoczny powód ich blokady przy szkicu; przycisk trybu rysowania na panelu obrazu, jego stan aria-pressed i Escape; istniejące RegionOverlay, panel szkicu accept/reject oraz potwierdzenie odrzucenia przy ponownym wyborze profilu.

- [x] Layout i odstępy: GRID-01..14, SPACING-01..13; istniejący układ panelu i tokeny --size-xs/sm/md.
- [x] Typografia: TYPO-01..21, FONTSIZE-01..11, LHEIGHT-01..14, LSPACE-01..09; istniejące semantyczne style i tokeny tekstu.
- [x] Kolory: COLOR-01..10; istniejące semantyczne kolory, stan trybu także przez aria-pressed.
- [x] Obramowania: BORDER-01..03/05..09, BWIDTH-01..14, RADIUS-01..05; istniejący Button.
- [x] Cienie i nakładki: SHADOW-01..05, OVERLAY-01..07; istniejące Panel i RegionOverlay.
- [x] Interakcje: COLOR-07, OPACITY-01..02, fokus klawiatury, Escape, disabled z widocznym powodem.
- [x] Komponenty: Button, Notice, Panel, RegionOverlay i istniejący Dialog; bez nowych prymitywów.

### FIX1 — wykonanie

- `64173d2`: dopisanie kategorii atomowo podbija wersję profilu; test API potwierdził czerwony 200 przed zmianą i konflikt 409 po zmianie. Custom w workspace pozostaje lokalny do whole-definition save; edytor anotacji odświeża profil po dodaniu kategorii.
- `3144ff2`: spójny odczyt kontekstu i kontrola wersji pod `BEGIN IMMEDIATE` przed INSERT; po zmianie definicji ponowny odczyt i ponowne przygotowanie OCR poza blokadą. Test deterministycznie zapisuje profil po odczycie; przed poprawką run miał width 16 i whitelistę 0, po poprawce width 20 i whitelistę 1.
- `283dd0c`: zapis i kopia zablokowane z widocznym powodem przy szkicu; odrzucenie przy wyborze tego samego profilu przywraca baseline i usuwa szkic. Obie regresje odtworzone przed poprawką.
- `59a0793`: przełącznik Draw region z aria-pressed i Escape; Chromium przeciąga myszą wewnątrz istniejącego regionu na całą klatkę. Test był czerwony przed zmianą i zielony po zmianie.
- Bramka końcowa: porty 5193/8033/8034, basetemp `D:/tmp/fe021-gate-pytest`; wynik w raporcie wykonania.
