# FE-010 — log implementacji

## Zakres wykonawczy

Implementacja jest celowo zawężona zgodnie z przekazaniem koordynatora do:

1. pełnoszerokiej kanwy ograniczonej wysokością viewportu,
2. numeru klatki w rogu obrazu,
3. metadanych, inspektora i komunikatów pod kanwą,
4. lokalnego, nieinteraktywnego celownika prowadzącego w `RegionOverlay`.

Zoom, pan, pionowy pasek narzędzi, wielokąty i pędzel pozostają poza tym
zakresem. Artefakt planistyczny opisuje zoom/pan, ale nowsze przekazanie
koordynatora jawnie odkłada je do kolejnego ticketu.

## Ocena układu przed zmianą

- **Reading order:** toolbar jest pierwszy, lecz dwukolumnowa siatka i kolejność
  DOM prowadzą następnie do inspektora, a dopiero potem do głównego zadania —
  obrazu. W samym podglądzie `DataList` i zmienne `Notice` stoją przed obrazem.
- **Grouping:** narzędzia edycji i metadane są poprawnymi grupami, ale zajmują
  przestrzeń krytyczną dla celowania zamiast wspierać kanwę poniżej niej.
- **Rhythm:** odstępy korzystają z tokenów; problemem nie jest rytm lokalny, lecz
  jednakowa ranga kolumn inspektora i podglądu.
- **Structure:** topologia `inspector preview` jest sprzeczna z zadaniem operatora.
  Kanwa musi prowadzić, a inspektor i dane wspierać ją po zakończeniu gestu.
- **Density:** nad obrazem znajduje się do czterech pól metadanych i kilka
  komunikatów warunkowych; ta gęstość pomniejsza obraz i może przesuwać overlay.
- **Adaptation:** wspierane minimum to desktop 1280 px. Na 1280 i 1440 px kanwa
  pozostaje pierwsza i pełnoszeroka; treści pomocnicze tworzą dwie kolumny pod
  nią, bez zmiany kolejności fokusowania względem DOM.
- **Extremes:** komunikaty błędu obrazu, terminalny status klatki, OCR w toku,
  niezapisana geometria i otwarty panel anotacji pozostają pod obrazem, więc ich
  pojawienie nie zmienia geometrii aktywnej kanwy.
- **Mechanical scan:** `impeccable detect --scope layout` zwrócił `[]` przed
  zmianą; brak istniejących wykrywalnych naruszeń do naprawy przy okazji.

## Spatial thesis

Ścieżka zadania to **toolbar → kanwa → dokowany panel anotacji → treści
wspierające**. Kanwa jest jedynym elementem prowadzącym. Numer klatki i celownik
należą do jej warstwy wizualnej; nie uczestniczą w hit-testingu. Inspektor,
metadane, komunikaty i błędy są oddzielone od obszaru gestu i układają się pod
nim. Rytm pozostaje kompaktowy wewnątrz grup (`--size-xs`/`--size-sm`) oraz
wyraźny między kanwą i zapleczem (`--size-md`/`--size-lg`).

## Design Plan

### Elementy interfejsu i stosowane wytyczne

| Element | Decyzja | Moduły / ID UI/UX |
| --- | --- | --- |
| Toolbar klatki | Bez zmian funkcjonalnych; nadal poprzedza kanwę i zajmuje pełną szerokość. | Grid & Spacing: GRID-01/02, SPACING-01; Typography: TYPO-07 |
| Kanwa (`RegionOverlay`) i obraz | Pełna szerokość obszaru roboczego, ograniczenie wysokością viewportu, zachowanie proporcji i obrysu obrazu. | Grid & Spacing: GRID-01/02/08/12, SPACING-01/11; UI & Visuals: BORDER-07, BWIDTH-08, RADIUS-02/04 |
| Etykieta numeru klatki | Mała warstwa w lewym górnym rogu, ochronne ciemne tło, `pointer-events: none`, dane tabularne/mono. | UI & Visuals: COLOR-08, OVERLAY-01/02/06, RADIUS-02; Typography: TYPO-02/07, FONTSIZE-08/09/10, LHEIGHT-09, CASING-01/02 |
| Celownik prowadzący | Dwie przerywane linie przez cały `viewBox`, lokalny stan kursora w `RegionOverlay`, stała grubość CSS, bez hit-testingu. | UI & Visuals: COLOR-08, BWIDTH-08/10, OVERLAY-06, OPACITY-02 |
| Dokowany panel anotacji | Pozostaje bezpośrednio pod obrazem, nigdy go nie przykrywa i nie trafia nad obszar gestu. | Grid & Spacing: GRID-01/02, SPACING-01/02; UI & Visuals: BORDER-02, RADIUS-02 |
| Inspektor anotacji (`Panel`) | Przeniesiony wizualnie i w DOM pod kanwę; zawartość i interakcje bez zmian. | Grid & Spacing: GRID-01/02/12, SPACING-01/02/06; UI & Visuals: BORDER-02, RADIUS-02; Typography: TYPO-07, LHEIGHT-10 |
| Metadane (`DataList`) | Timestamp, wymiary, etap i wersja pod kanwą, obok inspektora. Numer klatki nie wraca do listy. | Grid & Spacing: GRID-01/02/12, SPACING-01/02; Typography: TYPO-07, FONTSIZE-09/10, LHEIGHT-10 |
| Komunikaty (`Notice`) | Status terminalny, odrzucenie, OCR i niezapisana geometria wyłącznie pod kanwą. | Grid & Spacing: GRID-01/02, SPACING-01/02; UI & Visuals: COLOR-09, BORDER-02; Typography: LHEIGHT-10 |
| Błędy obrazu i mutacji (`InlineError`, retry `Button`) | Przeniesione pod kanwę, aby ich pojawienie nie przesuwało overlayu; zachowują istniejące stany. | Grid & Spacing: GRID-01/02, SPACING-01; UI & Visuals: COLOR-07/09, OPACITY-02; Typography: LHEIGHT-10 |
| Stany loading/empty/fatal | Bez zmian treści i semantyki; zajmują pełny wiersz siatki. | Grid & Spacing: GRID-01/02/12 |

### Obowiązkowa checklista

- [x] **Layout/Siatka:** wyłącznie `--size-xs/sm/md/lg` i obliczenia na
  `--size-xxl`; pełnoszeroki wiersz kanwy oraz dwukolumnowe zaplecze pod nią
  (GRID-01/02/08/12, SPACING-01/02/06/11).
- [x] **Typografia:** etykieta klatki używa istniejących `--font-size-xs`,
  `--line-height-tight`, `--font-weight-semibold` i `--font-family-mono`;
  pozostałe komponenty zachowują własne tokeny (TYPO-02/07,
  FONTSIZE-08/09/10, LHEIGHT-09/10).
- [x] **Kolory:** tylko istniejące semantyczne tokeny tła, tekstu i obrysu;
  celownik nie tworzy nowej palety (COLOR-01..10, szczególnie COLOR-08/09).
- [x] **Obramowania:** obraz zachowuje `stroke-weak`, kreski wektorowe mają
  stałą szerokość; promienie tylko z istniejącej skali (BORDER-02/07,
  BWIDTH-08/10, RADIUS-01..05).
- [x] **Cienie:** brak nowego cienia; istniejące tokeny elevation pozostają
  niewykorzystane, bo nie powstaje nowa warstwa głębi (SHADOW-01..05).
- [x] **Interakcje:** celownik i etykieta mają `pointer-events: none`; stan
  disabled nadal wynika z komponentu, a ruch kursora nie uruchamia callbacków
  domenowych (COLOR-07, OPACITY-02, OVERLAY-06).
- [x] **Komponenty:** użyte istniejące `RegionOverlay`, `Panel`, `DataList`,
  `Notice`, `InlineError`, `Button`, `StatusBadge` i `AnnotationPopover`; nie
  powstaje nowy element interaktywny ani nowy komponent wspólny.

## Pomiar i weryfikacja

- Szerokość obrazu przed zmianą: **805,578 px** przy viewportcie
  **1440 × 1000 px** (headless Chromium, lokalny realny run
  `b4a755c9-4e55-4142-bc09-50f7469e124b`; `getBoundingClientRect()` obrazu).
- Szerokość obrazu po zmianie: do uzupełnienia tym samym pomiarem i viewportem.
- Wysokość kanwy w stanach bez kursora / z kursorem / podczas gestu: do
  uzupełnienia testem E2E na rzeczywistym `getBoundingClientRect()`.
