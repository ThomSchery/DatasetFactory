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
