# FE-010-FIX1 — log implementacji

## Zakres i dowody wejściowe

Fixup obejmuje wyłącznie trzy findingi zimnego review FE-010:

1. pan nie może przechodzić przez outside-dismiss ani tworzyć draftu po
   `Spacja` + lewy przycisk, gdy fokus pozostaje na chipie klasy;
2. otwarty, dokowany panel musi kończyć się wewnątrz viewportu 1000 px przy
   szerokościach 1280 i 1440 px;
3. `Ctrl` + kółko na granicach 1× i 8× nie może konsumować zdarzenia, jeżeli
   skala faktycznie się nie zmienia.

Review zmierzyło przed fixupem: obraz **829 × 552 px**, panel
`top = 770 px`, `bottom = 1058 px` dla obu viewportów testowej klatki oraz
szerokość obrazu **981 px** przy 1× dla realnej klatki 1920 × 1080.

## Design Plan

### Decyzja układu

Naturalna wysokość panelu jest większa niż miejsce pozostałe pod dużą kanwą.
Zmniejszenie obrazu o pełną wysokość panelu ponownie odebrałoby operatorowi
miejsce do precyzyjnego celowania — problem, który FE-010 miał rozwiązać.
Dlatego panel zachowuje naturalną wysokość, gdy się mieści, a w przeciwnym razie
dostaje własne przewijanie i dynamiczne `max-height` równe odległości od jego
rzeczywistej górnej krawędzi do dołu viewportu.

Pomiar nie tworzy pętli layoutu: budżet zależy wyłącznie od `innerHeight` i
`panel.getBoundingClientRect().top`. Wysokość panelu nie wpływa na jego `top`,
bo jest drugim wierszem po kanwie; ograniczenie `max-height` może więc zmienić
tylko dolną krawędź. `ResizeObserver` obserwuje poprzedzającą kanwę, a nie panel.

### Elementy interfejsu i stosowane wytyczne

| Element | Decyzja | Moduły / ID UI/UX |
| --- | --- | --- |
| Powierzchnia `RegionOverlay` | Pan środkowym oraz `Spacja` + LMB jest rozstrzygany przed rysowaniem i oznaczany dla dokumentowego outside-dismiss na czas tego samego zdarzenia. Bez zmian wizualnych ani współrzędnych. | Grid & Spacing: GRID-08/11; UI & Visuals: OVERLAY-06; Typography: OPACITY-02 |
| Chip klasy z fokusem | Spacja uruchamia pan, gdy wskaźnik jest nad kanwą; pola tekstowe, `textarea`, `select` i `contenteditable` nadal zachowują wpisywanie Spacji. | UI & Visuals: COLOR-07, OVERLAY-06; Typography: OPACITY-02 |
| Dokowany `AnnotationPopover` | Pozostaje bezpośrednio pod obrazem. Naturalna wysokość, gdy mieści się; dynamiczne `max-height` i `overflow-y: auto`, gdy dolna krawędź wyszłaby poza viewport. | Grid & Spacing: GRID-01/02/08/12, SPACING-01/02/11; UI & Visuals: BORDER-02/05, RADIUS-02/04 |
| Kanwa i obraz | Zachowują obecny limit i pełnoszeroki wiersz, aby nie zmniejszyć szerokości 1×. Pozycja kanwy jest źródłem dynamicznego budżetu panelu. | Grid & Spacing: GRID-01/02/08/12, SPACING-01/11; UI & Visuals: BORDER-07, BWIDTH-08, RADIUS-02/04 |
| Sterowanie zoomem | Wewnątrz zakresu 1×–8× bez zmian. Na obu krańcach no-op zachowuje domyślne zachowanie kółka. | Grid & Spacing: GRID-08; UI & Visuals: COLOR-07, OVERLAY-06; Typography: OPACITY-02 |
| Visual QA | Asercja obejmuje `panel.bottom <= innerHeight` w 1280×1000 i 1440×1000; screenshot otwartego panelu jest ograniczony do viewportu. | Grid & Spacing: GRID-08/12, SPACING-01/11; UI & Visuals: BORDER-07 |
| Istniejące komponenty | Reużywane są `RegionOverlay`, `AnnotationPopover`, `Button`, `GroupedOptionList`, `TextField` i `StatusBadge`; brak nowego komponentu wspólnego. | Katalog komponentów `new-component.md`, sekcje 4–5 |

### Obowiązkowa checklista

- [x] **Layout/Siatka:** istniejące `--size-xs/sm/md` pozostają jedynymi
  odstępami; wysokość panelu wynika z rzeczywistej geometrii viewportu, nie z
  magicznej liczby (GRID-01/02/08/12, SPACING-01/02/11).
- [x] **Typografia:** bez zmian rozmiaru, wysokości linii, wagi i copy; panel
  zachowuje istniejące tokeny tekstu.
- [x] **Kolory:** bez nowych kolorów; stany interakcji pozostają na istniejących
  tokenach (COLOR-07).
- [x] **Obramowania:** bez zmian obrysu kanwy i panelu; nadal `border-box`,
  `stroke-weak` i istniejące promienie (BORDER-02/05/07, BWIDTH-08,
  RADIUS-02/04).
- [x] **Cienie:** brak nowych warstw i cieni (SHADOW-01..05).
- [x] **Interakcje:** pan ma pierwszeństwo przed dismiss/draw; niewidoczne
  warstwy nie blokują gestu; no-op zoom nie konsumuje koła (COLOR-07,
  OVERLAY-06, OPACITY-02).
- [x] **Komponenty:** brak inline kontrolek i brak nowego komponentu; zmiany
  pozostają w istniejących `RegionOverlay` i `AnnotationPopover`.

## Plan regresji

- Vitest: marker intencji panu, ochrona panelu/preview, Spacja na chipie oraz
  zachowanie Spacji w polach tekstowych; no-op wheel przy 1× i 8×.
- Chromium: realny middle-pan i `Spacja` + LMB przy 125%, z otwartym panelem,
  niezapisanym nudgem i zerem requestów; osobne pomiary 1280×1000 i 1440×1000.
- Visual QA: viewport-only screenshot z otwartym panelem oraz dolną krawędzią
  panelu wewnątrz `innerHeight`.
- Pełna bramka `scripts/check.ps1`: 9/9, zero SKIP.
