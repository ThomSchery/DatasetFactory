# TK-011 — log implementacji

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
