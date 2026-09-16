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

> **Uzasadnienie w tym akapicie było nieprawdziwe. Sprostowane w sekcji
> FE-015-FIX1 (P1) niżej — czytaj tamtą wersję.** Zostawione w oryginalnym
> brzmieniu, bo dwie nowe regresje powstały właśnie z tego błędnego modelu.

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

## 2026-09-15 — FE-015-FIX1: zewnętrzny klucz, wyciek alertu, fokus po `Escape`

Cold review: `CHANGES REQUESTED`, 1×P1 i 2×P2, wszystkie z reprodukcją.

### P1 — sprostowanie: bramę czyści remount, nie efekt uzgadniający

`AnnotationReviewScreen.tsx:233` renderuje `FrameEditor` z `key={selectedId}`,
gdzie `selectedId` to identyfikator aktywnej klatki. **Zmiana klatki odmontowuje
cały edytor razem z panelem.** Zoom i przesunięcie kadru resetują się przy
zmianie klatki od zawsze i niezależnie od FE-015.

Wynika z tego, że akapit „`key={frame.id}` — usunięte” wyżej opiera się na
błędnym modelu. Dodanie drugiego klucza na `LoadedFrameEditor` niczego by nie
zepsuło, bo zewnętrzny klucz i tak remountuje — ale argument, że jego usunięcie
**ratuje** zoom z FE-011, był nieprawdziwy. Pierwsza analiza przeczytała
`FrameEditor.tsx` bez miejsca wywołania: efekt uzgadniający istnieje i faktycznie
zeruje bramę, więc pasował do obserwacji, a nikt nie sprawdził, czy przy zmianie
klatki w ogóle jest wykonywany. Nie jest — komponent, w którym żyje, przestaje
istnieć.

Zmiany produkcyjnej nie ma: `key={selectedId}` zostaje, persystencja zoomu między
klatkami byłaby zmianą zachowania spoza zakresu FE-015.

Poprawione są dwie regresje, które dowodziły innego mechanizmu, niż deklarowały:

| Test | Deklarował | Dowodzi teraz |
|---|---|---|
| `builds a new editor on a frame change, so no gate crosses the boundary` (było: `drops the conflict gate when the frame changes under the mounted panel`) | efekt uzgadniający zeruje bramę przy trwale zamontowanym panelu | kolumna `Panele bieżącej klatki` to **inny węzeł** i poprzedni zniknął z dokumentu — edytor jest budowany od zera, więc nic scoped do poprzedniej klatki nie przechodzi |
| `drops the conflict gate when the selection is lost under the mounted panel` | jw. | kolumna to **ten sam węzeł** (`toBe`), a brama znika przez `onClose` z granicy FE-014 — dopiero to jest dowód na A1 |

Prawdziwy test ścieżki efektu uzgadniającego z FE-013-FIX6 istnieje i nie był
ruszany: `clears a rejected category after copy replaces the selected annotation
id` (`annotationReviewFlow.test.tsx`) — copy-previous podmienia zaznaczone
`annotationId` **w obrębie tej samej klatki**, więc efekt jest jedyną rzeczą,
która może bramę wyczyścić. Od FIX1 drugim testem tej ścieżki jest `takes the
class conflict away with the draft it belonged to`.

### P2 — alert przeżywał porzucenie boxa

Po `409 category_name_exists` „Porzuć box” usuwał szkic, ale `categoryActionError`
i `categoryConflict` zostawały; pusty panel pokazywał alert nieistniejącego
szkicu, a następny narysowany box dostawał zablokowaną tę samą nazwę.

Poprawka nie dokłada `setX(null)` w handlerze. Reconciliation z FE-013-FIX6
dostaje pełną definicję „panel stracił cel”:

```
selectedId !== null && (selectedId === DRAFT ? draftBBox === null : …dotychczasowy warunek…)
```

Szkic jest stanem lokalnym, więc gałąź draftu nie czeka na `frameRefreshing` ani
`mutation.isPending` — te gwarancje dotyczą prawdy serwera i tylko jej. Samo
`removeAnnotation(DRAFT)` **upuszcza cel i nic więcej**; selekcję, kontekst,
bramę i alert sprząta reconciliation. `categoryActionError` dołączył tam obok
`categoryConflict`, bo należy do tej samej klasy.

**Audyt ósmego przypadku.** A1 zmienił cykl życia dokładnie jednego komponentu —
`AnnotationPopover`. Stany, które dotąd sprzątało jego odmontowanie, to zbiór
domknięty: własności, które panel renderuje. Wyliczone z miejsca wywołania
(`FrameEditor.tsx`):

| Własność | Skąd | Status |
|---|---|---|
| `annotation`, `draft`, `disabled`, `busyKey`, `hasUnsavedGeometry` | wyliczane z `popoverAnnotation` / mutacji | bez celu są puste albo wyłączone z definicji |
| `categoryConflict` | stan `FrameEditor` | sprzątane przez reconciliation |
| `categoryError` ← `categoryActionError` | stan `FrameEditor` | **doszło w FIX1** |
| `form`, `categoryQuery` (stan wewnętrzny panelu) | `AnnotationPopover` | zerowane przez `key={popoverAnnotation?.id ?? "empty"}` |

`actionError` i `invalidIds` sprawdzone i **świadomie zostawione**: renderuje je
inspektor, który był zamontowany na stałe również przed FE-015, więc nigdy nie
należały do cyklu życia panelu. Czyszczenie ich przy utracie zaznaczenia kasowałoby
komunikat o klatce, a nie o anotacji.

### P2 — fokus po zamknięciu menu bboxa

Było: `Shift+F10`, `Escape` — fokus na `body`, operator traci miejsce w
dokumencie. Jest: menu oddaje fokus bboxowi, z którego je otwarto.

Reguła jest jedna i nie wylicza dróg zamknięcia: **menu oddaje fokus dokładnie
wtedy, gdy w chwili zamknięcia nadal go trzyma** (`menu.contains(document
.activeElement)`).

| Droga zamknięcia | Oddaje fokus | Dlaczego |
|---|---|---|
| `Escape` | tak | fokus jest w menu; `body` kosztowałby operatora klawiatury miejsce w dokumencie |
| pozycja „Usuń” | tak | ta sama sytuacja; przy nieudanym albo jeszcze trwającym `DELETE` bbox nadal istnieje i jest właściwym miejscem powrotu |
| `pointerdown` poza menu | tak, ale przeglądarka zaraz to nadpisze | to przekazanie, nie miejsce docelowe: następujący `mousedown` ustawia fokus na tym, w co kliknięto. Oddanie fokusu i tak jest potrzebne, bo pod tym kursorem zwykle jest kanwa, która fokusu nie przyjmuje — bez tego operator zostaje bez fokusu |
| `blur` okna | tak | `document.activeElement` się nie zmienia, więc `focus()` jest niewidoczny teraz, a po powrocie do okna fokus jest na bboxie zamiast na nieistniejącej pozycji menu |
| wyjście fokusem (Tab) | **nie** | fokus ma cel wybrany przez operatora; zamknięcie za nim jest całą robotą, przeciąganie go z powrotem — regresją |

Trzy nowe regresje w `RegionOverlay.test.tsx` pilnują trzech gałęzi tej reguły:
`…gives focus back on Escape`, `gives focus back to the bbox when a pointer
outside dismisses the menu`, `leaves focus where the operator moved it when the
menu closes behind them`. Trzecia potrzebuje `act()` wokół `focus()` — `focusout`
leci natychmiast, ale wywołane przez niego `setState` bez `act` nie zostaje
wypłukane i menu „nie zamyka się” tylko w teście.

Sonda A2 (klawiatura) z tabeli sond FE-015 wskazuje test pod starą nazwą —
po zmianie nazwy to `opens the bbox menu from the keyboard and gives focus back
on Escape`, ta sama gałąź `Shift+F10`.

### Sondy falsyfikowalności FIX1

Każda sonda: kopia pliku przez `Copy-Item` (nie `git restore` — przy
`core.autocrlf=true` normalizuje końce linii), cięcie, przebieg testu,
przywrócenie kopii, porównanie `SHA256`.

| Sonda | Cięcie | Test | Padło na |
|---|---|---|---|
| P1-a | usunięte `key={selectedId}` z `AnnotationReviewScreen.tsx` | `builds a new editor on a frame change…` | **przeszedł** — patrz niżej |
| P1-b | usunięte `key={selectedId}` **oraz** `placeholderData: keepPreviousData` w `frameQuery` | jw. | `expect(element).not.toBeInTheDocument()` — kolumna poprzedniej klatki zostaje w dokumencie (`annotationReviewFlow.test.tsx:1232`) |
| P2-a | usunięte `setCategoryActionError(null)` z reconciliation | `takes the class conflict away with the draft it belonged to` | `expect(element).not.toBeInTheDocument()` na alercie w pustym panelu (`:562`) |
| P2-b | gałąź draftu w `selectionTargetMissing` zamieniona na `false` | jw. | to samo miejsce — reconciliation ślepa na draft zostawia alert i bramę |
| P2-c | `ownsFocus` wymuszone na `false` | `…gives focus back on Escape`, `gives focus back to the bbox when a pointer outside…` | `expect(element).toHaveFocus()` — fokus na `body` (`:214`, `:235`) |
| P2-d | `ownsFocus` wymuszone na `true` | `leaves focus where the operator moved it…` | `expected "focus" to not be called at all, but actually been called 1 times` (`:260`) |

**P1-a to znalezisko, nie porażka sondy.** Sam zewnętrzny klucz nie jest jedyną
rzeczą, która wymienia edytor przy zmianie klatki: `frameQuery` dla nowego
`frameId` startuje jako `isPending`, więc `FrameEditor` renderuje gałąź ładowania
i `LoadedFrameEditor` **i tak** znika razem ze swoim stanem. Dwa niezależne
mechanizmy dają ten sam skutek, więc test wymaga wyłączenia obu — i dokładnie tak
wygląda realna zmiana, która mogłaby ten niezmiennik zabrać: ktoś dokłada
`keepPreviousData`, żeby usunąć mignięcie „Ładowanie…”, i brama zaczyna
przechodzić między klatkami. Komentarz przy teście nazywa oba mechanizmy i tę
sondę.

**P2-d to drugie znalezisko tej klasy, we własnym teście.** Pierwsza wersja testu
o wyjściu fokusem asertowała `expect(zoomIn).toHaveFocus()` i przechodziła
również wtedy, gdy menu odbierało fokus bezwarunkowo: jsdom wysyła `focusout`
zanim zapisze nowy `activeElement`, więc nasze `focus()` jest zaraz nadpisywane
przez samo jsdom. Asercja mierzyła kolejność zdarzeń w jsdom, nie regułę. Test
sprawdza teraz `vi.spyOn(option, "focus")` — czyli zachowanie, które deklaruje.

### Bramka po FIX1 — 9/9

Jeden nieprzerwany przebieg `scripts\check.ps1` ścieżką absolutną, uruchomiony na
`52a1534` (cztery commity FIX1). Wynik: **9/9 PASS, zero SKIP**, kod wyjścia 0.

| Etap | Wynik | Czas / liczba |
|---|---|---|
| backend format | PASS | 0,3 s |
| backend lint | PASS | 0,1 s |
| backend typy | PASS | 2,3 s; 99 plików |
| backend testy | PASS | 343 s; 356/356 |
| frontend typy | PASS | 1,5 s |
| frontend testy | PASS | 57,7 s; 670/670 |
| frontend build | PASS | 3,1 s |
| E2E | PASS | 111,6 s; 19/19 |
| E2E root safety | PASS | 1 s; 2/2 |

670 testów jednostkowych to baza 667 plus trzy z FIX1: porzucenie szkicu oraz dwie
gałęzie reguły fokusu menu. Dwie przepisane regresje bramy nie zmieniły liczby.

`ECONNREFUSED 127.0.0.1:8000` w logu E2E pochodzi z `vertical-flow.spec.ts`, który
**celowo** restartuje backend w trakcie OCR; test kończy się PASS.

Po bramce brudny był jeden plik: `docs/tickets/FE-001/screenshots/error-1440.png`.
Pomiar RGB względem `HEAD`: 9 pikseli z 1 440 000, bbox `(312, 95)–(315, 101)`,
maksymalna delta kanału 1 — co do wartości ten sam dryf, który FE-014 ustalił jako
znany. Plik przywrócony z `HEAD`. Drzewo czyste, porty 8000, 5173 i 5174 bez
nasłuchu, bez push i merge.

## 2026-09-16 — FE-015-FIX2: Design Plan przed zmianą UI

Zakres interfejsu jest wyłącznie behawioralny; FIX2 nie dodaje ani nie
przestylowuje kontrolek. Dotknięte elementy to: stale zamontowany panel
`AnnotationPopover` (pusty region, żywy dialog, alert i brama konfliktu), bbox
`role="option"`, jego menu `role="menu"` z pozycją `Usuń`, sąsiednie bboxy oraz
kanwa `RegionOverlay` o roli `listbox`, która będzie programowym celem fokusa po
usunięciu jedynego boxa. Obowiązują moduły **Obramowanie** (`BORDER-01..09`,
zwłaszcza `BORDER-06`) i **Szerokość Obramowania** (`BWIDTH-01..14`, zwłaszcza
`BWIDTH-09..13`) oraz istniejące tokeny `--color-stroke-strong-default`,
`--focus-ring-width` i `--focus-ring-offset`; FIX2 zachowuje już istniejący,
widoczny styl fokusa zamiast definiować nowe wartości.

- [x] Layout/Siatka: bez zmian; `GRID-01/02` i tokeny spacing pozostają nietknięte.
- [x] Typografia: bez zmian; nie powstaje nowy tekst ani styl typograficzny.
- [x] Kolory: bez zmian; istniejący semantyczny focus ring pozostaje źródłem
  informacji.
- [x] Obramowania: `BORDER-06` oraz `BWIDTH-09..13`; przejęcie fokusa ma
  kończyć się na elemencie z istniejącym `Stroke-Strong`, bez skoku layoutu.
- [x] Cienie: bez zmian; menu zachowuje dotychczasową elewację.
- [x] Interakcje: spóźniona odpowiedź zapisuje stan panelu tylko przy zgodnej
  parze `annotationId + epoch`; po usunięciu fokus idzie do następnego bboxa,
  potem poprzedniego, a przy pustej liście do kanwy.
- [x] Komponenty: wyłącznie istniejące `RegionOverlay`, `Button` i
  `AnnotationPopover`; nie powstaje nowy element inline ani komponent `common/`.

Kryteria testowe: realna trasa `FrameEditor → AnnotationPopover` z HTTP jako
jedynym mockiem sprawdza obie strony granicy martwy/żywy kontekst. Testy fokusa
sprawdzają konkretny trwały cel po usunięciu, nie samą kolejność zdarzeń
jsdom i nie tylko warunek `activeElement !== body`.

## 2026-09-16 — FE-015-FIX2: implementacja i sondy

Każda mutacja edytora dostaje teraz niezmienny snapshot kontekstu selekcji
`{ annotationId, epoch }` obok swojego intentu. `onError` zapisuje
`categoryActionError` i konflikt `category_name_exists` tylko wtedy, gdy snapshot
nadal jest bieżącym kontekstem. Warunek jest sprawdzany ponownie po asynchronicznym
odświeżeniu profilu, bez wyliczania rodzajów kontekstu. `onSuccess` używa tej samej
reguły do czyszczenia stanu prezentacji, więc stary sukces nie może wyczyścić
bramy nowszego kontekstu o tym samym ID. `onSettled` zeruje wyłącznie techniczny
`createdCategoryRef` i nie zapisuje nic do panelu.

Pierwsza wersja snapshotu korzystała z callbacka React Query `onMutate`. Pełna
suita celowo ją odrzuciła testem architektury „`registers no onMutate handler
anywhere`”, który chroni zakaz optymistycznych aktualizacji danych. Snapshot jest
więc częścią zmiennej mutacji `{ intent, selectionContext }`; nie zmienia body
HTTP i respektuje bramkę architektury.

Menu usuwania nie oddaje już fokusa openerowi, który za chwilę znika. Wybiera
następny bbox w kolejności dokumentu, a gdy go nie ma — poprzedni. Po usunięciu
jedynego bboxa fokus przechodzi na trwale istniejącą kanwę `listbox`, która ma
`tabIndex={-1}`: jest programowym punktem kontynuacji, ale nie dokłada nowego
przystanku do zwykłej kolejności Tab. Reguła FIX1 dla `Escape`, kliknięcia poza
menu, `blur` i wyjścia Tabem pozostaje nietknięta.

Sondy wykonano przez `Copy-Item`, po czym kopię przywrócono i porównano SHA256:

| Finding | Cięcie | Wynik |
|---|---|---|
| spóźniona odpowiedź | predykat własności kontekstu wymuszony na `true` | martwy kontekst padł na alercie w pustym panelu (`annotationReviewFlow.test.tsx:625`), a żywy kontekst pozostał zielony |
| fokus po usunięciu | przywrócony zwrot fokusa do usuwanego bboxa | oba testy padły na bezpośrednich szpiegach `focus`: zero wywołań dla trwałego sąsiada i kanwy |

SHA256 po przywróceniu, zgodne z kopią sprzed cięcia:

- `FrameEditor.tsx` — `64E4409767CFE20F8E2FA41F7DE657932ABCBBDB1A8E0AFCC955E253774815F0`
- `RegionOverlay.tsx` — `35B85F809DCD03EA48D805A6EDEFACE0ABF273D8DFFE540FFFBDC694C7F39720`

Regresje mierzą regułę, nie przypadkową kolejność jsdom: testy usunięcia
szpiegują `focus()` na konkretnym trwałym celu i dodatkowo potwierdzają końcowy
`activeElement`. Test asynchroniczny czeka na drugie pobranie profilu, więc nie
może przejść przed zakończeniem `onError` i późnym zapisem konfliktu.

## 2026-09-16 — FE-015-FIX2: pełna bramka

Po dwóch commitach produkcyjnych FIX2 uruchomiono jednym nieprzerwanym procesem,
z absolutną ścieżką do `scripts\check.ps1`. Wynik: **9/9 PASS, zero SKIP**.

| Etap | Wynik | Czas / liczba |
|---|---|---|
| backend format | PASS | 1,3 s |
| backend lint | PASS | 0,1 s |
| backend typy | PASS | 10,8 s; 99 plików |
| backend testy | PASS | 342,1 s; 356/356 |
| frontend typy | PASS | 1,4 s |
| frontend testy | PASS | 35,4 s; 673/673 |
| frontend build | PASS | 4,0 s |
| E2E | PASS | 97,5 s; 19/19 |
| E2E root safety | PASS | 0,8 s; 2/2 |

`ECONNREFUSED 127.0.0.1:8000` wystąpił wyłącznie w przechodzącym teście
`vertical-flow.spec.ts`, który celowo restartuje backend podczas OCR.

Po bramce ponownie zmienił się tylko
`docs/tickets/FE-001/screenshots/error-1440.png`. Pomiar RGB względem `HEAD`:
9 pikseli, bbox `(312, 95)–(315, 101)`, maksymalna delta kanału 1 — identyczny
znany dryf FE-014/FIX1, bez związku z FIX2. Plik przywrócono z `HEAD`. Porty
8000, 5173 i 5174 pozostały bez nasłuchu.
