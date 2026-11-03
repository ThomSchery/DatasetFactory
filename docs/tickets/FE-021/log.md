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
