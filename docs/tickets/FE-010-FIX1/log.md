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

## Implementacja

### Pan i outside-dismiss

- `RegionOverlay` zapisuje natywny `pointerdown` rozpoznany jako pan w
  `WeakSet<Event>`. Dokumentowy listener `AnnotationPopover` sprawdza ten sam
  obiekt zdarzenia i pomija wyłącznie ten jeden gest. Zwykły pointerdown poza
  panelem nadal go zamyka i nie ma utrzymywanej flagi, która mogłaby przeciec do
  następnego gestu.
- Guard Spacji traktuje jako edytowalne tylko `input`, `textarea`, `select` i
  `contenteditable`. Zwykły przycisk z fokusem nie blokuje panu, gdy wskaźnik
  znajduje się nad kanwą; poza kanwą zachowuje natywne zachowanie przycisku.
- Testy komponentu i ekranu liczą stan panelu, marker preview, geometrię i
  mutacje po `pointerdown`, w trakcie ruchu i po `pointerup` dla obu gestów.

### Panel w wysokości viewportu

- `AnnotationPopover` mierzy `innerHeight - panel.top` w `useLayoutEffect` i
  zapisuje wynik do lokalnej zmiennej CSS. Aktualizacja następuje przy resize,
  scrollu oraz zmianie rozmiaru poprzedzającego `RegionOverlay`.
- `ResizeObserver` nie obserwuje panelu. Jego `max-height` nie jest zatem
  wejściem do kolejnego pomiaru; zmiana może wpłynąć tylko na dolną krawędź.
- `overflow-y: auto` pojawia się wyłącznie wtedy, gdy naturalna wysokość
  panelu przekracza dostępny budżet. Obraz i jego dotychczasowy limit wysokości
  nie zostały zmienione.

### Granice zoomu

- `preventDefault()` następuje dopiero po obliczeniu skali i odrzuceniu no-opu.
  Wewnątrz 1×–8× zoom nadal jest przechwytywany; na podłodze 1× i suficie 8×
  zdarzenie zostaje dla przeglądarki.

## Próby, błędy i korekty sond

1. Nowe testy uruchomione przed implementacją dały oczekiwane **4 FAIL**:
   no-op wheel przy 1×, Spacja z fokusem przycisku, zamknięcie panelu przez
   middle-pan i narysowanie draftu zamiast Space-pan. Pozostałe 55 testów w
   tych plikach przechodziło.
2. Po zmianie produktu ten sam zestaw dał **59/59 PASS**.
3. Pierwsza rozszerzona sonda Chromium nie trafiła kółkiem w kanwę, ponieważ
   kliknięcie chipa przewinęło stronę, a test zachował wcześniejszą
   współrzędną. Sondę poprawiono przez powrót scrolla do początku i
   `focus({ preventScroll: true })`; kod produktu nie wymagał korekty.
4. Repozytorium nie definiuje osobnego skryptu `npm run lint`; rolę statycznej
   bramki frontendu pełnią `typecheck`, Vitest, build i detektor UI w oficjalnym
   `scripts/check.ps1` oraz opisanym niżej przebiegu Impeccable.

## Pomiary Chromium po fixupie

Fixture visual QA, skala 1×, panel otwarty:

| Viewport | `image.width` | `image.height` | `panel.top` | `panel.bottom` | `innerHeight` |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1280 × 1000 | 829,266 px | 551,984 px | 769,781 px | 999,781 px | 1000 px |
| 1440 × 1000 | 829,266 px | 551,984 px | 769,781 px | 999,781 px | 1000 px |

Przed fixupem `panel.bottom = 1058 px`; po fixupie dolna krawędź ma
**0,219 px zapasu** i przechodzi asercję `panel.bottom <= innerHeight` w obu
szerokościach.

Ten sam realny run `b4a755c9-4e55-4142-bc09-50f7469e124b`, którym mierzono
FE-010 przed fixupem, przy 1440 × 1000 i wskaźniku zoomu 100%:

- `image.width = 981,296875 px`;
- `image.height = 551,984375 px`.

Szerokość 1× pozostaje zatem zgodna z wartością sprzed fixupu
**981,297 px**; przewijanie panelu nie pomniejszyło kanwy.

### Gesty i zdarzenia

- W realnym Chromium nudge `x=100→102`, panel `1`, marker niezapisanego
  przesunięcia `1` i zoom 125% pozostawały bez zmian po middle-pan oraz po
  `Spacja` + LMB z fokusem na chipie klasy. Po każdym kroku geometria nadal
  zawierała `x 102, y 120`; liczba mutujących requestów wynosiła **0**.
- Zwykłe kółko bez `Ctrl`: `defaultPrevented=false`.
- `Ctrl` + kółko wywołujące zmianę 100%→125%: przechwycone.
- `Ctrl` + kółko oddalające przy 1× oraz przybliżające przy 8×:
  `defaultPrevented=false` na obu końcach.
- Cel i znacznik uchwytu zachowują kontrakt FE-010: hit target ma 10 × 10
  jednostek źródła przy 1× i 1,25 × 1,25 przy 8×, co daje stały ślad
  około 10,4 × 10,4 CSS px na obu końcach zakresu.

## Wynik końcowy

- Impeccable detector, zakres `layout`, zmienione pliki UI: **0 findingów**.
- Viewport-only screenshot 1440 × 1000 z otwartym panelem:
  `docs/tickets/FE-001/screenshots/annotations-1440.png`; obejrzany w pełnej
  rozdzielczości.
- Pełny, nieprzerwany `scripts/check.ps1`: **PASS 9/9, 0 SKIP**.
  - backend format/lint/mypy: PASS;
  - backend testy: **347/347**;
  - frontend typy: PASS;
  - frontend testy: **605/605** w 40 plikach;
  - build: PASS (wyłącznie istniejące ostrzeżenie o chunku >500 kB);
  - Chromium E2E: **6/6**;
  - bezpieczeństwo katalogu E2E: **2/2**.

Dziewięć niezmienników FE-009 przechodzi w pełnym suite: outside-dismiss z
tym samym gestem rysowania, ochrona własnego bboxa, brak Escape, pusty Enter,
remount tylko przy zmianie anotacji, zachowanie draftu po błędzie, 0 PATCH dla
strzałek i jeden dla Enter, izolacja baseline gestu oraz zadokowanie panelu pod
obrazem.
