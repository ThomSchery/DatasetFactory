# FE-010 — log implementacji

## Zakres wykonawczy

Implementacja jest celowo zawężona zgodnie z przekazaniem koordynatora do:

1. pełnoszerokiej kanwy ograniczonej wysokością viewportu,
2. numeru klatki w rogu obrazu,
3. metadanych, inspektora i komunikatów pod kanwą,
4. lokalnego, nieinteraktywnego celownika prowadzącego w `RegionOverlay`,
5. zoomu `Ctrl` + kółko zakotwiczonego pod kursorem oraz panu środkowym
   przyciskiem albo `Spacja` + przeciągnięcie.

Pionowy pasek narzędzi, wielokąty i pędzel pozostają poza tym zakresem. Zoom i
pan zostały dopisane do FE-010 późniejszą decyzją użytkownika; nie zmieniają
geometrii źródłowej ani kontraktu mutacji.

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
| Sterowanie zoomem | Stały wskaźnik procentowy w prawym górnym rogu kanwy i kompaktowy przycisk `1×`, dostępny z klawiatury jako „Dopasuj kanwę do widoku”; nie zmienia rozmiaru layoutu. | Grid & Spacing: GRID-01/02, SPACING-01/02; UI & Visuals: COLOR-08, OVERLAY-01/02/06, BORDER-02, RADIUS-02; Typography: TYPO-07, FONTSIZE-09/10 |
| Pan kanwy | Bez osobnego paska: środkowy przycisk albo `Spacja` + lewy przycisk; kursor `grab/grabbing`, jawne rozstrzygnięcie gestu przed rysowaniem. | UI & Visuals: OVERLAY-06, OPACITY-02; Grid & Spacing: GRID-08/11 |
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
  domenowych. `Ctrl` + kółko przechwytuje wyłącznie obsługiwany zoom, zwykłe
  kółko przewija stronę, a pan jest rozdzielony od lewego gestu rysowania
  (COLOR-07, OPACITY-02, OVERLAY-06).
- [x] **Komponenty:** użyte istniejące `RegionOverlay`, `Panel`, `DataList`,
  `Notice`, `InlineError`, `Button`, `StatusBadge` i `AnnotationPopover`;
  jedynym nowym sterowaniem jest mały przycisk resetu zoomu z istniejącego
  komponentu `Button`.

## Pomiar i weryfikacja

- Szerokość obrazu przed zmianą: **805,578 px** przy viewportcie
  **1440 × 1000 px** (headless Chromium, lokalny realny run
  `b4a755c9-4e55-4142-bc09-50f7469e124b`; `getBoundingClientRect()` obrazu).
- Szerokość obrazu po zmianie: **981,297 px** w tym samym viewportcie
  **1440 × 1000 px** i dla tego samego runu (`getBoundingClientRect()` obrazu).
  Wzrost wynosi **175,719 px**, czyli około **21,8%**.
- Wysokość kanwy w stanach bez kursora / z kursorem / podczas rzeczywistego
  gestu wskaźnika wynosiła kolejno **551,984 / 551,984 / 551,984 px**. Celownik
  nie wywołuje przesunięcia układu.
- Dokowany panel anotacji zaczynał się na `y = 769,781 px`, bezpośrednio pod
  kanwą; jego początek pozostawał widoczny w pierwszym viewportcie.
- Celownik oraz etykieta klatki miały `pointer-events: none`. Gest rozpoczęty na
  każdej z tych warstw przechodził do overlayu i tworzył wyłącznie lokalny draft,
  bez żądania mutującego.
- Screenshot QA: `docs/tickets/FE-010/fe-010-canvas-crosshair-1440.png`.
- Screenshot QA przy zoomie 125%, z widocznym celownikiem i otwartym panelem:
  `docs/tickets/FE-010/fe-010-zoom-crosshair-1440.png` (1440 × 2006 px,
  obejrzany w pełnej rozdzielczości).
- `impeccable detect --scope layout` po zmianie: `[]`.

### Zoom i pan — pomiary Chromium

- Rzeczywisty `Ctrl` + kółko zmienił skalę z **100% na 125%**. Renderowana
  szerokość obrazu wzrosła z **981,297 px do 1226,621 px**, natomiast viewport
  kanwy pozostał **983,328 × 553,984 px**.
- Punkt zakotwiczenia pod kursorem zmienił znormalizowaną pozycję o mniej niż
  **0,0003** na każdej osi (różnica wynika z subpikselowego obrysu viewportu).
- Pan środkowym przyciskiem przesunął transformację o dokładnie **80 × 45 px**;
  osobny test Chromium potwierdził także `Spacja` + lewy przycisk.
- Zwykłe kółko bez `Ctrl` nie miało `defaultPrevented`; listener jest jawnie
  niepasywny, lecz przechwytuje wyłącznie obsługiwany zoom.
- Reset `1×` zachował otwarty panel oraz identyczny draft
  `x 864, y 486, width 110, height 75`; zoom, pan i reset wykonały **0 mutacji**.
- Etykiety poruszają się z obrazem, ale zachowują stały rozmiar ekranowy dzięki
  odwrotnej skali. Obrysy i celownik zachowują `non-scaling-stroke`.
- Hit target uchwytu jest dzielony przez bieżący zoom: dla przykładowego bboxa
  19 × 40 px ma rozmiar 10 × 10 jednostek przy dopasowaniu i 1,25 × 1,25 przy
  8×, czyli zachowuje ten sam ślad ekranowy na obu końcach zakresu.

### Wyniki pełnej bramki

`powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1`
zakończył się wynikiem **PASS — 9/9 bramek, 0 pominiętych**:

- backend: format i lint bez uwag, mypy bez błędów, **347/347 testów**;
- frontend: typy bez błędów, **40/40 plików i 600/600 testów**;
- build produkcyjny: sukces; jedyne ostrzeżenie dotyczy istniejącego rozmiaru
  głównego chunka powyżej 500 kB;
- E2E Chromium: **6/6 scenariuszy**, w tym pełny vertical flow, QA pięciu tras,
  kanwa/celownik/zoom/pan, stan zamrożony i ochrona screenshotu po utracie focusu;
- bezpieczeństwo katalogu roboczego E2E: **2/2 testy**.

Dodatkowy retest FE-009/FE-010 objął **5/5 plików i 162/162 testy**. Pierwszy
przebieg pełnej bramki wykrył zbyt szeroki stały próg testu layoutu oraz próbę
przesunięcia kursora do kanwy przewiniętej poza viewport przez focus inspektora.
Asercje zostały powiązane z rzeczywistą geometrią wiersza i jawnie przywracają
SVG do viewportu bez zmiany focusu; po korekcie pełna bramka przeszła od początku.

## Regresje FE-009 — osobne dowody

1. **Kliknięcie poza panelem i ten sam gest rozpoczynający bbox:** test
   `closes on the image without eating the pointerdown that starts the next box`
   oraz test Chromium rozpoczynający gest także na etykiecie klatki.
2. **Kliknięcie, przeciągnięcie i resize własnego bboxa nie zamykają panelu:**
   `treats the bbox it edits as part of itself, so a drag on it is not a dismissal`
   i `keeps the popover open while the bbox it edits is dragged`.
3. **Escape pozostaje nieobsłużony:**
   `has no Escape hint and no Escape handler left`.
4. **Enter w pustym, zautofokusowanym filtrze nie wybiera klasy i nie zapisuje:**
   `ignores Enter in an empty filter until a row is explicitly focused`; brak
   wywołań `onChange` i `onConfirm` oznacza brak ścieżki do POST.
5. **Panel remountuje się wyłącznie przy zmianie anotacji:** zachowany literal
   `key={popoverAnnotation.id}` oraz testy `survives reselecting its class chip
   without sending a request` i `survives a refetch of the same annotation and
   sends no mutation`.
6. **Zwykły błąd zapisu zachowuje draft:**
   `keeps the draft after a failed explicit class save` i `survives a failed
   geometry PATCH instead of rolling the overlay back`.
7. **Strzałki nie wysyłają PATCH, Enter wysyła dokładnie jeden z bieżącą
   wersją:** `accumulates three nudges in one preview and sends exactly one PATCH
   on Enter`, z asercją `expected_version: 3`.
8. **Baseline gestu jest związany z anotacją i epoką wyboru:**
   `cannot resurrect A after selecting B and cannot leak A into B's next cancel`
   oraz `does not restore a baseline after closing and reselecting the same
   annotation`.
9. **Panel pozostaje dokowany i nie przykrywa obrazu:** test helpera
   `assertAnnotationPopoverIsDocked`, test pełnoszerokiej kanwy w Chromium i
   screenshot QA wymieniony wyżej.
