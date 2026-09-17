# FE-017 — log

Baza: `main` = `eb568d4`. Gałąź `feat-fe-017-editor-flow-and-layout-jump`.

---

## A. Pomiar: który pasek przewijania powodował skok

### Narzędzie

Ports 8000 i 5173 zajmuje aplikacja operatora, więc sonda dostała własną
konfigurację Playwrighta (`frontend/playwright.probe.config.ts`, plik tymczasowy)
z serwerem Vite na **5199** i bez serwera backendu — cały ruch `/api/v1/**`
przechwytuje `ApiHarness` w przeglądarce, więc żaden request nie wychodzi na
port operatora.

### Pierwsze dwa przebiegi: delta 0 — i dlaczego to nie był brak błędu

Pierwsza sonda mierzyła `canvasRight` przy pojawieniu się i zniknięciu
„Niezapisane” i dawała **0 px** na wszystkich viewportach. Dwie przyczyny
fałszywego spokoju, obie usunięte:

1. **Profil testowy ma jedną klasę.** Panel anotacji był wtedy tak niski, że nic
   się nie przelewało. Sonda dostała profil wielkości roboczej operatora
   (38 klas: 19 `character`, 19 `game`), co odtworzyło wysokość panelu.
2. **Playwright uruchamia Chromium z `--hide-scrollbars`.** Paski przewijania w
   trybie headless mają zerową szerokość, czyli dokładnie te 15 px, o które
   chodzi w zgłoszeniu, w ogóle nie istnieją. Sonda dostała
   `launchOptions.ignoreDefaultArgs: ["--hide-scrollbars"]`.

To jest powód, dla którego bramka nigdy tego nie złapała: **cała dotychczasowa
suita E2E biegnie w przeglądarce bez pasków przewijania.**

### Pomiar rozstrzygający (przed poprawką)

Anotacja zaznaczona, `ArrowRight` tworzy niezapisane przesunięcie, `Enter` z
`body` je zapisuje. Trzy stany: `baseline` (przed przesunięciem), `unsaved`,
`saved`.

| viewport | stan | `canvasRight` | `documentGutter` | `documentScrollHeight` | `popoverBottom` |
|---|---|---|---|---|---|
| 1440×1000 | baseline | 1383 | 0 | 1000 | 919,8 |
| 1440×1000 | **unsaved** | **1368** | **15** | **1032** | **999,8** |
| 1440×1000 | saved | 1383 | 0 | 1000 | 919,8 |
| 1280×1000 | unsaved | 1223 | 15 | 1032 | 999,8 |
| 1920×1000 | unsaved | 1848 | 15 (też w `saved`) | 1056 | 999,8 |
| 1920×1080 | unsaved | 1863 | 0 (też w `saved`) | 1080 | 1029,8 |

**Odpowiedź: pasek DOKUMENTU.** Na 1440×1000 `canvasRight` przeskakuje
1368 → 1383, czyli dokładnie 15 px zgłoszone z nagrania, a jednocześnie
`documentGutter` (`window.innerWidth - documentElement.clientWidth`) spada
15 → 0. Paski kontenerów w tym samym czasie robią coś innego i nieistotnego:
`inspectorGutter` wynosi 12 px **w każdym stanie** (inspektor jest przewijany
zawsze), a `popoverGutter` 12 → 2, czyli pasek panelu pojawia się i znika — ale
panel stoi w kolumnie o stałej szerokości `--df-review-side-column-width`, więc
nie może przesunąć kanwy o ani jeden piksel.

### Łańcuch przyczynowy

Plakietka „Niezapisane” dokłada **110 px** treści do panelu anotacji
(`popoverBottom` 919,8 → 1029,8 przy wysokości okna 1080). Panel ma
`max-height: var(--df-annotation-popover-viewport-room)` liczone jako
`innerHeight − popover.top`, więc przy oknie 1000 px dobija do dolnej krawędzi
okna (999,8) i zatrzymuje się. Pod nim zostaje jednak `padding: var(--size-lg)`
powłoki `.df-shell__main`, więc dokument rośnie do 999,8 + 32 = **1031,8** przy
oknie 1000 px → przelewa się o 32 px → pojawia się pasek dokumentu → szerokość
dostępna dla układu spada o 15 px → kolumna `minmax(0, 1fr)` z kanwą zwęża się →
kanwa i wszystkie boksy przesuwają się w lewo. Zapis usuwa plakietkę, dokument
znów się mieści, pasek przepada, 15 px wraca.

Zgodność z zakresem okna: skok istnieje tylko wtedy, gdy dokument mieści się bez
plakietki i nie mieści się z nią. Przy 1920×1000 dokument przelewa się w obu
stanach (`documentGutter` 15/15), a przy 1920×1080 w żadnym (0/0) — w obu tych
przypadkach delta wynosi 0 także **przed** poprawką. Okno operatora
(1440×1000) leży dokładnie w oknie błędu, co potwierdza ustalenie z FE-015 o
„ledwo mieści się”.

### Poprawka

1. `frontend/src/styles/global.css` — `html { scrollbar-gutter: stable; }`.
   Szerokość dostępna dla układu przestaje zależeć od tego, czy treść akurat się
   przewija. Rezerwacja słowem kluczowym, nie długością: szerokość paska to
   liczba platformowa (15 px), a nie wartość ze skali 8-punktowej, więc
   `padding-right: 15px` łamałby GRID-01.
2. `AnnotationPopover.tsx` — `--df-annotation-popover-viewport-room` liczone z
   `document.documentElement.clientHeight`, nie z `window.innerHeight`. Poziomy
   pasek przewijania zabiera wysokość okna, a panel ograniczony do `innerHeight`
   wkłada ostatni wiersz akcji pod ten pasek. Ta sama zasada, co punkt 1: układ
   nie może udawać, że paski nie istnieją.

### Pomiar po poprawce

| viewport | `canvasRight` baseline / unsaved / saved | delta |
|---|---|---|
| 1280×1000 | 1223 / 1223 / 1223 | 0 |
| 1440×1000 | 1368 / 1368 / 1368 | **0** |
| 1920×1000 | 1848 / 1848 / 1848 | 0 |
| 1920×1080 | 1848 / 1848 / 1848 | 0 |

### Skutek uboczny, zmierzony i zgłoszony

`.df-shell` ma `min-width: var(--workspace-min-width)` = 1280 px, a
zarezerwowany rynienka zabiera 15 px szerokości treści. Sonda pyta o to
przewijaniem (`window.scrollTo(9999, 0)` i odczyt `window.scrollX`), bo
`scrollWidth` i `clientWidth` oba liczą rynienkę i wzajemnie ją znoszą:

| viewport | zasięg przewijania w poziomie |
|---|---|
| 1280×1000 | **15 px** |
| 1440×1000 | 0 |
| 1920×1000 | 0 |
| 1920×1080 | 0 |

Czyli w pasmie okien **1280–1294 px** aplikacja przewija się w poziomie o 15 px
na stałe. Przed poprawką to samo działo się w tym pasmie za każdym razem, gdy
strona przewijała się w pionie — poprawka czyni to bezwarunkowym. To świadomy
wybór, zgodny z FE-07: powłoka deklaruje 1280 px szerokości roboczej i ma się
nie ściskać, więc gdy przeglądarka daje 1265 px użytecznych, uczciwym wynikiem
jest przewijanie, nie ściśnięcie kanwy o 15 px.

---

## Design Plan (obowiązkowy, `new-component.md` §2.2)

Tokeny odczytane z `frontend/src/styles/tokens.css`. Moduły wytycznych
przeczytane w całości: **Siatka i Odstępy** (GRID-00..14, SPACING-01..13),
**Kolor** (COLOR-01..10), **Obramowanie** (BORDER-01..09), **Szerokość
Obramowania** (BWIDTH-01..12), **Typografia** (TYPO, FONTSIZE, LHEIGHT, LSPACE,
PARASPACE), **Wielkość Liter** (CASING).

### Elementy interfejsu objęte zadaniem

| # | Element | Część | Zmiana |
|---|---|---|---|
| 1 | `html` (dokument) | A | rezerwacja rynienki paska przewijania |
| 2 | `AnnotationPopover` — pomiar miejsca | A | źródło wysokości okna |
| 3 | `Panel` „Anotacje na klatce” — nadtytuł | B | usunięcie `eyebrow` |
| 4 | `ClassList` — wiersz listy | B | pełna szerokość, łamanie nazwy, bez plakietek źródła |
| 5 | `AnnotationPopover` — nagłówek | B | bez plakietek `OCR`/`Ręczna` |
| 6 | Sekcja „Powtórz z poprzedniej klatki” — lista klas | C | tylko klasy źródła + liczniki |
| 7 | Sekcja „Powtórz z poprzedniej klatki” — komunikaty | C | dwa różne stany puste |
| 8 | `AnnotationPopover` — przycisk główny | D | „Zapisz” → „Zmień nazwę” |
| 9 | `AnnotationPopover` — wskazanie klasy przypisanej automatycznie | D | nowy element |

### Checklista

- [x] **Layout/Siatka (GRID-01/02, GRID-05, GRID-08/09):** wyłącznie tokeny
      `--size-xs` (8 px) i `--size-sm` (16 px) na odstępy w wierszach listy;
      wiersz listy zachowuje `min-height: var(--control-height-sm)` = 32 px
      (GRID-05, desktop hit area). Element 1 nie używa żadnej długości — słowo
      kluczowe `scrollbar-gutter: stable`, bo 15 px nie należy do skali
      8-punktowej (GRID-01). Nazwa klasy w wierszu łamie się (GRID-09: treść
      nie jest ucinana, żeby zmieścić się w kolumnie).
- [x] **Typografia (FONTSIZE-02..10, LHEIGHT-04/09/10, TYPO-07, LSPACE-07,
      CASING-02):** wiersz listy `--font-size-sm` / `--line-height-standard`;
      licznik wystąpień `--font-family-mono` + `font-variant-numeric:
      tabular-nums`, żeby liczby nie skakały w kolumnie. Hierarchię w nowym
      wskazaniu klasy niesie **waga** `--font-weight-semibold`, nie rozmiar
      (TYPO-07). Usuwany nadtytuł był jedynym `UPPERCASE` w tym panelu — po
      usunięciu w panelu nie zostaje żaden tekst wersalikami, więc LSPACE-07 nie
      ma już tu zastosowania.
- [x] **Kolory (COLOR-02/08/09/10):** bez nowych wartości. Nazwa klasy
      `--color-text-strong-default`, licznik i komunikaty pomocnicze
      `--color-text-weak-default`, wskazanie klasy automatycznej
      `--color-fill-brand-impeccable` (akcent, 10% z COLOR-02) — **nie** tonem
      `warning`, bo automatyczne przypisanie nie jest stanem błędu (COLOR-09
      zabrania używania zakresów statusu do znaczeń niestatusowych).
- [x] **Obramowania (BORDER-02/03/08, BWIDTH-06/10, RADIUS-05):** wiersze listy
      rozdziela biała przestrzeń, nie obramowanie (BORDER-02). Wskazanie klasy
      automatycznej dostaje jednostronny akcent `border-inline-start`
      `--border-width-emphasis` (2 px) w kolorze marki (BORDER-08), promień
      `--radius-md` (RADIUS-05). Bez nowych szerokości obramowań.
- [x] **Cienie (SHADOW-03):** żadnych. Panele tego ekranu nie mają elewacji i
      nic w tym zadaniu jej nie potrzebuje.
- [x] **Interakcje (COLOR-07, OPACITY-02, BORDER-06):** stany hover/active/
      disabled dziedziczone z `Button`; fokus z globalnego
      `:focus-visible` (`--focus-ring-width` + kolor marki). Nowe wskazanie
      klasy jest nieinteraktywne, więc nie ma własnych stanów — akcja
      korygująca to istniejący `Button`.
- [x] **Komponenty (katalog §4/§5):** `Button` (wszystkie akcje),
      `StatusBadge` (plakietka licznika anotacji i wskazanie klasy
      automatycznej), `Panel` (sekcja „Anotacje na klatce”),
      `GroupedOptionList` (lista klas w części C i w panelu anotacji),
      `Notice` (trwałe komunikaty stanu klatki), `UiStates.InlineError`
      (wynik pojedynczej akcji). **Żaden nowy komponent w `common/` nie jest
      potrzebny** — część D potrzebuje pigułki z nazwą klasy przy przycisku
      korekty, co jest dokładnie `StatusBadge` + `Button`, a nie nowym
      prymitywem.

### Decyzja: klasa domyślna dla natychmiastowego zapisu (część D)

Reguła: **ostatnia klasa przypisana w tej sesji edytora; przy jej braku pierwsza
klasa profilu w kolejności `ordinal`** (czyli w kolejności, w jakiej backend
zwraca `profile.categories`).

Uzasadnienie:

- **Przewidywalność przez powtarzalność pracy.** Operator anotuje klatka po
  klatce, zwykle te same klasy w serii. „To, co ostatnio” jest jedyną regułą,
  którą można przewidzieć bez patrzenia na listę.
- **Stan początkowy jest jawny, nie losowy.** Pierwsza klasa wg `ordinal` jest
  tą, którą operator sam ustawił jako pierwszą w profilu, i jest stabilna między
  sesjami.
- **Jeden zakres pamięci.** „Sesja edytora” = czas życia komponentu
  `LoadedFrameEditor` dla danego runu. Nic nie trafia do `localStorage`:
  pamięć, która przeżywa zamknięcie karty, byłaby regułą, której operator nie
  widzi i nie może przewidzieć po powrocie.
- Reguła jest odczytywalna z interfejsu: panel po zapisie nazywa klasę, którą
  przypisał, więc następne domyślne przypisanie jest widoczne z wyprzedzeniem.

### Naming — zgłoszenie z polecenia

„Zmień nazwę” w panelu anotacji = **zmień klasę tego jednego boxa** (jedna
anotacja, jedno `PATCH /annotations/{id}`). „Zmień nazwę” na ekranie profilu
(FE-016) = **zmień nazwę klasy w całym profilu** (wszystkie anotacje tej klasy,
`PATCH /profiles/{id}/categories/{id}`). Te same słowa, rozbieżny zasięg;
zaimplementowane zgodnie z poleceniem i odnotowane tutaj oraz w raporcie.
