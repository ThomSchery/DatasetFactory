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
