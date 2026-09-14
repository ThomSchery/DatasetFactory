# FE-014 — log implementacji

## 2026-09-14 — Design Plan przed zmianą UI

### Zakres i teza przestrzenna

Tryb powierzchni: **Operate**. Głównym obiektem pracy pozostaje kadr, a wąska
kolumna po jego lewej stronie skupia kontekst i operacje dotyczące zaznaczonej
anotacji. Toolbar prowadzi na pełnej szerokości. Pod nim kolejność wizualna i DOM
jest taka sama: kolumna boczna po lewej, kadr po prawej. W kolumnie: „Bieżąca
klatka / Anotacje na klatce”, dialog „Anotacja”, „Dane klatki”.

Stała szerokość kolumny: **288 px** (`4 × --size-xxl + --size-lg`, 36 jednostek
siatki po 8 px). Jest dość szeroka dla kontrolki klasy i pojedynczej kolumny
metadanych, a zarazem pozostaje wyraźnie pomocnicza wobec kadru. Z przerwą
`--size-md` kosztuje przewidywalne 312 px szerokości kadru. Dla bazowego pomiaru
1279 px przy 1920×1080 daje prognozę 967 px, czyli 27 px zapasu nad twardą
granicą 940 px. Rzeczywisty pomiar przeglądarkowy jest bramką przed dalszym
dopasowaniem testów i visual QA.

### Dwie oceny układu

1. **Ocena strukturalna:** kadr jest największym polem i zachowuje pierwszeństwo
   w teście zmrużonych oczu. Kolumna grupuje treść według przebiegu pracy:
   wybór bboxa → edycja wybranego bboxa → metadane i komunikaty stanu. Wewnętrzne
   odstępy komponentów pozostają mniejsze od 24 px między panelami. Minimalny
   wspierany viewport pozostaje 1280 px; zgodnie z ticketem kolumna nie reflowuje
   pod kadr. Długie nazwy klas korzystają z istniejącego ellipsis/overflow-wrap,
   lista klas jest przewijana, a dialog zachowuje limit wysokości do krawędzi
   viewportu. DOM i fokus nie będą odwracane przez `order` ani `row-reverse`.
2. **Skan mechaniczny:** `detect.mjs --json --scope layout` dla `FrameEditor.tsx`,
   `AnnotationReviewScreen.css` i `AnnotationPopover.tsx` zwrócił `[]`. Kod
   zastany nie zawierał wykrytych naruszeń mechanicznych; po zmianie skan zostanie
   powtórzony wraz z kontrolą overflow i geometrii w przeglądarce.

### Wszystkie elementy interfejsu objęte planem

| Element | Plan | Komponent / kontrakt |
|---|---|---|
| Toolbar: filtry, wybór klatki, nawigacja, decyzje | pozostaje nad obiema kolumnami na pełną szerokość | `FrameToolbar`, istniejące `Button` i `SelectField` |
| Kolumna boczna | nowy semantyczny kontener DOM, 288 px, pionowy rytm 24 px | zwykły kontener układu; brak nowego komponentu `common` |
| „Bieżąca klatka / Anotacje na klatce” | pierwszy panel kolumny | istniejący `Panel`, `ClassList`, `StatusBadge`, `GroupedOptionList`, `Button` |
| Dialog „Anotacja” | przeniesiony z `__preview` jako drugi element kolumny; bez zmiany logiki formularza i bramy 409 | istniejący `AnnotationPopover` |
| „Dane klatki” | trzeci panel kolumny; `DataList` przechodzi naturalnie do jednej kolumny | istniejący `Panel`, `DataList`, `StatusBadge`, `Notice`, warunkowy `Button` retry |
| Kadr i bbox | prawa, elastyczna kolumna; sam HUD/zoom i geometria bez zmian | `RegionOverlay` wewnątrz `__preview` |
| Loading / FatalError klatki | pełna szerokość pod toolbarem, gdy kolumna nie jest renderowana | istniejące `Loading`, `FatalError` |
| Komunikaty błędu i stanów terminalnych | pozostają w „Dane klatki” | `InlineError`, `Notice` |

### Moduły i ID UI/UX

- **Siatka i odstępy:** GRID-00/01/02 (288 px i wszystkie przerwy na siatce
  8 px), GRID-08/10/12 (ograniczenie szerokości kontrolek, brak proporcjonalnego
  skalowania), SPACING-01/02/06/07/11 (grupowanie, 24 px między panelami i
  kadrem, przestrzeń wokół obrazu).
- **Typografia:** TYPO-02..11, FONTSIZE-02..10, LHEIGHT-09/10/11 i
  LSPACE-02/03/09 pozostają odziedziczone z istniejących komponentów; zmiana nie
  dodaje nowych rozmiarów, wag ani krojów.
- **Kolor:** COLOR-01..10 pozostają obsłużone przez istniejące tokeny
  semantyczne; bez nowych kolorów.
- **Obramowania i promienie:** BORDER-02/03/05/07, BWIDTH-01/02/13 oraz
  RADIUS-02/03 pozostają w `Panel`, `AnnotationPopover` i `RegionOverlay`; bez
  nowego obramowania strukturalnego.
- **Cienie:** SHADOW-03 nie ma zastosowania do nowego kontenera; nie powstaje
  nowa warstwa ani elevation.
- **Interakcje:** GRID-05, COLOR-07, OPACITY-02 i BORDER-06 pozostają własnością
  komponentów `common`; stany hover/active/disabled/focus nie zmieniają się.

### Checklista obowiązkowa

- [x] Layout/Siatka: `--size-md` dla przerw; 288 px wyliczone z
  `--size-xxl`/`--size-lg` (GRID-01/02).
- [x] Typografia: istniejące tokeny `--font-size-*`, `--line-height-*`,
  `--font-weight-*`; bez zmian (FONTSIZE-*, LHEIGHT-*, TYPO-*).
- [x] Kolory: wyłącznie istniejące `--color-*`; bez zmian (COLOR-*).
- [x] Obramowania: istniejące stroke-weak/strong i radius komponentów; bez zmian
  (BORDER-*, BWIDTH-*, RADIUS-*).
- [x] Cienie: brak nowego cienia; istniejące komponenty nie zmieniają elevation
  (SHADOW-03).
- [x] Interakcje: istniejące hover/active/disabled/focus; plan obejmuje granicę
  skrótów i kolejność Tab (COLOR-07, OPACITY-02, BORDER-06, GRID-05).
- [x] Komponenty: katalog `common` sprawdzony; używane są istniejące `Button`,
  `Panel`, `DataList`, `Notice`, `StatusBadge`, `GroupedOptionList`,
  `RegionOverlay` i stany `UiStates`; brak nowego komponentu wspólnego.

### Granice interakcji i kolejność fokusa

„Wnętrze panelu” dla `Enter` i outside-dismiss oznacza wyłącznie dialog
`AnnotationPopover`, oznaczony `data-annotation-popover`. Kanwa oraz pozostała
część lewej kolumny są poza dialogiem. Kliknięcie „Dane klatki” zatem kończy
kontekst edycji i porzuca niezapisany preview tak samo jak dotychczasowe
kliknięcie poza dokowanym dialogiem; poszerzenie granicy na całą kolumnę
zostawiałoby niewidoczny dialog zamknięty semantycznie, ale aktywny stan
geometrii. Wyjątki dla własnego bboxa, wyboru tej samej anotacji, zoomu i gestu
pan pozostają bez zmian.

Po toolbarze Tab przechodzi zgodnie z DOM i obrazem: kontrolki „Anotacje na
klatce” → kontrolki otwartego „Anotacja” → ewentualna kontrolka retry w „Dane
klatki” → kontrolki kanwy. Otwarcie dialogu nadal jawnie przenosi fokus do pola
„Klasa” przez istniejące `autoFocus`.

### Próby i środowisko

- Pierwsza próba bazowego E2E nie uruchomiła żadnego testu: świeży worktree nie
  miał ignorowanych `.venv`, `frontend/node_modules` i `.env`. Podłączono lokalne
  junctiony do instalacji z `D:\my\Projects\DatasetFactory` i skopiowano
  ignorowany `.env`, bez zmiany plików śledzonych.
- Druga próba zatrzymała się w preflight Playwright: port 8000 był zajęty przez
  aplikację operatora. Procesu nie zatrzymano; konflikt zgłoszono koordynatorowi.

