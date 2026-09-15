# FE-015 — log implementacji

## 2026-09-15 — Design Plan przed zmianą UI

### Kierunek i zakres

Tryb powierzchni: **Operate**. Zmiana zachowuje baseline „Home — Impeccable”
i układ FE-014: toolbar na pełnej szerokości, lewa kolumna operacyjna, kadr po
prawej. Priorytetem jest bezpieczna edycja bboxa: panel klasy pozostaje stale
widoczny, menu kontekstowe dodaje tylko istniejącą akcję „Usuń”, a kontrolki
zoomu odsłaniają już istniejący mechanizm 1×–8×. Nie powstają nowe operacje ani
zmiany kontraktu API.

### Wszystkie elementy interfejsu i jedenaście pozycji

| # | Element | Plan | Komponent / kontrakt |
|---|---|---|---|
| 1 | Panel „Anotacja” | stale zamontowany; bez celu ma pusty filtr, pełną listę bez zaznaczenia i nieaktywne akcje mutujące | `AnnotationPopover`, `GroupedOptionList`, `Button`, `StatusBadge` |
| 2 | Bbox — menu kontekstowe | jednoelementowe menu „Usuń”; mysz i `Shift+F10`/klawisz menu; zamknięcie Escape, poza menu i po utracie fokusa | `RegionOverlay`, istniejący `Button`; ta sama funkcja `onRemove` co Delete/przycisk panelu |
| 3 | Skróty A/X/Enter/R | usunięte oznaczenia (`kbd`, tooltipy) i globalne handlery; strzałki nudge pozostają | `FrameEditor`, `AnnotationPopover`, `FrameToolbar` |
| 4 | HUD zoomu | przyciski `−`, `+`, `RESET` przy procencie; stan disabled na 1×/8×; kotwica w centrum kadru | `RegionOverlay`, istniejący `Button` |
| 5 | Panel „Dane klatki” | usunięty wraz z metadanymi i osieroconym CSS; komunikaty operacyjne przeniesione do inspektora | `FrameEditor`, `Panel`, `Notice`, `InlineError` |
| 6 | Opis „Anotacje na klatce” | usunięty bez zmiany nagłówka i badge liczby | `Panel` w `FrameEditor` |
| 7 | Nazwa klasy | lewa krawędź wiersza | `ClassList` |
| 8 | Licznik klasy | prawa część szerokiego przycisku, przed źródłem | `ClassList` |
| 9 | Znacznik OCR/Ręczna | osobna skrajna kolumna po prawej | `ClassList`, `StatusBadge` |
| 10 | Suwak przewijania | wspólne tokenowe zaokrąglenie toru i thumb w panelach/listach; bez przycisków strzałek WebKit | CSS `AnnotationReviewScreen` / `GroupedOptionList` |
| 11 | Chevron selektora klatki | większy padding po prawej bez zmiany `SelectField` poza tą powierzchnią | `FrameToolbar` + lokalny CSS |

### Moduły i ID UI/UX

- **Siatka i odstępy:** GRID-00/01/02 (wyłącznie skala tokenów), GRID-03/05
  (min. 32×32 px dla przycisków zoom/menu), GRID-08/10/12 (kontrolki nie
  rozciągają się bez potrzeby, selektor zachowuje ograniczenie),
  SPACING-01/02/06/07/13 (grupy HUD/menu/list i tokenowe przerwy).
- **Kolor i stany:** COLOR-01..10, szczególnie COLOR-07/08/09/10; wszystkie
  powierzchnie, teksty, status usuwania i disabled korzystają z istniejących
  tokenów. OPACITY-01/02 dla stanu disabled/hover.
- **Obramowania i promienie:** BORDER-01/02/03/05/06, BWIDTH-01/03/06/09/10/13,
  RADIUS-01..05. Menu używa `stroke-strong` i `--radius-md`, suwak
  `--radius-pill`; bbox pozostaje dokładnym prostokątem `--radius-none`.
- **Nakładki i głębia:** OVERLAY-01/03/05/06. Menu jest lokalną nakładką nad
  kadrem bez scrimu; nie blokuje niewidocznie kanwy i tłumi natywne menu tylko
  nad bboxem. SHADOW-01..05: menu użyje istniejącego tokenu
  `--shadow-elevation-high`, bez arbitralnego cienia.
- **Typografia:** TYPO-01/02/06/07/08/11, FONTSIZE-01/02/06/08/09/10,
  LHEIGHT-09/10/11, LSPACE-01/02/09, CASING-01/02. Bez nowych fontów i
  rozmiarów; `RESET`, `OCR` i `RĘCZNA` pozostają krótkimi etykietami uppercase
  z istniejącym trackingiem badge/przycisku.
- **Dostępność interakcji:** GRID-05, BORDER-06, COLOR-08, OVERLAY-06;
  widoczny fokus, nazwy ARIA, roving tabindex bboxów, klawiaturowe menu oraz
  semantyczne `disabled` dla braku celu i granic zoomu.

### Checklista obowiązkowa

- [x] Layout/Siatka: `--size-xs/sm/md`, `--control-height-sm`; pełnoszerokie
  wiersze i trzy logiczne kolumny (GRID-01/02/05, SPACING-01).
- [x] Typografia: istniejące `--font-size-xs/sm`, `--line-height-tight/standard`,
  `--font-weight-semibold`; bez nowej skali (FONTSIZE-*, LHEIGHT-*, TYPO-*).
- [x] Kolory: tylko istniejące tokeny semantyczne tła, tekstu, stroke, brand i
  error (COLOR-*).
- [x] Obramowania: menu/scrollbar/select używają tokenów stroke oraz
  `--radius-md/pill`; bbox zachowuje `--radius-none` (BORDER-*, RADIUS-*).
- [x] Cienie: wyłącznie `--shadow-elevation-high` dla rzeczywiście pływającego
  menu; bez cienia na stałym panelu (SHADOW-03/05).
- [x] Interakcje: hover/active/disabled/focus, Escape/outside/blur, mysz i
  klawiatura; brak mutacji bez celu (COLOR-07, OPACITY-02, BORDER-06).
- [x] Komponenty: katalog `common` sprawdzony; wszystkie przyciski przez
  `Button`, pola/lista przez `GroupedOptionList`, geometria przez
  `RegionOverlay`; brak potrzeby nowego komponentu wspólnego.

### Decyzje przed kodem

- Krok zoomu: współczynnik **1,25×**, taki sam jak istniejący `Ctrl`+kółko.
  Zachowuje jedną mechanikę i daje czytelne 25% na pierwszym kroku bez skoków
  utrudniających precyzyjną kontrolę bboxów. Przyciski kotwiczą skalę w środku
  widocznego kadru; `RESET` ustawia dokładnie 1× i translację 0/0.
- Menu ma jedną pozycję „Usuń”. To jedyna wskazana i już istniejąca operacja,
  więc nie dokładamy przypadkowych akcji. Wywołuje `onRemove(id)`, czyli ten sam
  tor mutacji co Delete/Backspace i przycisk panelu.
- Zastępcza kotwica testu „klik poza panelem”: panel
  `.df-review-workspace__inspector`, konkretnie nagłówek „Anotacje na klatce”.
  Jest stale obecny w lewej kolumnie, jednoznacznie leży poza
  `AnnotationPopover` i zachowuje siłę asercji FE-014 po usunięciu „Dane klatki”.

## 2026-09-15 — Korekta A3: `Enter` zostaje

Ticket kazał usunąć `A`, `X`, `Enter` i `R`. Przy implementacji okazało się, że
`Enter` nie jest w tym zestawie skrótem-akcją: `insidePanel` w `FrameEditor`
dotyczy miejsca naciśnięcia klawisza, nie kliknięcia myszą, a klik poza panelem
**porzuca** preview geometrii, nie zapisuje go. „Zapisz” zapisywało wyłącznie
klasę. Po usunięciu `Enter` strzałki — które miały zostać — nie miałyby żadnej
drogi utrwalenia przesunięcia.

Zgłoszone do właściciela ticketu, decyzja operatora: **`Enter` zostaje wyłącznie
jako zatwierdzenie geometrii**. Obowiązuje zamiast wersji z ticketu.

| Element | Stan |
|---|---|
| Oznaczenia `kbd` na przyciskach (`Zaakceptuj A`, `Odrzuć X`, `Zapisz Enter`, `Powtórz R`) | usunięte |
| Działanie `A`, `X`, `R` i ich handlery | usunięte |
| Gałąź `Enter` poza panelem (commit preview) | **zostaje, bez zmian semantyki** |
| `Enter` wewnątrz panelu | jak dotąd należy do przycisku z fokusem |
| Strzałki (nudge, `Shift` = 10 px) | bez zmian |

Krótko wdrożony wariant, w którym „Zapisz” przejmowało commit geometrii, został
**wycofany w całości przed jakimkolwiek commitem** — nie ma po nim śladu w
historii ani w kodzie.

### Podpowiedzi „Naciśnij Enter, aby zapisać”

Zostają w dwóch miejscach: w panelu (`.df-annotation-popover__unsaved`) i w
powiadomieniu o niezapisanym przesunięciu w inspektorze. To jedyne `kbd`, jakie
zostało na ekranie recenzji, i jedyna informacja o jedynej drodze utrwalenia
przesunięcia — bez nich funkcja byłaby nieodkrywalna. Pojawiają się dokładnie
wtedy, kiedy są potrzebne, więc nie zaśmiecają przycisków, o co chodziło
operatorowi. **Decyzja właściciela ticketu**, odwracalna jednym zdaniem.

Reguła CSS dla `kbd` została zawężona do tych dwóch selektorów; osierocone
reguły w `.df-review-toolbar` i `.df-review-copy` usunięte.

### `unsavedGeometry` po usunięciu skrótu `A`

Sprawdzone: ochrona **nie wisiała** na ścieżce skrótu. Przycisk „Zaakceptuj
klatkę” ma własne `disabled={mutation.isPending || activeAnnotations.length === 0
|| unsavedGeometry !== null}` plus `title` tłumaczący blokadę. Skrót miał swój,
zduplikowany warunek. Po usunięciu handlera przycisk broni się sam. Regresja
sprawdzająca obie ścieżki została bez zmian. Brak znaleziska.

## 2026-09-15 — Decyzje wykonawcze

### Krok zoomu: 1,25×

Ten sam współczynnik co istniejące `Ctrl`+kółko, więc przycisk i kółko poruszają
się po tej samej drabince skal — nie ma stanów osiągalnych tylko jedną drogą.
Pierwszy krok daje czytelne 125%, a 1×→8× to dziewięć kroków, czyli dystans do
przejścia bez znużenia i bez skoków gubiących kontekst przy pikselowej pracy nad
bboxami. `RESET` ustawia dokładnie 1× i translację `0/0`; przyciski są
`disabled` na krańcach. Kotwicą przycisku jest środek widocznego kadru — kursor
stoi wtedy nad przyciskiem, więc kotwiczenie na kursorze wyrzucałoby kadr poza
obszar zainteresowania. Mechanika zoomu nie została przebudowana: `applyZoom`
to wydzielona, wspólna ścieżka, z której korzysta zarówno kółko, jak i przyciski.

### Kształt menu bboxa

Jedna pozycja: „Usuń”. To jedyna operacja wskazana przez operatora i jedyna,
która już istnieje na bboxie; dokładanie czegokolwiek innego byłoby wymyślaniem
nowych operacji. Menu wywołuje `onRemove(id)` — dokładnie ten sam tor mutacji co
`Delete`/`Backspace` na bboxie i przycisk „Usuń” w panelu, bez duplikowania
logiki.

Dostępność i granice gestów:

- otwarcie: prawy przycisk **tylko nad bboxem** (`onContextMenu` na
  `ShapeOption`, nie na kanwie) oraz `Shift+F10` / klawisz menu kontekstowego z
  klawiatury;
- zamknięcie: `Escape`, `pointerdown` poza menu, utrata fokusa;
- menu nosi `data-preserve-annotation-preview`, więc otwarcie go nie jest
  „klikiem poza panelem” i nie gubi niezapisanego przesunięcia;
- pozycja jest przycinana do wnętrza viewportu kanwy, a fokus ląduje na
  pierwszej pozycji menu.

### Chevron selektora klatki (C5)

Natywny `<select>` nie pozwala odsunąć swojej strzałki od krawędzi — jej
pozycję ustala przeglądarka. Żeby spełnić prośbę operatora, kontrolka dostaje
`appearance: none` i własny chevron jako `::after` na `.df-field`, odsunięty o
`--size-sm`, z `pointer-events: none`. Zmiana jest ograniczona do
`.df-review-toolbar__frame-select`; `SelectField` poza tą powierzchnią nie jest
ruszany.

### Pasek przewijania (C4)

Tor i suwak dostają wspólny `--radius-pill`, suwak ma obwódkę w kolorze tła,
więc wygląda na węższy od toru i nie dotyka jego krawędzi. `scrollbar-width:
thin` i `scrollbar-color` obsługują Firefoksa, `::-webkit-scrollbar-*` —
Chromium. `::-webkit-scrollbar-button { display: none }` usuwa strzałki, które
operator zakreślił na czerwono. Zero wartości wpisanych na sztywno.

### `key={frame.id}` — usunięte

Pierwsza wersja wymuszała remount `LoadedFrameEditor` przy zmianie klatki, żeby
bramę konfliktu z FE-013 wyzerować „za darmo”. Usunięte: remount kasował przy
okazji skalę i przesunięcie kadru między klatkami, czyli ruszał mechanikę zoomu
z FE-011, której ticket zabrania dotykać. Bramę unieważnia istniejący efekt
uzgadniający zaznaczenie (`FrameEditor.tsx`): po zmianie klatki `selectedId` nie
ma odpowiednika w `activeAnnotations`, więc leci `setSelectedId(null)` i
`setCategoryConflict(null)`. Dwie nowe regresje pilnują tego przy trwale
zamontowanym panelu.

## 2026-09-15 — Przekształcone testy i powody

| Test | Było | Jest | Powód |
|---|---|---|---|
| `maps a/x to the review action outside form controls` | skrót wysyła decyzję | `no longer maps a/x…`: naciśnięcie nie wysyła nic, a przycisk nadal działa | A3 usuwa działanie skrótu; test nie zniknął, tylko pilnuje braku żądania **i** tego, że ścieżka recenzji nie padła w całości |
| `copies the preselected HUD level with R` | skrót `R` kopiuje | `ignores R…`: `r` nie wysyła nic, kopiuje przycisk (`Enter` na przycisku z fokusem) | jak wyżej |
| `treats frame details as outside the annotation panel` | klik w „Dane klatki” | klik w nagłówek „Anotacje na klatce” | C1 usuwa panel; kotwica zastępcza leży tak samo poza `AnnotationPopover`, asercje bez osłabienia |
| `orders the side column…` | pozycja panelu „Dane klatki” w kolumnie | brak regionu „Dane klatki” i brak „Timestamp”, powiadomienia w inspektorze | C1 |
| `filters the class list by typing…` | zapytania globalne | zapytania zawężone do pickera, do którego należy filtr | A1 trzyma na ekranie drugą listę klas; test ma dotyczyć filtrowania, a nie liczby list |
| dwa testy FE-013 z copy-previous | `keyboard("r")` | `focus()` + `{Enter}` na przycisku „Powtórz” | patrz niżej |

Testy FE-008-FIX1 (pusty `Enter` w autofocusowanym filtrze nic nie wysyła) **nie
zostały ruszone** — po korekcie A3 `Enter` dalej istnieje, więc ich cel jest
niezmieniony. Regresje commitu geometrii przez `Enter` poza panelem i porzucania
preview kliknięciem poza panelem również bez zmian.

### Dlaczego dwa testy copy-previous dochodzą do przycisku z klawiatury

**Nie upraszczać tego z powrotem do `user.click` — to cicho zabije testowaną
gałąź.** Obie regresje FE-013 sprawdzają, że brama konfliktu przeżywa
copy-previous, które **zachowuje** zaznaczone `annotationId`. Klik w „Powtórz”
to `pointerdown` poza `AnnotationPopover`, czyli gubi zaznaczenie — po A1 panel
zostaje zamontowany, ale przechodzi w stan bez celu, a brama się zeruje. Dismiss
słucha wyłącznie `pointerdown`, więc dojście do przycisku z klawiatury zachowuje
zaznaczenie i pozwala asercjom zachować pełną siłę. To realna ścieżka operatora,
nie sztuczka pod test.

Świadoma konsekwencja, potwierdzona przez właściciela ticketu: **dla operatora
używającego myszy copy-previous zawsze gubi zaznaczenie**. Wcześniej `R`
pozwalało tego uniknąć. Copy-previous nie jest pod względem granicy z FE-014
szczególne i nie dostaje własnej furtki w `data-preserve-annotation-preview` —
spójność wygrywa z wygodą jednego przycisku. Gdyby operator uznał inaczej, to
osobna zmiana produktowa.

## 2026-09-15 — Sondy falsyfikowalności

Każda sonda: cofnięcie zmiany produkcyjnej, uruchomienie testu, przywrócenie
pliku i weryfikacja `SHA256` sprzed sondy.

| Sonda | Cofnięta zmiana | Test | Padło na |
|---|---|---|---|
| A1 | przywrócony warunek `popoverAnnotation === undefined ? null : …` | `keeps a normal annotation panel visible without a mutation target` | `TestingLibraryElementError: Unable to find an accessible element with the role "region" and name "Anotacja bez zaznaczenia"` |
| A2 (mysz) | `onContextMenu` na `ShapeOption` podmienione na no-op | `deletes a bbox from its context menu…`, `opens the bbox menu without drawing, moving or losing an unsaved nudge` | `Unable to find an accessible element with the role "menuitem" and name "Usuń"` oraz `…role "menu" and name "Akcje bboxa"` |
| A2 (klawiatura) | wyłączona gałąź `Shift+F10` / `ContextMenu` | `opens the bbox menu from the keyboard and dismisses it with Escape` | `AssertionError: expected true to be false` (zdarzenie przestało być `preventDefault`-owane, menu się nie otwiera) |
| A3 | dopisany z powrotem handler skrótu `A` | `no longer maps a to the accept review action and keeps it on the button` | `AssertionError: expected [ { decision: 'accept', …(1) } ] to have a length of +0 but got 1` |

Obie ścieżki otwarcia menu padają niezależnie od siebie — zepsucie myszy nie
maskuje klawiatury i odwrotnie.

`SHA256` po przywróceniu, zgodne ze stanem sprzed sond:

- `FrameEditor.tsx` — `93DBFB21DC4667EC05A00A0687907928A1D0FA7C04F005040D14ED8D5A1C8A1E`
- `RegionOverlay.tsx` — `1D945C457230165DB75C2987279700016A997FE62F4BB873FA361AD2A37B760A`

## 2026-09-15 — Stan przebiegów

- `npx tsc --noEmit` — czysto.
- `npx vitest run` — **667/667 zielone**, 0 pominiętych.
- Porty 8000 i 5173 zostały zwolnione przez właściciela ticketu przed bramką.

## 2026-09-15 — Pierwszy pełny przebieg bramki i naprawa kotwic E2E

Po skopiowaniu ignorowanego `.env` z głównego checkoutu uruchomiono jednym
nieprzerwanym przebiegiem i ścieżką absolutną:

`powershell.exe -NoProfile -ExecutionPolicy Bypass -File
C:\Users\t.wisniewski\.traycer\worktrees\thomschery__datasetfactory\feat-fe-015-editor-controls-and-polish\scripts\check.ps1`

Wynik: siedem pierwszych etapów PASS, frontend **667/667**, E2E **15/18**,
ostatni etap SKIP wskutek fail-fast. Trzy awarie były przestarzałymi kotwicami:

- `FE-011-FIX2` wybierał pierwszy przycisk pozycyjnie w kontenerze zoomu; po
  dołożeniu `−` / `+` trafiał w „Pomniejsz kanwę”. Selektor wiąże się teraz z
  jedynym przyciskiem semantycznie przełącznym: `button[aria-pressed]`.
- Dwa testy `visual-qa.spec.ts` nadal mierzyły celowo usunięty region „Dane
  klatki”. Teraz jawnie wymagają `Dane klatki = 0`, mierzą stały panel
  „Anotacja bez zaznaczenia” i zachowują asercję `panel.right <= image.left`.

Rerun dokładnie tych trzech przypadków: **3/3 PASS**.

### Dodatkowa sonda FE-011-FIX2

Żeby wykluczyć, że naprawiony selektor tylko „zieleni” test, wyłączono wyłącznie
`invalidatePanInteraction()` w handlerze `window.blur`. Test padł na pierwszym
niezmienniku mechanizmu: `.df-region-overlay` zachował `data-panning="true"` po
`blur`. To dowodzi, że nadal pilnuje unieważnienia aktywnej epoki panoramowania,
a nie tylko odnalezienia przycisku.

Po sondzie plik przywrócono z HEAD. `core.autocrlf=true` zmienił surowe bajty
LF/CRLF, więc nie zapisuję fałszywego twierdzenia o identycznym SHA256; zgodność
treści Git jest dokładna: `git hash-object` worktree i `HEAD` dają ten sam blob
`f347a6237c7b92c0df044203960e032d090d6ecf`, a plik nie figuruje w `git status`.

## 2026-09-15 — Visual QA FE-015

Nowy scenariusz `fe015-visual-qa.spec.ts` przeszedł **1/1** i zapisuje bez
`fullPage` po dwa kadry dla każdego wymaganego viewportu:

- `editor-no-selection-1440x1000.png`
- `editor-context-menu-1440x1000.png`
- `editor-no-selection-1920x1080.png`
- `editor-context-menu-1920x1080.png`

Fixture ma 18 klas, więc lista jest rzeczywiście przewijalna; przed screenshotem
jest częściowo przewinięta i ma fokus kursora. Test wymaga
`scrollHeight > clientHeight` oraz promienia thumb równego `--radius-pill`.
Sprawdza też stały pusty panel i nieaktywne mutacje, brak opisu i „Danych
klatki”, kontrolki `−` / `+` / `RESET`, menu z fokusem na „Usuń”, natywny tag
`SELECT`, `appearance: none`, niezerowy chevron `::after` i granicę
`panel.right <= image.left`. Oględziny wszystkich czterech PNG potwierdziły brak
kolizji menu/zoomu, poprawną kolumnę i pełne zmieszczenie kadru.

## 2026-09-15 — Rozstrzygnięcie odświeżeń starszych screenshotów (RGB)

Porównanie wykonano po konwersji obu stron do RGB. `getbbox()` nie pracował na
kanale alpha.

| Plik | Zmienione piksele | RGB bbox różnicy | Decyzja i powód |
|---|---:|---|---|
| `FE-001/annotations-1440.png` | 62 449 / 1 440 000 (4,337%) | `(312, 97)–(1408, 1000)` | realne: stały panel, usunięte dane/opis, nowe zoom controls |
| `FE-011/annotations-pan-1440.png` | 93 672 / 1 440 000 (6,505%) | `(312, 102)–(1408, 1000)` | realne: nowe kontrolki w HUD i uporządkowana kolumna podczas panu |
| `FE-012/panel-without-geometry-1440.png` | 2 318 / 114 048 (2,032%) | `(84, 237)–(271, 269)` | realne: copy podpowiedzi Enter po usunięciu oznaczeń przycisków |
| `FE-012/review-1440.png` | 62 458 / 1 440 000 (4,337%) | `(312, 102)–(1408, 1000)` | realne: stały panel, kolumna bez „Danych klatki”, widoczny zoom |
| `FE-013/create-class-action-1440.png` | 2 409 / 82 368 (2,925%) | `(13, 78)–(275, 269)` | realne: stały panel i oczyszczone oznaczenia akcji |
| `FE-001/error-1440.png` | 9 / 1 440 000 (0,001%) | `(312, 95)–(315, 101)` | znany dryf FE-014: maks. delta kanału 1; przywrócono z HEAD |

Pięć realnych odświeżeń jest commitowanych jawnie; znany dziewięciopikselowy
dryf nie trafia do historii.

## 2026-09-15 — Końcowa bramka 9/9

Po commitach implementacji, regresji i materiału Visual QA uruchomiono ponownie
pełną ścieżkę jednym nieprzerwanym procesem, z absolutną ścieżką do
`scripts\check.ps1`. Wynik: **9/9 PASS, zero SKIP**.

| Etap | Wynik | Czas / liczba |
|---|---|---|
| backend format | PASS | 0,9 s |
| backend lint | PASS | 0,4 s |
| backend typy | PASS | 5,2 s |
| backend testy | PASS | 338,6 s; 356/356 |
| frontend typy | PASS | 1,8 s |
| frontend testy | PASS | 70,3 s; 667/667 |
| frontend build | PASS | 3,0 s |
| E2E | PASS | 93,5 s; 19/19 |
| E2E root safety | PASS | 0,8 s; 2/2 |

Po bramce ponownie pojawił się wyłącznie znany dryf
`FE-001/screenshots/error-1440.png`: RGB 9 pikseli, bbox `(312, 95)–(315, 101)`,
maksymalna delta kanału 1. Plik przywrócono z HEAD. Porty 8000, 5173 i 5174 są
bez nasłuchu.
