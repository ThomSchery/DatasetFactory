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

# FE-009-FIX1 — `geometryPreview` jako stan trwały

Wejście: zimne review FE-009, `CHANGES REQUESTED`, 1 × P1, 2 × P2, 1 × P3.
Baza: `c5ac620`. Zakres: wyłącznie FIX-A…FIX-D.

## Diagnoza przyjęta bez sporu

Przed FE-009 `geometryPreview` żyło tylko między `onShapeChange` a
`onShapeChangeEnd` jednego gestu myszą. Nudge uczynił z niego stan spoczynkowy,
w którym operator siedzi dowolnie długo, a `AnnotationPopover` nadal traktował
go jak chwilowy podgląd: wyświetlał `displayedDraft` liczone z preview, ale
`onChange` i „Zapisz geometrię” pracowały na niezależnym `form.draft`. P1 i oba
P2 są objawami tego jednego przeoczenia, więc naprawiana jest przyczyna:
**geometria efektywna = `geometryPreview ?? annotation`** jako jedyne źródło
prawdy dla baseline'u, wyświetlania i zapisu.

## Design Plan przed kodem (FIX1)

Nowe elementy interfejsu są dwa i oba są nieinteraktywne, więc reguła 2.1
`new-component.md` (zakaz inline'owych elementów interaktywnych) nie jest
naruszona; oba korzystają z istniejących komponentów `common/`.

1. Znacznik w panelu anotacji: `StatusBadge tone="warning"` z tekstem
   „Niezapisane” plus zdanie mikrokopii z `<kbd>Enter</kbd>`, umieszczony nad
   rozwijaną sekcją geometrii, żeby był widoczny także przy zwiniętym
   `<details>`.
2. Komunikat na poziomie kolumny podglądu: `Notice tone="warning"` — dokładnie
   jego udokumentowane zastosowanie („komunikat trwający tak długo, jak jego
   warunek”). Niesie powód blokady akceptacji i przeżywa zamknięcie panelu po
   zapisie klasy.

Checklista wytycznych:

- [x] Layout/siatka: `GRID-01`, `GRID-02`, `SPACING-01`. Znacznik dziedziczy
      rytm `--size-xs` istniejącej siatki panelu; `Notice` wchodzi w istniejący
      stos kolumny podglądu obok `InlineError`, bez nowego kontenera.
- [x] Typografia: `FONTSIZE-02`, `LHEIGHT-09`, `TYPO-07`. Mikrokopia znacznika
      to `--font-size-sm` / `--line-height-standard`; `<kbd>` używa istniejącej
      reguły monospaced z `.df-annotation-popover__actions kbd`.
- [x] Kolory: `COLOR-08`, `COLOR-09`. Ton ostrzegawczy niesie
      `--color-status-warning-default` na badge'u, ale znaczenie jest też
      zapisane słowem („Niezapisane przesunięcie”), więc nie zależy od koloru.
      Tekst pozostaje na `--color-text-weak-default`.
- [x] Obramowania i promień: bez zmian. Znacznik nie ma własnego obrysu,
      `Notice` używa swojego akcentu `border-inline-start` (BORDER-05).
- [x] Cienie: brak. Panel pozostaje zadokowany bez elevacji (SHADOW-05).
- [x] Interakcje: `COLOR-07`, `OPACITY-02`. Nowy stan disabled dotyczy wyłącznie
      istniejącego `Button` „Zaakceptuj klatkę” i korzysta z jego
      `--opacity-disabled`; nie powstaje żaden nowy wariant.
- [x] Komponenty: `StatusBadge`, `Notice`, `Button`, `TextField` — wszystkie już
      w katalogu (sekcje 4–5). Nowy komponent nie jest potrzebny.

## Decyzje projektowe FIX1

- **FIX-A.** `syncFormState` dostaje geometrię efektywną zamiast `annotation`,
  a `displayedDraft` znika. Pola i „Zapisz geometrię” czytają wyłącznie
  `form.draft`, więc nie istnieje ścieżka, w której wartość widoczna i wysyłana
  różnią się. Polityka dirty/clean zostaje bez zmian: pole równe baseline'owi
  podąża za nową geometrią, pole ręcznie zmienione zostaje — ta sama reguła,
  która od FE-008 chroni edycję przy refetchu tej samej anotacji.
- **FIX-B.** `Enter` nie jest konsumowany, gdy `event.target` leży wewnątrz
  korzenia panelu. Kontraktem jest jawny atrybut
  `data-annotation-popover` eksportowany z komponentu, nie nazwa klasy CSS —
  ten sam wzorzec, co `data-shortcut-scope` w `GroupedOptionList`. Guard na
  `Alt`/`Ctrl`/`Meta`, `INPUT`/`SELECT`/`TEXTAREA` i `data-shortcut-scope`
  pozostaje nietknięty, a strzałki nadal działają z panelu.
- **FIX-C.** Znacznik i blokada akceptacji zależą od tego, czy preview *różni
  się* od zapisanej anotacji, a nie od tego, skąd pochodzi. Rozważony był
  dyskryminator `origin: "drag" | "keyboard"`, który usunąłby krótkie mignięcie
  komunikatu w trakcie przeciągania myszą; odrzucony, bo zostawiałby nieoznaczony
  dokładnie ten przypadek, w którym preview z gestu myszą jednak zostanie stanem
  spoczynkowym (utracone `pointerup`) — czyli tę samą klasę błędu, którą review
  właśnie znalazło. Podczas przeciągania geometria faktycznie nie jest zapisana,
  więc komunikat nie kłamie.
- **FIX-D.** Krok to zawsze dokładnie `step` px. Zakres ruchu to zakres
  dozwolony poszerzony o bieżącą pozycję prostokąta, więc box w granicach
  zatrzymuje się na krawędzi, box poza kadrem idzie po `step` px i nie jest
  wciągany skokiem, a jednocześnie nie może pogłębić istniejącego naruszenia.
  Klampowana jest wyłącznie oś, po której nastąpił ruch.

## Domknięcie implementacji FIX1

- Błąd mutacji geometrii nie czyści już `geometryPreview`. Operator widzi nadal
  ten sam bbox i znacznik niezapisanej pracy, a ponowienie nie zaczyna się od
  starej geometrii. Konflikt wersji może odświeżyć anotację, ale preview zostaje
  ocenione względem nowej odpowiedzi serwera.
- Udany zapis klasy zamyka panel jak wcześniej tylko wtedy, gdy anotacja nie ma
  niezapisanej geometrii. Przy aktywnym preview wybór klasy zachowuje zaznaczenie,
  panel i marker. Jawny `data-annotation-selection-target` na chipie klasy pozwala
  outside-dismiss odróżnić ponowny wybór tej samej anotacji od przejścia do innej;
  w drugim przypadku obowiązuje dotychczasowe czyszczenie preview.
- Zablokowany przycisk „Zaakceptuj klatkę” ma znacznik
  `data-preserve-annotation-preview`, żeby sam `pointerdown` na disabled control
  nie porzucał pracy, której ten przycisk ma bronić. Skrót `a` i klik wysyłają
  w tym stanie zero requestów review.
- Pierwszy łączny przebieg obu speców E2E wykrył regresję w trakcie dragowania:
  `Notice` pojawiał się nad obrazem po pierwszym `pointermove`, przesuwał aktywny
  `RegionOverlay` i zmieniał wyliczenie `y` (`oczekiwane 190`, widoczne `0`).
  Komunikat przeniesiono bezpośrednio pod overlay. Powtórzony vertical flow
  przeszedł 1/1, a visual QA dodatkowo mierzy teraz, że współrzędna `y` powierzchni
  rysowania jest identyczna przed i po utworzeniu preview.

## Weryfikacja FIX1 przed pełną bramką

- TypeScript: `npx tsc --noEmit` — 0 błędów.
- Sondy FIX-A…FIX-D: 75/75 w 3 plikach.
- Rozszerzony wymagany zestaw Vitest: 176/176 w 8 plikach
  (`GroupedOptionList`, `RegionOverlay`, geometria, `AnnotationPopover`, nowy
  `annotationNudgeFixup`, review flow, review fixup i terminal refresh).
- Chromium vertical flow po korekcie stabilności layoutu: 1/1.
- Chromium visual QA po dodaniu asercji stabilności overlaya: 2/2.
- Detector Impeccable dla czterech zmienionych plików UI/CSS: `[]`.
- Screenshot `annotations-1440.png` obejrzany ponownie w pełnej rozdzielczości:
  box i etykieta są niezasłonięte, ostrzeżenie leży pod obrazem, dokowany panel
  pokazuje badge „Niezapisane”, wartości `x/y/w/h` i focus ring; brak poziomego
  overflow.

## Sondy findingów z zimnego review — wynik końcowy

- [x] **FIX-A / P1 — jedno źródło prawdy.** `ArrowRight ×3` pokazuje `x=103`,
      a „Zapisz geometrię” wysyła dokładnie jeden PATCH z `bbox.x=103` i
      `expected_version=3`. Po wyczyszczeniu pola i wpisaniu `555` pole oraz
      summary pokazują `555`, jedyny PATCH ma `bbox.x=555`, a zapis `1035` nie
      występuje. Dalszy nudge aktualizuje czyste pola, zachowuje ręcznie zmienione
      i jeden PATCH składa obie wartości.
- [x] **FIX-B / P2 — Enter należy do panelu.** Fokus „Usuń” + Enter daje jeden
      DELETE i zero PATCH geometrii; „Zapisz klasę” daje jeden PATCH klasy i zero
      PATCH geometrii; „Przerysuj bbox” uzbraja redraw i wysyła zero requestów.
      Enter z fokusem poza panelem nadal daje dokładnie jeden PATCH geometrii.
- [x] **FIX-C / P2 — preview nie ginie po cichu.** Ponowny klik tego samego chipa
      klasy zachowuje `x=103`, marker i wysyła zero requestów. Udany zapis klasy
      wysyła jeden PATCH klasy, zero PATCH geometrii i zachowuje panel/preview.
      Błąd PATCH geometrii pozostawia bbox i marker po dokładnie jednym requestcie;
      refetch tej samej anotacji wykonuje dodatkowy GET, zero mutacji i zachowuje
      preview. Skrót `a` oraz klik disabled „Zaakceptuj” dają zero POST review,
      dopóki Enter nie zapisze przesunięcia.
- [x] **FIX-D / P3 — clamp kroku.** Dla `x=1900`, `w=40`, szerokości 1920:
      ArrowLeft daje `x=1899`, Shift+ArrowLeft daje `x=1890`; krok pionowy nie
      zmienia `x`, a ruch pogłębiający naruszenie jest no-opem. Box w granicach
      nadal zatrzymuje się na krawędzi. Próba zapisu wciąż niepoprawnego `x=1899`
      wysyła zero requestów, pokazuje `bbox_invalid` i nie cofa preview.

## Sześć zachowań „MUSZĄ przeżyć” — retest po FIX1

1. [x] Outside `pointerdown` zamyka panel bez zapisu, porzuca draft i ten sam
       pointerdown na obrazie rozpoczyna nowy box — testy komponentowe oraz realny
       `page.mouse` w `vertical-flow.spec.ts`, zielone w pełnej bramce.
2. [x] Pointerdown/drag/resize własnego `[data-overlay-shape-id]` nie zamyka
       panelu — sonda `AnnotationPopover` i bezpośrednie gesty vertical-flow.
3. [x] `Escape` nadal nie ma hintu ani handlera — test komponentowy zielony.
4. [x] Pusty Enter w autofocusowanym filtrze nie wybiera klasy i wysyła zero POST
       — regresja review fixup zielona w pełnym Vitest.
5. [x] `key={popoverAnnotation.id}` pozostaje w call-site; zmiana anotacji
       remountuje formularz, a refetch tej samej zachowuje dirty state oraz
       geometry preview — testy terminal refresh i nowa sonda refetch.
6. [x] Zwykły błąd POST zachowuje draft do ponowienia — review flow zielony;
       dodatkowo błąd PATCH geometrii zachowuje teraz trwały preview.

Dodatkowe niezmienniki FE-009 również są zielone: seria strzałek wysyła zero
PATCH, Enter wysyła dokładnie jeden PATCH z bieżącym `expected_version`, a
`preventDefault` występuje tylko przy rzeczywistym ruchu.

## Pełna bramka FIX1 — 2026-09-08

- Przed startem `.env` był obecny, a porty 8000 i 5173 były wolne.
- Wykonano jeden nieprzerwany przebieg dokładnie komendą
  `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1`.
- Wynik: **9/9 PASS, 0 SKIP, exit code 0**:
  - backend format: 256 plików, 2,2 s;
  - backend lint: 0 błędów, 0,1 s;
  - backend typy: 0 błędów w 99 plikach, 2,6 s;
  - backend testy: 347/347, 341,6 s (pytest 334,44 s);
  - frontend typy: 0 błędów, 1,9 s;
  - frontend testy: 583/583 w 40 plikach, 37,7 s;
  - frontend build: 304 moduły, 2,0 s;
  - Playwright Chromium E2E: 4/4, 56,9 s;
  - E2E root safety: 2/2, 0,8 s.
- Po bramce finalny deterministic screenshot obejrzano jeszcze raz w pełnej
  rozdzielczości 1440 × 1418: overlay nie zmienia położenia po nudge, ostrzeżenie
  znajduje się pod obrazem, panel jest zadokowany i w całości czytelny.

# FE-009-FIX2 — anulowanie gestu przywraca jego baseline

## Plan FIX2 i zakres UI

- Elementy interfejsu w zakresie: zaznaczony bbox w `RegionOverlay`, dokowany
  `AnnotationPopover`, badge „Niezapisane” oraz `Notice` blokujący akceptację.
  Żaden z nich nie zmienia wyglądu, kolejności DOM, copy ani zachowania fokusu;
  zmienia się wyłącznie cykl życia istniejącego `geometryPreview` podczas
  `pointerup` bez ruchu i `pointercancel`.
- `RegionOverlay` pozostaje nietknięty. Call-site w `FrameEditor` zapamiętuje
  preview obecne przed pierwszym `onShapeChange` danego gestu i przy
  `onShapeChangeCancel` przywraca tę wartość. Zakończony ruch nadal commituję
  dotychczasową ścieżką `onShapeChangeEnd`.
- Moduły/ID UI/UX: `OVERLAY-01` i `OVERLAY-06` (widoczny bbox i poprawny
  hit-target gestu), `COLOR-09` (stan niezapisany nie zależy wyłącznie od koloru),
  `OPACITY-02` i `BORDER-06` (istniejące stany interakcji/fokusu bez zmian),
  `GRID-01`/`SPACING-01` (brak zmian layoutu), `FONTSIZE-02`/`LHEIGHT-09`
  (istniejąca mikrokopia bez zmian), `RADIUS-05`, `BORDER-05`, `SHADOW-05`
  (panel i Notice bez zmian wizualnych). Użyte komponenty common pozostają te
  same: `RegionOverlay`, `StatusBadge`, `Notice`, `Button`; brak nowego elementu
  interaktywnego i brak CSS.
- Granice: bez backendu, bez `copySelection`/`GroupedOptionList`, bez mapowania
  source↔display, bez zoom/pan i bez zmian wewnątrz `RegionOverlay`.

## Implementacja i sondy FIX2

- `manipulationBaselineRef` rozróżnia brak aktywnego gestu od baseline'u `null`.
  Pierwszy callback `onShapeChange` zapisuje całe preview sprzed `pointerdown`;
  kolejne ruchy go nie nadpisują. Cancel przywraca baseline, a udany end czyści
  ref przed istniejącym commitem.
- Sonda recenzenta: nudge `100 → 103`, pełne `pointerdown` + `pointerup` bez
  ruchu we własnym bboxie — overlay nadal `x=103`, oba znaczniki widoczne,
  panel otwarty, zero requestów.
- `pointercancel` bez ruchu daje ten sam wynik. Rzeczywisty ruch `103 → 113`
  przerwany `pointercancel` wraca do `103`, nie do zapisanych `100`, i wysyła
  zero requestów.
- TypeScript: 0 błędów. Celowany zestaw 3 plików: 55/55. Rozszerzony zestaw
  regresji FE-009/FIX1/FIX2: 179/179 w 8 plikach. Chromium vertical-flow: 1/1.
