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
- Obejście pomiarowe: `ApiHarness` mockuje API w przeglądarce, więc do pomiaru i
  do specyfikacji wizualnych wystarczy sam serwer deweloperski. Uruchomiono
  własny `vite --port 5399 --strictPort` oraz nieśledzone konfiguracje
  Playwrighta (`playwright.measure.config.ts`, `playwright.e2e-alt.config.ts`,
  katalog `e2e-measure/`). Po pomiarach usunięto je z repozytorium; procesów
  operatora na 8000 i 5173 nie tknięto.

## 2026-09-14 — Pomiar, korekta wysokości kolumny i wymiana asercji

### Zmierzona geometria (dialog „Anotacja" otwarty)

| viewport | szerokość obrazu | różnica wobec 1279 px | lewa krawędź obrazu | prawa krawędź panelu |
|---|---|---|---|---|
| 1280×1000 | 571,98 px | −707,02 px | 650 px | 600 px |
| 1440×1000 | 731,98 px | −547,02 px | 650 px | 600 px |
| 1920×1080 | **1211,98 px** | **−67,02 px** | 650 px | 600 px |

Twarda granica 940 px dotyczy 1920×1080: **1211,98 px, zapas 271,98 px** — próg
nie został przekroczony, więc praca szła dalej bez pytania operatora. Przy
1920×1080 obraz jest ograniczony wysokością (806,73 px), nie szerokością toru
podglądu (1264 px) — stąd koszt kolumny jest tam znacznie mniejszy niż pełne
312 px. Przy 1280 i 1440 ogranicza szerokość i kolumna kosztuje pełne 312 px.

Poziomego przepełnienia nie ma na żadnym z trzech viewportów.

### Korekta: kadr wysokości panelu inspektora

Pierwszy pomiar pokazał defekt układu: przy naturalnej wysokości inspektora
(633,19 px) dialog „Anotacja" zaczynał się na y = 831,98 px i był docinany do
dolnej krawędzi ekranu (168 px przy 1000 px wysokości). Wiersz akcji
„Usuń / Zapisz" schodził poza kadr — dokładnie ten błąd, który FE-010-FIX1
przepuścił przez zrzut `fullPage`.

Dodano `max-height: calc(var(--size-xxl) * 5)` (320 px) i `overflow-y: auto` na
inspektorze wewnątrz kolumny. Po korekcie dialog ma naturalne 285 px, zaczyna
się na y = 518,80 px i kończy na 803,80 px — mieści się w całości na wszystkich
trzech viewportach. Cena: drugorzędne kontrolki „Powtórz z poprzedniej klatki"
wymagają przewinięcia wewnątrz panelu. Panel „Dane klatki" kończy się na
1156,80 px, czyli poniżej zgięcia — to metadane, dostępne przewinięciem strony.

### Wymienione asercje

| plik:linia | stara asercja | nowa |
|---|---|---|
| `fe011-visual-qa.spec.ts:51` | `panel.top >= image.bottom` | `panel.right <= image.left` |
| `fe011-visual-qa.spec.ts:80-82` | `> 860` / `> 1000` / `>= 1279` | `> 560` / `> 710` / `>= 1180` |
| `fe012-visual-qa.spec.ts:74` | `panel.y >= image.bottom` | `panel.right <= image.left` |
| `visual-qa.spec.ts:45` | dialog pod obrazem | `dialog.right <= image.left` |
| `visual-qa.spec.ts:113-131` | podgląd szeroki jak toolbar; inspektor i dane pod kanwą | podgląd = toolbar − 312 px, prawe krawędzie równe; oba panele na lewo od kanwy |
| `visual-qa.spec.ts:462-464` | `> 800`; oba panele pod obrazem | `> 710`; oba panele na lewo od obrazu |
| `fe013-visual-qa.spec.ts:45` | `action.width > 320` | `>= panel.width − 34` |

Progi szerokości obrazu są wyliczone z pomiaru: wartość zmierzona minus 2% na
dryf metryk czcionek, zaokrąglona w dół do 10 px (571,98 → 560; 731,98 → 710;
1211,98 → 1180). Nie są dopasowane do wyniku jednego przebiegu.

Asercje „panel mieści się w viewporcie" (`fe011:53`, `fe012:76`) **zostają**.
Test naprężeniowy `fe011:294` potwierdza je w najostrzejszym przypadku: przy
wysokości 720 px panel ma `clientHeight` 199 px przy `scrollHeight` 1491 px i
nadal kończy się na 719,80 px.

Dwa testy kontraktu `Space` (`visual-qa.spec.ts:748` i `:803`) dostały warunek
wstępny `makeDocumentScrollable`. Po skróceniu kolumny strona przy 1440×1000 nie
przepełnia już viewportu, więc końcowa asercja „Space poza kanwą nadal przewija
dokument" przechodziłaby także wtedy, gdyby `Space` był globalnie tłumiony.
Helper zmniejsza viewport do 1440×600, sprawdza, że dokument faktycznie się
przewija, i dopiero wtedy pozwala na asercję.

### Falsyfikowalność asercji położenia

Cofnięto układ do jednej kolumny (`grid-template-areas: "toolbar" "side-column"
"preview"`). Testy padły dokładnie na spodziewanych asercjach:

- `fe011-visual-qa.spec.ts:51` — „panel must remain left of the image",
  `1248 <= 338` fałszywe;
- `fe012-visual-qa.spec.ts:74` — „panel must remain left of the canvas",
  `1408 <= 338`;
- `visual-qa.spec.ts` — „should sit left of the canvas" oraz próg zgięcia
  `708,80 < 600`.

Plik przywrócono bit w bit: `sha256` przed i po zmianie to
`d1b17e7f4ed4240816de7bf5d5baf5da2354de1688711fe4203f6ecba4993ead`.

### Granica „poza panelem" — decyzja

„Wnętrze" to wyłącznie dialog `AnnotationPopover` (`data-annotation-popover`).
Kanwa i reszta lewej kolumny — w tym „Dane klatki" — są na zewnątrz. Kliknięcie
w „Dane klatki" kończy kontekst edycji i porzuca niezapisane przesunięcie, tak
samo jak wcześniejsze kliknięcie poza dokowanym dialogiem. Alternatywa
(cała kolumna jako wnętrze) zostawiałaby zamknięty semantycznie dialog przy
żywym stanie geometrii — czyli siódmy wyciek stanu między kontekstami.
Regresja `annotationNudgeFixup.test.tsx` pilnuje tej granicy: klik w „Dane
klatki" zamyka dialog, cofa podgląd do `x 100, y 120` i nie wysyła PATCH-a.

### Kolejność Tab

Kolejność DOM = kolejność wizualna, bez `order` i `row-reverse`. Po toolbarze:
kontrolki „Anotacje na klatce" → kontrolki otwartego dialogu „Anotacja" →
ewentualny retry w „Dane klatki" → kontrolki kanwy. Otwarcie dialogu nadal jawnie
przenosi fokus na pole „Klasa" (`autoFocus`).

### Stan bramek

- `npm run typecheck` — PASS.
- `npm test` — 41 plików, 659 testów, PASS.
- `npm run build` — PASS.
- Specyfikacje wizualne (`fe011`, `fe012`, `fe013-visual`, `visual-qa`) — 13/13
  PASS na własnym serwerze deweloperskim na porcie 5399.
- Pełna bramka `scripts/check.ps1` — **niewykonana**: porty 8000 i 5173 nadal
  zajmuje aplikacja deweloperska operatora (`python` pid 17056, `node` pid
  15820), a `playwright.config.ts` ma `reuseExistingServer: false` i
  `strictPort`. Procesów nie zatrzymano.


