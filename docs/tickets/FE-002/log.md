# FE-002 — log implementacji

## Design Plan

Tryb powierzchni: **Operate**. Autorytet wizualny: istniejące tokeny
`frontend/src/styles/tokens.css`, klasy `.df-*`, katalog komponentów z
`.agent/guidelines/new-component.md` oraz zaakceptowany kierunek z ticketu.
Makieta `annotation-review-direct-editing` opisuje relacje i zachowanie, nie
kolory ani wymiary. Nie powstają nowe assety ani nowy komponent common.

### Elementy interfejsu w zakresie

- panel „Obraz i bbox”: metadane klatki, komunikaty, kontrolki dodawania bbox,
  obraz z `RegionOverlay` oraz decyzje review;
- panel „Klatki”: lista klatek, stany wybrania, badge i paginacja;
- panel „Anotacje”: lista anotacji, stan wybrania, klasa, cztery pola geometrii,
  akcje zapisu/przerysowania/usunięcia oraz błędy walidacji;
- bbox na obrazie: stany `default`, `hover`, `selected`, `focus`, `disabled`
  i `error`, hit-target, przeciąganie całego zaznaczonego bbox oraz cztery
  uchwyty narożne;
- zachowanie szerokości: układ roboczy od 1280 px; poniżej istniejący
  `WidthGuard` zastępuje edytor komunikatem.

### Moduły i ID wytycznych UI/UX

- [x] Layout/siatka: `GRID-01`, `GRID-02`, `GRID-05`, `GRID-08`, `GRID-10`,
  `GRID-12`; `SPACING-01`, `SPACING-02`, `SPACING-06`, `SPACING-07`,
  `SPACING-11`. Użyć wyłącznie `--size-*`, `--control-height-*` i istniejącego
  progu `--workspace-min-width`; podgląd zajmuje oba tory, niżej lista ma 1fr,
  inspektor 3fr.
- [x] Typografia: `TYPO-02`, `TYPO-06`, `TYPO-07`, `TYPO-08`, `TYPO-11`;
  `FONTSIZE-02`, `FONTSIZE-08`, `FONTSIZE-09`, `FONTSIZE-10`;
  `LHEIGHT-09`, `LHEIGHT-10`, `LHEIGHT-11`; `LSPACE-02`, `LSPACE-09`;
  `CASING-02`, `CASING-03`. Zachować istniejące tokeny i polskie sentence case.
- [x] Kolory: `COLOR-07`, `COLOR-08`, `COLOR-09`, `COLOR-10`;
  `OPACITY-02`. Stany używają semantycznych tokenów; zaznaczenie ma
  `aria-selected`, wypełnienie i uchwyty, więc nie zależy wyłącznie od koloru.
- [x] Obramowania: `BORDER-02`, `BORDER-03`, `BORDER-05`, `BORDER-06`,
  `BORDER-07`; `BWIDTH-06`, `BWIDTH-08`, `BWIDTH-09`, `BWIDTH-10`,
  `BWIDTH-11`, `BWIDTH-13`, `BWIDTH-14`; `RADIUS-01`, `RADIUS-02`,
  `RADIUS-03`, `RADIUS-04`, `RADIUS-05`. Bbox pozostaje ostrym prostokątem,
  a kreski i uchwyty nie skalują się wraz z obrazem.
- [x] Cienie: `SHADOW-03`, `SHADOW-05` — brak nowych cieni; ciemny baseline
  zachowuje istniejącą separację powierzchni.
- [x] Interakcje/nakładki: `GRID-05`, `COLOR-07`, `OPACITY-02`, `BORDER-06`,
  `OVERLAY-06`, `FE-08`. Widoczne uchwyty mają powiększony, funkcjonalny
  hit-target; klawiaturowy listbox/option i formularze pozostają pełną drogą
  alternatywną.
- [x] Komponenty: reużywane `Panel`, `RegionOverlay`, `Button`, `TextField`,
  `SelectField`, `StatusBadge`, `DataList`, `Notice`, `UiStates`, `FrameList`
  i `AnnotationList`. Nie dodawać inline `<button>`/`<input>` ani nowego common.

### Mechanizm i weryfikacja

- F1: jawne obszary siatki `preview / frames / inspector`; sprawdzić testy
  `WidthGuard`, bez zmiany progu 1280 px.
- F2: ten sam `selectedId` z `FrameEditor`; trafienie wyliczone w pikselach
  źródłowych, spośród zawierających punkt wygrywa najmniejsze pole.
- F3: jeden `viewBox` w pikselach źródłowych; wejście wskaźnika przechodzi
  wyłącznie przez `clientPointToSource`; move/resize są ograniczane do klatki.
  Podgląd geometrii synchronizuje pola, a commit wywołuje ten sam handler
  mutacji geometrii co formularz po walidacji z `geometryForm.ts`.
- Testy Done Criteria: zaznaczenie z obrazu, zaznaczenie z listy, mniejszy bbox
  przy nakładaniu, PATCH geometrii po przeciągnięciu wraz z wartościami pól.
- Końcowa bramka: jeden nieprzerwany przebieg
  `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1`.

## Próby i błędy

- `rg` nie jest dostępny na hoście; dalsze wyszukiwanie wykonano przez
  `Get-ChildItem` i `Select-String` bez zmiany zakresu.
- Pierwszy test move ujawnił, że callback otrzymywał strukturalnie poprawny
  `SourceRect`, ale runtime przenosił także `id` i `label` z `OverlayShape`.
  Stan gestu został zawężony do jawnej kopii czterech pól geometrii; test
  celowo wymaga dokładnego payloadu.

## Runda poprawek po cold review

Werdykt `artifacts/fe-002-cold-review`: REJECT. Sprawdzona matematyka skali,
smallest-hit, clamping i wspólna ścieżka mutacji pozostają bez zmian. Poprawka
dotyczy wyłącznie układu inspektora, prawdziwego pokrycia przeglądarkowego,
świadomej aktualizacji dowodu wizualnego i rejestru długu harnessu.

### Design Plan korekty P1-2

Tryb: **Operate**, komenda Impeccable: **layout**. Główna ścieżka pozostaje
`obraz → lista klatek → inspektor`; cztery współrzędne jednej anotacji są jedną
grupą i mają tworzyć jeden zwarty wiersz w szerokim inspektorze. Formularz
tworzenia nowego bbox pozostaje w bazowym układzie 2×2.

- [x] Elementy interfejsu: istniejący panel „Anotacje”, wiersz anotacji,
  `TextField` x/y/width/height; overlay, akcje, typografia i kolory bez zmian.
- [x] Layout/siatka: pełny moduł `GRID-00..14` i `SPACING-01..06` przeczytany;
  zastosowanie `GRID-01`, `GRID-02`, `GRID-08`, `GRID-10`, `GRID-12` oraz
  `SPACING-01`. Scoped selector inspektora dostaje cztery równe kolumny,
  zachowując istniejące gapy `--size-xs` / `--size-sm` i próg 1280 px.
- [x] Typografia, kolory, obramowania i cienie: bez zmian; istniejące tokeny
  i stany `TextField` pozostają autorytetem.
- [x] Interakcje: układ nie zmienia kolejności DOM ani tab order. P2 rozszerzy
  vertical flow o real-browser move i resize SE, z asercją pól, API bbox oraz
  `expected_version`.
- [x] Komponenty: tylko istniejące `Panel`, `AnnotationList`, `TextField` i
  `RegionOverlay`; brak nowego common i brak inline kontrolek.
- [x] Weryfikacja P1-2: Chromium przy viewport 1280 px mierzy cztery pola
  `getBoundingClientRect`; wszystkie muszą mieć ten sam `top` i mieścić się
  w granicach inspektora. Sam `WidthGuard` nie jest traktowany jako dowód.
- [x] Weryfikacja wizualna P1-1: po korekcie wygenerować
  `annotations-1440.png`, zapisać old/new SHA-256 i commitować PNG jako
  celową aktualizację dowodu.

Wstępny `impeccable detect --scope layout` dla CSS/FrameEditor zwrócił pustą
listę. To nie unieważnia findingu: obecna wada jest relacją semantyczną 2×2,
której detektor mechaniczny nie rozpoznaje.

### P1-1 — świadoma aktualizacja dowodu wizualnego

Po przejściu celowanego Chromium visual-QA z asercją 1280 px wygenerowano i
obejrzano `docs/tickets/FE-001/screenshots/annotations-1440.png` w pełnym
rozmiarze 1440×2389. Obraz pokazuje pełnoszeroki podgląd nad dolnymi panelami,
formularz nowego bbox w zachowanym układzie 2×2 oraz x/y/width/height aktywnej
anotacji w jednym wierszu inspektora.

- poprzedni SHA-256:
  `973CC93CBF0C3726EB9D030E4F17062615F307E72284708F22FD5C20D7BB95E6`;
- nowy SHA-256:
  `EA040242C7F3EAF3085A200C368AB1E6EEC89095BC80619B0044DC04C7B55A74`.

PNG jest generowany przez `visual-qa.spec.ts`, ale w tej rundzie stanowi celową,
wersjonowaną aktualizację ludzkiego dowodu po zmianie układu, a nie artefakt do
przywrócenia do poprzedniego HEAD.
