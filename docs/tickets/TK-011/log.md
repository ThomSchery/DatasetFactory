# TK-011 — log implementacji

## Design Plan FIX1 (2026-09-23)

Zakres UI jest wyłącznie informacyjny: nie zmienia układu ani komponentów.

### Elementy interfejsu

- etykiety opcji PSM `6` i `11` w istniejącym `SelectField`: `6` opisuje ścisły
  jednolity blok bez sugerowania, że jest domyślnym wyborem dla każdego regionu
  wielowierszowego; `11` nazywa rzadki tekst i wskazuje zmierzoną przydatność dla
  oddzielnych wierszy HUD;
- komunikat błędu istniejącego `TextField` przy zmianie klasy: po odrzuceniu
  zapisu nazywa regiony, których jawny zakres nadal używa zmienianego znaku.

### Moduły i ID wytycznych UI/UX

- bez zmian layoutu, kolorów, obramowań, cieni i interakcji; oba miejsca używają
  istniejących `SelectField` / `TextField` oraz ich kontraktu `Field`;
- `GRID-10`, `SPACING-03/04/08`: zachowujemy bieżącą szerokość kontrolek i
  zarezerwowane miejsce na błąd;
- `TYPO-07`, `FONTSIZE-09/10`, `LHEIGHT-09/10`: treść pozostaje w istniejącej
  typografii kontrolek, a hierarchii nie budujemy nowym rozmiarem;
- `COLOR-07/08/09`, `BORDER-03/06`, `RADIUS-05`, `OPACITY-02`: stany błędu,
  fokusa i disabled pozostają własnością gotowych komponentów;
- tekst realizuje `impeccable clarify`: mówi, który wybór sprawdził się na danych
  operatora i co blokuje zapis, bez obietnicy, że jeden PSM pasuje do każdego
  obrazu.

### Checklista przed kodowaniem UI

- [x] Layout/Siatka: bez zmian; istniejący `SelectField` / `TextField`, `GRID-10`.
- [x] Typografia: bez nowych tokenów; istniejąca typografia pól, `TYPO-07`.
- [x] Kolory: bez zmian; błąd przez istniejący stan `Field`, `COLOR-08/09`.
- [x] Obramowania: bez zmian; istniejący `stroke-strong` i `radius-md`.
- [x] Cienie: brak zmian i nowych warstw.
- [x] Interakcje: istniejące focus/disabled/error; komunikat jest powiązany ARIA.
- [x] Komponenty: `SelectField` i `TextField` z katalogu `common/`; brak nowego
  komponentu.

## Design Plan (2026-09-22)

Zakres UI obejmuje istniejący ekran profilu oraz formularz tworzenia profilu. Nie zmieniamy prostokąta ani nie dodajemy usuwania istniejących regionów.

### Elementy interfejsu

- wspólna dla obu ścieżek grupa `RegionOcrConfigFields`:
  - `TextField` „Dozwolone znaki” z opisem, walidacją pustej wartości i komunikatem o znakach spoza klas profilu;
  - `SelectField` „Układ tekstu” z dopuszczalnymi PSM `3, 4, 6, 7, 8, 10, 11, 12, 13`;
  - jawna lista polskich opisów wszystkich dostępnych trybów, aby operator nie musiał znać numeracji Tesseracta;
- formularz dodawania regionu z FE-018: oba pola przed geometrią i akcjami zapisu;
- lista zapisanych regionów na ekranie szczegółów: nazwa, geometria, aktualny zakres/PSM i `Button` „Edytuj OCR”;
- formularz edycji wyłącznie ustawień OCR istniejącego regionu, z `InlineError`, stanem pending/disabled i akcjami „Anuluj” / „Zapisz ustawienia”;
- edytor regionów podczas tworzenia profilu: oba pola dla aktualnie zaznaczonego regionu;
- trwały `Notice`, że zmiana konfiguracji działa od kolejnego runu i nie przelicza istniejących obserwacji.

### Moduły i ID wytycznych UI/UX

- **Layout/Siatka:** `GRID-01/02` i `SPACING-01/03/04/07/08` — istniejące tokeny `--size-xs/sm/md`; pola grupowane bliżej siebie niż osobne regiony; miejsce na błędy pozostaje w `Field`.
- **Szerokość treści/pól:** `GRID-09/10` — opisy ograniczone przez `--measure-copy`; whitelist używa szerokości dopasowanej do krótkiego zestawu znaków, select pozostaje czytelny dla dłuższych etykiet.
- **Typografia:** `TYPO-02/07`, `FONTSIZE-02/09/10`, `LHEIGHT-09/10`, `LSPACE-02` — `--font-family-sans`, `--font-size-sm/md`, regular/semibold, standardowa wysokość linii; monospace tylko dla samego whitelist/PSM jako danych technicznych.
- **Kolory:** `COLOR-01..10`, szczególnie `COLOR-07/08/09` — wyłącznie istniejące tokeny strong/weak/brand/error; błąd nie jest komunikowany samym kolorem.
- **Obramowania:** `BORDER-02/03/05/06`, `BWIDTH-03/06/10/12/13`, `RADIUS-02/03/05` — kontrolki przez istniejące `TextField`/`SelectField`; grupy oddziela spacing, bez nowych dekoracyjnych obrysów.
- **Cienie:** `SHADOW-01..05` — brak nowych warstw/elevacji; formularz pozostaje częścią istniejącej powierzchni.
- **Interakcje:** `GRID-05`, `COLOR-07`, `OPACITY-01/02`, `BORDER-06` — istniejący `Button` i pola zapewniają focus-visible, hover, disabled, loading oraz hit area ≥32 px.
- **Komponenty:** używamy istniejących `Button`, `TextField`, `SelectField`, `Notice`, `InlineError`; nowy komponent domenowy trafia do `features/profiles`, nie do `common`, ponieważ koduje semantykę Tesseract/HUD.

### Checklista przed kodowaniem UI

- [x] Layout/Siatka: `--size-xs`, `--size-sm`, `--size-md`; `GRID-01/02`, `SPACING-01/03/04`.
- [x] Typografia: `--font-size-sm/md`, `--line-height-standard/tight`, `--font-weight-regular/semibold`; `TYPO-07`, `FONTSIZE-02/09/10`, `LHEIGHT-09/10`.
- [x] Kolory: wyłącznie `--color-text-strong-default`, `--color-text-weak-default`, istniejące tokeny brand/error; `COLOR-07/08/09`.
- [x] Obramowania: chrome istniejących pól (`stroke-strong`, `radius-md`), bez nowych obrysów strukturalnych; `BORDER-02/03/06`, `BWIDTH-03/12`, `RADIUS-05`.
- [x] Cienie: brak nowych; `SHADOW-01..05`.
- [x] Interakcje: focus/hover/disabled/loading przez komponenty wspólne; `COLOR-07`, `OPACITY-02`, `GRID-05`.
- [x] Komponenty: katalog `common/` sprawdzony; użycie `TextField`, `SelectField`, `Button`, `Notice`, `InlineError`.

## Decyzje implementacyjne

- Kolumny regionu będą nullable tylko dla rekordów sprzed TK-011. Fallback odtwarza dokładnie dotychczasowy whitelist profilu i domyślny PSM adaptera; pierwsza edycja materializuje konfigurację jawną.
- Jawny zakres nie rozszerza się po dodaniu klasy do profilu. To wartość konfiguracyjna regionu, nie zapytanie „wszystkie aktualne klasy”. Usunięcie klasy pozostaje poza zakresem v1, a każdy zapis konfiguracji ponownie waliduje podzbiór.
- Jedno provenance na run jest niewystarczające. Run i checkpoint utrwalą dodatkowy, autorytatywny per-region snapshot; istniejące pola run-level pozostają dla zgodności i opisują wspólną tożsamość adaptera / fallback legacy, nie zastępują snapshotu regionów.

## Implementacja i weryfikacja

### 2026-09-23 — migracja, walidacja i zapis konfiguracji regionu

- Migracja `0007` pozostawia oba pola OCR istniejących regionów jako `NULL`.
  Ten stan oznacza dokładnie dawny globalny whitelist profilu i domyślny PSM
  adaptera; nowe zapisy materializują oba pola naraz.
- Zapis i edycja odrzucają whitelist spoza znakowych klas profilu oraz PSM spoza
  `3, 4, 6, 7, 8, 10, 11, 12, 13` (w tym `0`).
- Edycja dotyka wyłącznie konfiguracji OCR i wersji profilu; geometria oraz
  istniejące próbki pozostają bez zmian.
- Weryfikacja: `test_profile_region_api.py` — 24 passed; dwa testy migracji
  (`initial_migration_up_down_up`, `region_ocr_config_migration`) — 2 passed.

### 2026-09-23 — wykonanie OCR i provenance per region

- Run utrwala przed OCR deterministyczny snapshot każdego regionu: zakres znaków,
  PSM oraz kompletne provenance z hashem konfiguracji. Ten sam dokument jest
  kopiowany do checkpointów i uwzględniany przy recovery.
- Worker dobiera snapshot po identyfikatorze regionu i przekazuje jego whitelist
  oraz PSM do Tesseracta. Obserwacja jest akceptowana tylko wtedy, gdy provenance
  kandydata odpowiada snapshotowi tego regionu.
- Jedno provenance na run nie wystarcza przy różnych ustawieniach regionów.
  Dotychczasowe pola run-level zostają dla kompatybilności i wspólnej tożsamości
  adaptera; autorytatywne ustawienia obserwacji znajdują się w snapshotach regionów.
- Legacy `NULL` używa dokładnie dawnego whitelist profilu i domyślnego PSM adaptera.
  Test uruchamia ten sam kadr raz z fallbackiem i raz z jawną równoważną
  konfiguracją, po czym porównuje znak, bbox, confidence, hash i PSM obserwacji.
- Weryfikacja: `test_tesseract_ocr.py` — 28 passed;
  `test_durable_workflow.py` — 21 passed; `ruff check` i `mypy` — PASS.

### 2026-09-23 — interfejs konfiguracji OCR regionu

- Wspólne pola domenowe pokazują whitelist oraz natywny select ze wszystkimi
  dopuszczonymi trybami `3, 4, 6, 7, 8, 10, 11, 12, 13` opisanymi po polsku.
  Tryb `0` nie jest oferowany, a opis wyjaśnia, że nie rozpoznaje znaków.
- Tworzenie profilu i dodawanie regionu wysyła oba jawne ustawienia. Walidacja
  klienta wskazuje konkretne znaki spoza klas profilu, ale backend pozostaje
  autorytatywną granicą zapisu.
- Lista istniejących regionów pokazuje efektywny zakres i układ; legacy `NULL`
  jest oznaczony jako konfiguracja odziedziczona. Edytor zmienia wyłącznie oba
  pola OCR przez wersjonowany endpoint, bez udostępniania geometrii.
- Trwały komunikat wyjaśnia, że nowe ustawienia obowiązują od kolejnego runu i
  nie przeliczają istniejących klatek, próbek ani obserwacji.
- Weryfikacja: frontend `typecheck` i `build` — PASS; pełny Vitest —
  43 pliki, 713 testów PASS. Testy ekranów obejmują oba pola przy tworzeniu,
  edycję istniejącego regionu, podzbiór klas i opisy trybów.

### 2026-09-23 — falsyfikowalność wymaganych kryteriów

Każdą próbę wykonano przez kopię pliku, celowe wyłączenie ochrony, pojedynczy
test, odtworzenie przez `Copy-Item` i porównanie SHA256.

- **Brak liter w regionie cyfrowym:** usunięcie filtra whitelist z parsera dało
  `['W', '0'] != ['0']` w
  `test_numeric_region_drops_letter_candidates_before_mapping`. Po odtworzeniu
  `tesseract.py` hash wyniósł ponownie
  `3EEC9E041513F19F53D48F472D2952C29A153B928CE17F514C1DC95B4138D7ED`, test PASS.
- **Zgodność po migracji:** zastąpienie legacy fallbacku PSM trybem `6` dało
  `page_segmentation_mode: 6 != 7` w
  `test_legacy_region_fallback_keeps_same_frame_ocr_result_after_migration`.
  Po odtworzeniu `manager.py` hash wyniósł ponownie
  `133B9D6D0ED3274563D485C16CB046925FE0E3DD52E896560DDDEB613B4D4FEA`, test PASS.
- **Brak przeliczania wstecz:** celowe usunięcie zapisanych obserwacji w
  transakcji edycji dało `observation_after is None` w
  `test_region_ocr_config_can_be_edited_without_touching_existing_observations`.
  Po odtworzeniu `profiles.py` hash wyniósł ponownie
  `2E24ECB4BA69C1386A5001F9EDB98C2DC8F5638A336EF8885EFC9207F150F1A7`, test PASS.

### 2026-09-23 — pełna bramka

- Jeden nieprzerwany przebieg poleceniem z absolutną ścieżką:
  `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\t.wisniewski\.traycer\worktrees\thomschery__datasetfactory\feat-tk-011-per-region-ocr-config\scripts\check.ps1"`.
- Wynik: **9/9 PASS, zero SKIP**. Backend: format, lint, mypy i 409 testów;
  frontend: typy, 713 testów i build; E2E: 24 testy; root safety: 2 testy,
  0 pominiętych.
- E2E nadpisało 33 historyczne PNG obecne w aktualnej wersji zestawu. Wszystkie
  odtworzono przez `Copy-Item` z głównego workspace; po odtworzeniu żaden zrzut
  nie pozostał zmieniony.

### 2026-09-23 — weryfikacja na prawdziwych danych operatora

- Źródło: 25 istniejących cropów na region z runu
  `b4a755c9-4e55-4142-bc09-50f7469e124b`. Produkcyjny adapter i przypięty
  Tesseract 5.5.3 pracowały na tymczasowej kopii 100 PNG; baza operatora i sam
  run pozostały tylko do odczytu.
- `score_right`, whitelist `0123456789`, PSM `7`: **43 obserwacje, zero liter**.
  Dwie dawne błędne obserwacje `M` i `W` znikają zamiast być mapowane na klasy.
- `health & armour`, whitelist `0123456789/`, wieloliniowy PSM `6`:
  **131 obserwacji**. Wynik jest jawnie niezerowy; zmiana trybu usuwa zmierzony
  objaw zera na tych cropach.
