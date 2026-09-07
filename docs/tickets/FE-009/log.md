# FE-009 — log implementacji

## Design Plan przed kodem

### Ocena stanu wyjściowego i teza przestrzenna

- Tryb powierzchni: **Operate**. Główna ścieżka zadania to wybór anotacji w
  inspektorze lub na obrazie → kontrola bboxa na obrazie → korekta klasy albo
  geometrii w formularzu. Obraz i jego etykiety są elementem prowadzącym;
  formularz edycji jest podporządkowanym narzędziem.
- Pływający `AnnotationPopover` należy do pozycjonowanego pudełka
  `RegionOverlay`, więc może zakryć sąsiednie boxy i HUD. Zostanie zwykłym
  rodzeństwem overlaya w `df-review-workspace__preview`, bez pustego slotu przed
  wyborem. Kolejność DOM i wzrokowa będzie zgodna: metadane/notice → obraz →
  formularz aktywnej anotacji.
- Panel zajmie pełną szerokość kolumny podglądu i będzie rósł wyłącznie w dół.
  Odstęp po obrazie niesie istniejący rytm `--size-md`; panel nie będzie miał
  absolutnego pozycjonowania ani cienia warstwy pływającej.
- Nudge nie dodaje nowej kontrolki. Strzałki działają jako precyzyjna korekta
  zaznaczonego bboxa w pikselach źródłowych, Shift zmienia krok na 10 px, a
  `Enter` zapisuje wyłącznie aktywny preview. Pola formularza i lista klas
  zachowują własną obsługę klawiatury.
- Adaptacja pozostaje desktop-first zgodnie z FE-07 (minimum 1280 px). Panel
  korzysta z szerokości kontenera i naturalnego reflow istniejącego formularza;
  zoom/pan i zmiany mapowania source↔display należą do FE-010 i nie wchodzą do
  tej pracy.

### Elementy interfejsu objęte zmianą

- `RegionOverlay`: obraz, SVG bboxów, widoczne etykiety i gesty draw/move/resize;
  znika wyłącznie slot `floatingLayer`.
- `AnnotationPopover`: nagłówek, badge źródła/confidence, `GroupedOptionList`,
  akcje klasy/usunięcia, rozwijane pola `x/y/width/height`, walidacja oraz akcje
  geometrii; całość dokowana pod obrazem, pełna szerokość kolumny.
- Kolumna `df-review-workspace__preview`: kolejność `DataList`/`Notice`/błędy →
  `RegionOverlay` → warunkowy panel anotacji, bez rezerwowania pustego miejsca.
- Zaznaczony bbox i draft bbox: strzałki 1 px / Shift+strzałki 10 px, clamp na
  krawędziach, preview bez requestu i commit `Enter` tylko dla zapisanej anotacji.
- Granice fokusu: pola geometrii `TextField`, filtr i wiersze
  `GroupedOptionList[data-shortcut-scope]`, contenteditable oraz natywne
  `input/select/textarea` zachowują własne strzałki; A/X/R pozostają bez zmian.
- Outside-dismiss: panel ref nadal rozstrzyga „wewnątrz/na zewnątrz”; klik obrazu
  zamyka stary panel bez zapisu i tym samym pointerdownem rozpoczyna nowy box,
  a własny bbox/uchwyty pozostają wyjątkiem.

### Moduły i ID wytycznych UI/UX

- [x] Layout/siatka: `GRID-01`, `GRID-02`, `GRID-08`, `SPACING-01`,
      `SPACING-02`, `SPACING-11`. Używane są wyłącznie istniejące tokeny;
      `--size-md` oddziela ciężki wizualnie obraz od powiązanego formularza,
      pełna szerokość oznacza szerokość kontenera, nie viewportu.
- [x] Typografia: bez nowej typografii. Zachowane `TYPO-07`,
      `FONTSIZE-02..10`, `LHEIGHT-09..11`: nagłówek, mikrokopia, monospaced
      geometria i wagi pozostają na istniejących tokenach.
- [x] Kolory: bez nowych kolorów. Zachowane `COLOR-02`, `COLOR-07`,
      `COLOR-08`, `COLOR-09`; panel nadal używa powierzchni raised i istniejących
      semantycznych kolorów marki/statusu.
- [x] Obramowania: `BORDER-02`, `BORDER-03`, `BORDER-05`, `BORDER-06`,
      `BWIDTH-03`, `BWIDTH-13`. Strukturalną separację obrazu i panelu daje
      odstęp; istniejące obrysy pól/fokusu i `box-sizing` nie zmieniają się.
- [x] Promień: `RADIUS-02`, `RADIUS-04`, `RADIUS-05`. Dockowany formularz
      zachowuje `--radius-md`, a jego pola/lista dotychczasowe promienie.
- [x] Cienie: `SHADOW-05`. Po utracie roli warstwy pływającej panel traci
      `--shadow-elevation-high`; na ciemnym tle hierarchię niesie powierzchnia i
      odstęp.
- [x] Nakładki: `OVERLAY-01`, `OVERLAY-06`. Etykiety bboxów pozostają nad
      obrazem z własnym kontrastowym tłem; niewidzialne hit-targety overlaya nie
      są zmieniane. Sam formularz przestaje być nakładką.
- [x] Interakcje: `COLOR-07`, `OPACITY-02`, `BORDER-06`. Nie powstają nowe
      hover/active/disabled; nudge respektuje disabled/frozen oraz istniejący
      focus guard i wywołuje `preventDefault` tylko po realnym ruchu/commicie.
- [x] Komponenty: użyte gotowe `RegionOverlay`, `GroupedOptionList`,
      `TextField`, `Button`, `StatusBadge`, `DataList`, `Notice`, `InlineError`.
      Nie powstaje nowy komponent common ani nowy interaktywny element inline;
      `copySelection` i `GroupedOptionList` pozostają poza zmianą.

### Plan implementacji i weryfikacji

- [x] Usunąć `floatingLayer`, `popoverPlacement` i cały stan pomiaru/pozycji.
- [x] Zadokować `AnnotationPopover` pod `RegionOverlay`, zachowując
      `key={popoverAnnotation.id}`, FormState i outside-dismiss.
- [x] Dodać czyste `nudgeRect` obok geometrii overlaya, z testami kierunków,
      kroków, czterech krawędzi, no-opu i niezmienionego rozmiaru.
- [x] Podłączyć strzałki/Shift/Enter do `geometryPreview`/`draftBBox` z pełnym
      guardem fokusu, frozen/disabled i liczeniem requestów w testach flow.
- [x] Zaktualizować testy komponentowe, flow i Chromium E2E dla dokowanego
      położenia oraz pointer-capture.
- [x] Uruchomić testy celowane, detector layout, pełną bramkę 9/9 jednym
      przebiegiem i obejrzeć pełnorozdzielczy screenshot dokowanego panelu.

## Wynik implementacji

- `AnnotationPopover` jest zwykłym rodzeństwem `RegionOverlay` w regionie
  „Podgląd klatki”. Nie ma już absolutnego pozycjonowania, pomiaru kotwicy,
  `data-side`, `floatingLayer` ani modułu `popoverPlacement`. Panel ma szerokość
  kolumny podglądu, a jego wizualna rola została zmieniona z warstwy pływającej
  na powierzchnię dokowaną (słabszy border, bez cienia elevation).
- Naciśnięcie strzałki przesuwa zaznaczony bbox w przestrzeni źródłowej o 1 px,
  a `Shift` + strzałka o 10 px. Kolejne ruchy bazują na bieżącym
  `geometryPreview`; dopiero `Enter` zapisuje jeden skumulowany PATCH.
- `nudgeRect` zachowuje `width`/`height`, korzysta z istniejącego
  `clampRectToSource` i zwraca wejściowy prostokąt dla no-opu na krawędzi.
  Call-site nie tworzy wtedy preview, nie wywołuje `preventDefault` i nie wysyła
  żądania.
- Draft korzysta z `setDraftBBox`. Strzałki zmieniają wyłącznie stan kliencki,
  a `Enter` bez wybranej klasy nadal nie tworzy anotacji. Enter po jawnym
  wyborze klasy zachowuje istniejącą aktywację przycisku „Zapisz klasę”.
- Guard klawiatury pozostaje identyczny z guardem skrótów review:
  `defaultPrevented`, `repeat`, Alt/Ctrl/Meta, contenteditable,
  `INPUT`/`SELECT`/`TEXTAREA` i `data-shortcut-scope`. Dodatkowo nudge respektuje
  `canDirectEdit` i `editorDisabled`; skróty A/X/R nie zmieniły znaczenia.

## Testy i visual QA przed bramką

- Ukierunkowany Vitest: 97/97 w 3 plikach po implementacji; pełny wymagany
  zestaw regresyjny: 155/155 w 7 plikach (`AnnotationPopover`, review flow,
  fixupy, terminal refresh, `GroupedOptionList`, `RegionOverlay`, geometria).
- Nowe regresje liczą requesty: draft po nudge i Enter ma 0 POST; trzy
  `ArrowRight` mają 0 PATCH, a następujący `Enter` dokładnie 1 PATCH z `x + 3`
  i `expected_version`; pokryte są także Shift+10, cztery kierunki/krawędzie,
  no-op bez `preventDefault`, oba guardy fokusu i zamrożona klatka.
- Chromium: test visual QA 2/2 oraz ponowiony pełny vertical flow 1/1. Pierwsze
  łączne uruchomienie miało 2/3 i przekroczyło globalny limit 30 s dopiero na
  końcowym ekranie eksportu COCO po kontrolowanym restarcie backendu; izolowany
  rerun scenariusza przeszedł i nie wykazał regresji FE-009.
- Detector Impeccable uruchomiony po finalnych zmianach UI dla CSS i obu
  komponentów: `[]` (zero findingów).
- `docs/tickets/FE-001/screenshots/annotations-1440.png` obejrzany w pełnej
  rozdzielczości 1440 px. Otwarty panel zaczyna się pod dolną krawędzią obrazu,
  nie przykrywa HUD ani bboxów, wypełnia kolumnę podglądu, nie powoduje
  poziomego overflow; nagłówek, badge, filtr/lista klas, akcje, geometria oraz
  focus ring są czytelne.

## Zachowania zaakceptowane w FE-008 — potwierdzenie osobne

- [x] Pointerdown poza panelem zamyka go bez zapisu i porzuca draft geometrii;
      klik obrazu tym samym pointerdownem rozpoczyna nowy gest rysowania. Test
      realnego `page.mouse`/pointer capture w `vertical-flow.spec.ts` pozostał.
- [x] Kliknięcie, drag i resize własnego `[data-overlay-shape-id]` nie zamyka
      panelu; wyjątek oparty na identyfikatorze kształtu pozostał bez zmian.
- [x] Escape nadal nie jest obsługiwany.
- [x] Pusty Enter w auto-focusowanym filtrze nie wybiera klasy i wysyła 0 POST.
- [x] `key={popoverAnnotation.id}` pozostał w call-site: zmiana anotacji
      remountuje formularz, refetch tej samej anotacji zachowuje dirty state.
- [x] Zwykły błąd POST zachowuje draft do ponowienia.

## Granice i odchylenia

- Brak zmian backendu, `copySelection`, `GroupedOptionList` oraz mapowania
  source↔display. W geometrii dodano wyłącznie funkcję nudge używającą
  istniejącego `clampRectToSource`.
- Zoom, pan i zmiana rozmiaru bboxa z klawiatury nie zostały rozpoczęte.
- Brak odchyleń funkcjonalnych od ticketu. Jedyna korekta testowa polegała na
  otwarciu panelu ponownie bezpośrednio przed screenshotem: wspólny helper
  focusu celowo klika poza panelem i wcześniej zapisywał obraz już po jego
  zamknięciu, mimo poprawnej asercji geometrii.

## Pełna bramka — 2026-09-07

- Przed uruchomieniem skopiowano ignorowany `.env` z głównego worktree
  `D:\my\Projects\DatasetFactory` i wykonano bootstrap zależności z lockfile:
  Python/uv, 128 pakietów npm (0 luk), Chromium, FFmpeg i Tesseract. Porty 8000
  i 5173 były wolne przed bramką i pozostały wolne po niej.
- Wykonano jeden nieprzerwany przebieg dokładnie komendą
  `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1`.
- Wynik: **9/9 zielonych bramek, 0 SKIP**:
  - backend format: 256 plików, 0,4 s;
  - backend lint: 0 błędów, 0,1 s;
  - backend typy: 0 błędów w 99 plikach, 30,2 s;
  - backend testy: 347/347, 325,8 s (sam pytest 318,85 s);
  - frontend typy: 0 błędów, 1,1 s;
  - frontend testy: 562/562 w 39 plikach, 43,0 s;
  - frontend build: 0 błędów, 304 moduły, 2,3 s;
  - Playwright Chromium E2E: 4/4, 61,4 s;
  - E2E root safety: 2/2, 0,7 s.
- Po tym finalnym przebiegu ponownie obejrzano wygenerowany screenshot
  `annotations-1440.png` w pełnej rozdzielczości; wynik visual QA opisany wyżej
  pozostaje aktualny.
