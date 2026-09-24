# FE-019 — log

Baza: `main` = `11ba821`. Gałąź `feat-fe-019-combobox-and-copy-panel`.

## 1. Rozpoznanie stanu zastanego

- `GroupedOptionList` ma dwa produkcyjne miejsca użycia na bazie ticketu:
  `AnnotationPopover.tsx` (`single`) i `FrameEditor.tsx` (`multiple`).
- Ekran profilu nie używa `GroupedOptionList`; edytowalną listę klas renderuje
  przez `CollapsibleGroup`, zachowując akcje zmiany nazwy i statusy. Agent
  prowadzący potwierdził korektę ticketu: profil dziedziczy wyłącznie nowy wygląd
  trójkąta z `CollapsibleGroup`, bez dodawania pickera i bez zmiany funkcji listy.
- `Powtórz z poprzedniej klatki` jest dziś zagnieżdżonym `<section>` wewnątrz
  panelu `Anotacje na klatce`.
- `html { scrollbar-gutter: stable }` jest istniejącym zabezpieczeniem FE-017 i
  pozostaje poza zakresem zmian.

## 2. Rozstrzygnięcia implementacyjne

- Stan spoczynkowy kontrolki jest zwinięty. `autoFocus` oznacza jednak stan
  roboczy: kontrolka startuje rozwinięta, więc `Anotacja` zachowuje dotychczasowe
  tempo „pisz od razu, zatwierdź Enterem” bez dodatkowego kliknięcia.
- W trybie `multiple` tagi są częścią elastycznej, zawijanej ramy. Kontrolka nie
  dostaje poziomego przewijania; jej wysokość rośnie wraz z liczbą tagów.
- Gdy nie ma czego powtarzać, panel `Powtórz` zostaje z wyjaśnieniem i
  nieaktywną akcją, ale bez listy klas. Nie jest pustą ramką: komunikat rozróżnia
  „pierwszą klatkę” od „poprzedniej klatki bez anotacji”. Ten wariant zachowuje
  obowiązkowe asercje FE-017 i daje operatorowi przyczynę niedostępności funkcji.
- Usunięcie tagu wywołuje wyłącznie zmianę zaznaczenia. Nie dotyka filtra,
  rozwinięcia ani potwierdzenia/kopiowania.

## 3. Design Plan (`new-component.md` §2.2)

Przeczytane: `frontend/src/AGENTS.md`, `.agent/guidelines/new-component.md`,
`frontend/src/styles/tokens.css`, pełne moduły wytycznych „Siatka i odstępy”,
„Stylizacja elementów” oraz „Typografia”, a także katalog i definicje
komponentów wspólnych.

### Elementy interfejsu i właściwe moduły/ID

| Element | Komponent / mechanizm | Wytyczne |
| --- | --- | --- |
| rama pola i połączona lista | `GroupedOptionList` | GRID-01/02/05/08/10, SPACING-01/02/03/07/08, BORDER-03/05/06, BWIDTH-03/05/06/09–14, RADIUS-02–05 |
| filtr wewnątrz ramy | istniejący `TextField`, wizualnie osadzony bez dublowania obrysu | FONTSIZE-02–10, LHEIGHT-09/10, TYPO-02–11, COLOR-06/08/10 |
| tagi zaznaczeń | nieinteraktywna etykieta + `Button` do usunięcia | GRID-05, SPACING-01/13, RADIUS-02/03/05, TYPO-07, COLOR-07/08 |
| `×` czyszczące wybór | `Button size="sm" variant="muted"` | GRID-05, BORDER-06, COLOR-07, OPACITY-02 |
| chevron rozwijania | `Button size="sm" variant="muted"`, `aria-expanded`, `aria-controls` | GRID-05/14, BORDER-06, BWIDTH-05/06, RADIUS-03/05 |
| grupy i wiersze opcji | istniejący `CollapsibleGroup` i roving tabindex | SPACING-01/02, TYPO-07, COLOR-07/09, CASING-02, LSPACE-07/09 |
| lista rozwijana | istniejąca lista `GroupedOptionList`, połączona z ramą | RADIUS-05, SHADOW-03, OVERLAY-04, BORDER-03, BWIDTH-06 |
| stan pusty / `filterAction` | istniejący status i przekazana akcja | COLOR-09, LHEIGHT-10, SPACING-01 |
| trzeci panel lewej kolumny | istniejący `Panel` | SPACING-01/06/10, BORDER-02, RADIUS-02/03, SHADOW-01–03, TYPO-15–17 |

### Checklista

- [x] **Layout/Siatka:** `--size-xs/sm/md`, `--control-height-sm/md`,
      `min-width: 0`, `flex-wrap: wrap`; GRID-01/02/05/08/10 i SPACING-01/07.
      Tagi rosną w dół, lista zachowuje pionowy limit i nie tworzy poziomego
      scrolla.
- [x] **Typografia:** `--font-family-ui`, `--font-size-xs/sm`,
      `--font-weight-regular/semibold`, `--line-height-tight/standard`,
      `--letter-spacing-wide` tylko dla krótkich uppercase nazw grup;
      TYPO-02–11, FONTSIZE-02–10, LHEIGHT-09/10, LSPACE-02/07/09, CASING-02.
- [x] **Kolory:** wyłącznie semantyczne tokeny `--color-*`; tekst strong/weak,
      powierzchnie primary/neutral, brand dla wybranego/fokusa, warning tylko
      dla pustego wyniku; COLOR-01–10, szczególnie COLOR-07/08/09/10.
- [x] **Obramowania:** rama pola `stroke-strong`, połączenie pola i listy przez
      wyzerowanie sąsiadujących promieni; `--border-width-default`,
      `--radius-md` i `--radius-sm`; BORDER-03/05/06, BWIDTH-03/05/06/09–14,
      RADIUS-02–05.
- [x] **Cienie:** `--shadow-elevation-high` tylko dla rozwiniętej listy jako
      warstwy typu dropdown; brak nowych arbitralnych cieni; SHADOW-01–03,
      OVERLAY-04.
- [x] **Interakcje:** hover z istniejących surface/brand tokenów, widoczny
      `focus-visible`, disabled przez `--opacity-disabled`; COLOR-07,
      BORDER-06, OPACITY-01/02. Nowe przyciski mają dostępne nazwy. W samej
      liście pozostaje dokładnie jeden roving tab stop.
- [x] **Komponenty:** bez nowego komponentu wspólnego. Akcje używają `Button`,
      filtr `TextField`, grupy `CollapsibleGroup`, osobna sekcja `Panel`.
      `GroupedOptionList` pozostaje jedną implementacją.

## 4. Plan weryfikacji

- testy komponentu: rama/chevron, tryby startowe, tagi/usuwanie/czyszczenie,
  zachowanie filtra, fokus i jeden tab stop listy;
- test przepływu: osobny panel i wyłącznie klasy z poprzedniej klatki;
- falsyfikacja dwóch wymaganych regresji z kopią pliku, negatywnym przebiegiem,
  odtworzeniem przez `Copy-Item` i porównaniem SHA256;
- Playwright z `ignoreDefaultArgs: ["--hide-scrollbars"]`: prawa krawędź kanwy
  przy 1280/1440/1920 oraz visual QA 1440×1000 i 1920×1080 bez `fullPage`;
- pełna bramka `scripts/check.ps1` dopiero po potwierdzeniu zwolnienia portów
  8000 i 5173; historyczne PNG odtworzone przez `Copy-Item`.

## 5. Falsyfikowalność wymaganych regresji

Plik `GroupedOptionList.tsx` skopiowano przed próbami do lokalnej kopii
kontrolnej. Obie regresje wprowadzono osobno, po każdej plik odtworzono przez
`Copy-Item` (bez `git restore`).

1. **Pusty `Enter`:** celowo dodano aktywację pierwszej opcji dla pustego
   zapytania. Test `ignores Enter in an empty filter until a row is explicitly
   focused` upadł na oczekiwanej asercji `expect(onChange).not.toHaveBeenCalled()`;
   rzeczywiste wywołanie miało `[["score"]]`.
2. **Filtr przez zwiniętą grupę:** celowo usunięto pierwszeństwo filtra z
   `open: filtering || !collapsed.has(...)`. Test `lets filtering reveal a result
   from a collapsed group, then restores the collapse` upadł na oczekiwanym
   braku dostępnej opcji `2` po wpisaniu `2`.

Po każdym odtworzeniu SHA256 źródła i kopii był identyczny:
`D69D592DC603D1CE3E89D98CFF911D601476CE5994EDFEE049E2A397E631E730`.
Po finalnym odtworzeniu oba testy przeszły: **2/2 PASS**.

## 6. Bramka — dwie regresje znalezione i naprawione przed 9/9

Pierwszy pełny przebieg `scripts/check.ps1` (porty potwierdzone wolne) zatrzymał
się na E2E z dwoma prawdziwymi awariami we własnych, nowych testach FE-019 —
żadna nie była defektem środowiska.

**A. Klikanie w `Powtórz` zamykało otwartą `Anotację`.** `AnnotationPopover`
zamyka się na dowolny `pointerdown` poza swoim drzewem DOM
(`popoverRef.current.contains(target)`). Przeniesienie `Powtórz` do osobnego,
sąsiadującego `Panel` (zamiast zagnieżdżonej sekcji) umieściło je poza tym
drzewem, więc rozwinięcie listy w `Powtórz` cichо odrzucało trwającą edycję w
`Anotacji` — dokładnie przeciwieństwo tempa pracy, o które prosił operator.
Naprawa: `Panel` dostał opcjonalny prop `exemptFromOutsideClick`, który
ustawia `data-outside-click-exempt` na własnej sekcji; `AnnotationPopover`
traktuje kliknięcie w taki element jako wewnętrzne. Panel `Powtórz` używa tego
propu. (Pierwsza wersja naprawy owijała `Panel` w dodatkowy `<div>` — to
złamało asercję `dialog.nextElementSibling === copyPanel` w
`annotationReviewFlow.test.tsx`, więc zamieniono ją na przelotkę na samym
komponencie `Panel`, bez dodatkowego węzła DOM.)

**B. Fałszywy alarm w mierniku stabilności krawędzi kanwy.** Nowy
`fe019-layout-stability.spec.ts` liczył „dopasowaną" wysokość viewportu jako
dół `.df-review-copy` plus stały bufor 8 px, ale `<main class="df-shell__main">`
ma własny `padding-bottom: var(--size-lg)` (32 px) pod ostatnim panelem —
bufor 8 px nie pokrywał tego marginesu, więc stan „zwinięty" już przewijał
dokument, zanim cokolwiek się rozwinęło (test, nie produkt). Naprawiono
odczytując realny `padding-bottom` przez `getComputedStyle` zamiast zgadywać
liczbę. Przy okazji usunięto z tego testu asercję `rootClientWidth` — nie jest
to inwariant, którego wymaga ticket (ten mierzy `document.documentElement`,
nie kanwę), i FE-017's własny test nigdy jej nie sprawdzał; jedyny
obowiązujący dowód to `canvasRight` przed/po rozwinięciu i zwinięciu, który
zostaje i przechodzi na 1280/1440/1920.

Po obu poprawkach: `npx vitest run` 719/719, `tsc --noEmit` czysto, oraz
docelowe specyfikacje (`fe019-visual-qa`, `fe019-layout-stability`,
`fe013-conflict-geometry`, `fe013-visual-qa`, `fe017-layout-stability`,
`fe017-visual-qa`, `fe018-visual-qa`) 10/10 zielone przed ponownym pełnym
przebiegiem bramki.

Pełny, nieprzerwany przebieg `scripts/check.ps1` (ścieżka absolutna):
**PASS — wszystkie 9 bramek są zielone** (backend format/lint/typy/testy,
frontend typy/testy/build, E2E 26/26, E2E root safety). Wynik zapisany w tym
pliku; nic nie pominięto (zero SKIP).

35 historycznych zrzutów PNG bramka nadpisała podczas E2E; są to pliki
binarne, więc `core.autocrlf` (powód unikania `git restore` dla pliku tekstowego
w falsyfikacji wyżej) ich nie dotyczy — przywrócono przez `git restore` do
commitowanej wersji i zweryfikowano `git status` bez zmian w `docs/tickets/*/screenshots/`.
Zrzuty FE-019 (`docs/tickets/FE-019/screenshots/`) pozostają nieśledzone i
opisane w sekcji 7.

## 7. Visual QA — obejrzane w pełnej rozdzielczości

- **`annotation-expanded-*`**: `Anotacja` startuje rozwinięta z fokusem w
  filtrze i widoczną listą grup — operator może pisać od razu, zgodnie z
  decyzją o starcie rozwiniętym.
- **`three-panels-annotation-collapsed-*`**: trzy panele w kolumnie —
  `Anotacje na klatce`, `Anotacja` (zwinięta, chevron `▸`), `Powtórz z
  poprzedniej klatki`. Tagi w `Powtórz` zawijają się na kilka wierszy w wąskiej
  kolumnie, bez przewijania poziomego; kontrolka rośnie w dół.
- **`copy-tags-expanded-*`**: rozwinięta lista `Powtórz` pokazuje liczby
  wystąpień przy każdej klasie (5/6/7/8) i grupę „Pola HUD (gra)"; wszystkie
  cztery tagi zaznaczone (checkboxy pomarańczowe), zgodnie z zaznaczeniem w
  tagach powyżej.
- **`profile-triangles-*`**: ekran profilu pokazuje sam nowy, przyciszony
  trójkąt (▾/▸) przy nazwach grup („POLA HUD (GRA)", „LICZBY" zwinięte,
  „LITERY", „SYMBOLE") — bez ramki pickera, bez filtra, bez tagów. Lista
  zachowuje swoją funkcję: `Zmień nazwę` przy każdej pozycji, statusy `GRA`/
  `OCR`. Trójkąt nie zepsuł edytowalnej listy klas.

Wszystkie cztery stany, 1440×1000 i 1920×1080 — bez ucinania, bez przewijania
poziomego, bez artefaktów.
