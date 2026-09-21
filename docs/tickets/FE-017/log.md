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

Czyli w pasmie okien **1280–1294 px** poprawka zamienia przewijanie
**warunkowe na bezwarunkowe**: przed nią aplikacja przewijała się w poziomie o
15 px w tym pasmie za każdym razem, gdy strona przewijała się w pionie, teraz
robi to zawsze. **To świadomy wybór, nie regresja.** Zgodnie z FE-07 powłoka
deklaruje 1280 px szerokości roboczej i ma się nie ściskać, więc gdy
przeglądarka daje 1265 px użytecznych, uczciwym wynikiem jest przewijanie, nie
ściśnięcie kanwy o 15 px. Druga strona tego wyboru domyka sprawę: pozwolenie
powłoce na ściśnięcie przywróciłoby dokładnie naprawiany błąd — szerokość kanwy
znów zależałaby od tego, czy pasek akurat jest.

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

---

## B. Panel „Anotacje na klatce”

- Usunięto nadtytuł „BIEŻĄCA KLATKA”. Zostały tytuł panelu oraz licznik
  aktywnych anotacji.
- Usunięto plakietki źródła `OCR`/`Ręczna` z wierszy listy oraz nagłówka panelu
  anotacji. `confidence` OCR pozostało — to liczba dotycząca boxa, nie usunięta
  etykieta pochodzenia.
- Wiersz klasy zajmuje pełną szerokość listy, nazwa jest po lewej, licznik po
  prawej. Nazwa ma `overflow-wrap` i nie jest obcinana wielokropkiem.
- Test E2E mierzy szerokość wiersza względem listy oraz właściwości przepełnienia
  długiej nazwy, zamiast rozstrzygać to samym zrzutem.

## C. Klasy poprzedniej klatki z jednego źródła prawdy

### Trasa

`GET /api/v1/frames/{frame_id}/annotations/previous-classes`

```json
{
  "previous_frame_id": "frame-previous-or-null",
  "previous_frame_index": 16,
  "classes": [
    { "category_id": "hud-health", "count": 3 }
  ]
}
```

- `previous_frame_id: null`, `previous_frame_index: null`, `classes: []` oznacza
  brak poprzedniej klatki.
- Niepuste `previous_frame_id` i puste `classes` oznacza istniejącą poprzednią
  klatkę bez aktywnych anotacji.
- Klasy są zliczane po `category_id`, w kolejności `Category.ordinal`; anotacje
  `deleted` i klasy z obcego profilu nie są oferowane.
- Wspólny helper repozytorium `_previous_frame` wybiera największy
  `frame_index < current.frame_index` w tym samym runie, niezależnie od statusu
  review. Korzystają z niego zarówno odczyt, jak i `copy_previous`.
- Frontend nie używa już `frame_index === 0` ani przefiltrowanej listy klatek do
  odgadywania sąsiada. Pokazuje wyłącznie klasy z odpowiedzi backendu, wraz z
  liczbą wystąpień, i rozróżnia oba puste stany osobnymi komunikatami.

## D. Natychmiastowy zapis narysowanego boxa

### Reguła klasy domyślnej

Ostatnia klasa użyta w bieżącej sesji edytora runu; przed pierwszym użyciem —
pierwsza klasa profilu według `ordinal`. Pamięć żyje nad komponentem pojedynczej
klatki, więc przechodzi między klatkami tego runu, ale nie jest ukrytym stanem w
`localStorage`.

### Przepływ i widoczność decyzji automatycznej

1. Zakończenie gestu rysowania wysyła dokładnie jeden
   `POST /frames/{id}/annotations` z bboxem i klasą domyślną.
2. Panel przechodzi na id anotacji zwrócone przez backend i w nagłówku pokazuje
   plakietkę marki `PRZYPISANO: <klasa>`. Umieszczenie jej w istniejącym wierszu
   nagłówka nie wypycha akcji poza viewport 1440×1000.
3. Kliknięcie innej klasy w tym stanie natychmiast wysyła jeden `PATCH` — bez
   drugiego kliknięcia potwierdzającego. Zwykła edycja zapisanej anotacji nadal
   wymaga przycisku „Zmień nazwę”.
4. „Porzuć box” wysyła wersjonowany `DELETE` zapisanej anotacji.
5. `pendingCreated` utrzymuje id i geometrię między odpowiedzią `201` a refetchem
   klatki. Porównanie epoki kontekstu z FE-015-FIX2 nie pozwala spóźnionej
   odpowiedzi ponownie otworzyć panelu po odejściu operatora od boxa.

„Zmień nazwę” w tym panelu zmienia klasę jednego boxa. Tak samo nazwany przycisk
z FE-016 zmienia nazwę klasy w całym profilu. Rozbieżny zasięg jest świadomy i
pozostaje zgodny z poleceniem operatora.

## Falsyfikowalność A, C i D

Każda sonda została uruchomiona po celowym cofnięciu właściwej poprawki, a plik
odtworzono przez `Copy-Item`, nie przez `git restore`.

| Część | Celowo cofnięta własność | Oczekiwana porażka |
|---|---|---|
| A | `scrollbar-gutter: stable` dokumentu | test E2E: `Expected: 1383, Received: 1368` — dokładnie 15 px |
| C | zgodność filtrów trasy z `copy_previous` | test backendu: `assert 3 == 4` — trasa zaoferowała klasę, której kopiowanie nie skopiowało |
| D | natychmiastowe wywołanie mutacji `create` po narysowaniu | test frontendu: `expected [] to have a length of 1` — nie wyszedł wymagany POST |

Po każdym odtworzeniu docelowy test znów przechodził, a `git diff --check` nie
wykazał pozostałości sondy. Tymczasowe `fe017-probe.spec.ts` i
`playwright.probe.config.ts` zostały usunięte przed bramką; trwały test A ma
lokalne dla pliku `ignoreDefaultArgs: ["--hide-scrollbars"]`.

## Visual QA — oględziny pełnej rozdzielczości

Sprawdzone ręcznie wszystkie sześć plików w `docs/tickets/FE-017/screenshots/`,
osobno przy 1440×1000 i 1920×1080, bez `fullPage`:

- **Panel anotacji:** tytuł i plakietka liczby są czytelne; nadtytułu i
  plakietek źródła nie ma. Wiersze wykorzystują szerokość kolumny. Inspektor ma
  własny pionowy pasek przewijania i nie wchodzi na kanwę.
- **Kopiowanie:** po przewinięciu inspektora widoczne są tylko klasy źródła:
  `health & armour — 1` oraz `7 — 3`; `Score` nie występuje. Liczniki tworzą
  prawą kolumnę, długie nazwy nie są obcięte, poziomego paska nie ma.
- **Narysowany box:** nagłówek „Nowa anotacja · box” pokazuje
  `PRZYPISANO: 7`; „Porzuć box” i „Zmień nazwę” są jednocześnie w viewporcie.
  Panel nie przekracza prawej krawędzi kolumny, a box, uchwyty i prowadnice są
  widoczne na kanwie.
- Przy 1440×1000 układ jest zwarty, lecz akcje nadal mieszczą się bez
  przewijania panelu. Przy 1920×1080 kanwa wykorzystuje dodatkowe miejsce bez
  zmiany szerokości kolumny bocznej.

Wyszarzenie całego interfejsu podczas zapisu nadal jest zauważalne, ale przy
krótkiej mutacji nie wyglądało na zawieszenie; zgodnie z ticketem nie zmieniano
tego zachowania.

## Weryfikacja i pełna bramka

- backend `pytest -q`: **374/374 PASS**;
- frontend Vitest po teście spóźnionej odpowiedzi: **681/681 PASS**;
- frontend `tsc --noEmit`: **PASS**;
- test spóźnionego `POST`: zapisany box pojawia się po refetchu, lecz panel
  pozostaje zamknięty i nie wraca znacznik automatycznego przypisania;

### Pierwszy przebieg bramki — znalezisko i poprawka testów

Pierwszy pełny przebieg doszedł do E2E i ujawnił dwie stare asercje przepływu
szkicu: `vertical-flow.spec.ts` oraz `visual-qa.spec.ts` nadal oczekiwały panelu
„Wybierz klasę dla nowego bbox” i zera mutacji po rysowaniu. Produkt zachowywał
się prawidłowo według FE-017 D — wysyłał `POST` i pokazywał zapisaną anotację.
Dlatego przebieg zakończył się **2 FAIL / 21 PASS** w E2E i jednym SKIP
(`E2E root safety`, po przerwaniu bramki na pierwszym błędzie).

Commit `7eb7516` przepisał te asercje na nowy kontrakt:

- jeden `POST` na każdy gest rysowania;
- jawne `przypisano: 7` po zapisie;
- pointerdown zamykający panel pierwszego zapisanego boxa nadal zaczyna drugi;
- „Porzuć box” drugiego boxa wysyła `DELETE`, a backend zachowuje tombstone;
- zrzut FE-017 czeka na odpowiedź `previous-classes`, więc nie ściga się ze
  stanem ładowania inspektora.

Oba długie testy uruchomione razem po poprawce: **2/2 PASS**.

### Końcowy, nieprzerwany przebieg 9/9

Polecenie uruchomione jeden raz od początku do końca, z absolutną ścieżką:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\t.wisniewski\.traycer\worktrees\thomschery__datasetfactory\feat-fe-017-editor-flow-and-layout-jump\scripts\check.ps1"
```

| Bramka | Wynik | Czas |
|---|---:|---:|
| backend format | PASS | 0,2 s |
| backend lint | PASS | 0,1 s |
| backend typy | PASS | 1,7 s |
| backend testy | PASS — 374/374 | 324,7 s |
| frontend typy | PASS | 1,1 s |
| frontend testy | PASS — 681/681 | 37,8 s |
| frontend build | PASS | 1,7 s |
| E2E | PASS — 23/23 | 94,2 s |
| E2E root safety | PASS — 2/2 | 0,6 s |

**Wynik: 9/9 PASS, zero SKIP.** Ostrzeżenie Vite o chunku większym niż 500 kB
pozostało ostrzeżeniem; nie jest nowym błędem FE-017.

---

## FE-017-FIX1 — plan poprawki po cold review

Cold review odtworzył lukę w regule klasy domyślnej: udane
`create-category` przypisywało nową klasę do boxa, ale nie przekazywało jej id do
pamięci sesji. Następny box wracał przez to do pierwszej klasy profilu.

### Design Plan

Poprawka nie zmienia wyglądu, tekstów ani struktury DOM. Korzysta z istniejącej
trasy `FrameEditor → AnnotationPopover` i tylko przesuwa informację o id nowej
klasy z wyniku mutacji do pamięci sesji po udanym przypisaniu.

- [x] **Layout/Siatka (GRID-01/02):** bez zmian; panel i kanwa zachowują
      istniejący układ.
- [x] **Typografia (FONTSIZE-*, LHEIGHT-*, TYPO-*):** bez zmian.
- [x] **Kolory (COLOR-*):** bez zmian.
- [x] **Obramowania (BORDER-*, RADIUS-*):** bez zmian.
- [x] **Cienie (SHADOW-*):** bez zmian.
- [x] **Interakcje (COLOR-07, OPACITY-*):** bez nowych stanów; istniejące
      powodzenie/błąd mutacji i granica kontekstu pozostają bez zmian.
- [x] **Komponenty (katalog §4–5):** istniejące `AnnotationPopover`,
      `GroupedOptionList` i `RegionOverlay`; bez nowego komponentu wspólnego.

### Decyzja dla `409 category_name_exists`

Klasa istniejąca, do której panel prowadzi po konflikcie nazwy, staje się
ostatnio użyta **dopiero po udanym finalnym przypisaniu** (`PATCH` dla zapisanej
anotacji albo `POST` dla draftu). Uzasadnienie: pamięć ma opisywać klasę, której
operator rzeczywiście użył, a nie sposób jej odnalezienia. `409` samo w sobie nie
zmienia pamięci; udane przypisanie zwycięskiej klasy robi to tak samo jak zwykły
wybór istniejącej klasy.

### Zakres testów

- nowa klasa przypisana zapisanej anotacji (`existing`) zasila następny draw;
- nowa klasa przypisana draftowi (`draft`) zasila następny draw;
- utworzenie klasy zakończone nieudanym przypisaniem nie zmienia pamięci;
- spóźnione powodzenie po utracie kontekstu nie zmienia pamięci.

### Implementacja i weryfikacja lokalna

`create-category` zwraca teraz oznaczony wynik zawierający `categoryId` oraz
wynik przypisania. `onSuccess` przekazuje id do `onCategoryUsed` tylko wtedy,
gdy cały łańcuch utworzenie → przypisanie zakończył się powodzeniem i mutacja
nadal posiada kontekst selekcji. Ten sam warunek obowiązuje dla `existing` i
`draft`; błąd przypisania po udanym utworzeniu klasy nie aktualizuje pamięci.

- `annotationReviewFlow.test.tsx`: **75/75 PASS**;
- cztery regresje FIX1 uruchomione osobno po falsyfikacji: **4/4 PASS**;
- `npm run typecheck`: **PASS**.

Falsyfikacja: zapisano poprawiony `FrameEditor.tsx`, usunięto wyłącznie oba
wywołania `onCategoryUsed` dla `create-category` i uruchomiono regresję
`existing`. Test padł dokładnie na:

```text
Expected: "score"
Received: "category-1"
```

Plik odtworzono przez `Copy-Item`; SHA256 kopii i pliku po odtworzeniu:
`DC2A08E7EB0CA115AAEFACA60F8AC67F1B7F4737DD1D66154D4212EADA654B67`.

### `api.created` między viewportami visual spec

Przeniesienie stanu z 1440 do 1920 jest celowe i jawne w komentarzu testu:
oba viewporty należą do jednego scenariusza z jednym `ApiHarness`, a asercja
licznika liczy przyrost względem `countBefore`, dzięki czemu drugi przebieg
sprawdza dodanie do już niepustego stanu. Nie jest to izolowany snapshot test;
zrzuty są dokumentacją tego scenariusza. Zgodnie z rozstrzygnięciem P3 nie
zmieniano speca ani PNG w FIX1.

### PNG po bramce

Visual specy nadpisały 25 historycznych plików. Pomiar wykonano na obrazach
`RGB`, nie przez `getbbox()` na RGBA. To nie był znany dryf 9 pikseli:
`FE-001/error-1440.png` różnił się w **3906 pikselach**, bbox
`(312,85)–(1408,325)`, max delta **212**; pozostałe historyczne zrzuty miały od
3375 do 198001 różnych pikseli. To były ponowne rendery dzisiejszego UI nad
historycznymi dowodami ticketów, nie nowe artefakty do zatwierdzenia.

Sześć zrzutów FE-017 różniło się w obrębie inspektora, bo wspólna konfiguracja
bramki uruchamia Chromium z `--hide-scrollbars`, a zatwierdzone i obejrzane
zrzuty FE-017 powstały w sondzie z widocznymi paskami — w środowisku zgodnym z
przeglądarką operatora i błędem A. Wszystkie 25 PNG odtworzono bajt w bajt z
HEAD przez `Copy-Item`; po zakończeniu bramki porty 8000, 5173 i 5174 nie miały
nasłuchu.
