# FE-025 — log wykonania

## Design Plan (2026-11-12, przed zmianą `frontend/src/`)

Baza: main `4edc37e`, branch `feat/fe-025-figma-icons-polish`. Wykonawca: Claude
Opus (`traycer-implement`). Bez Figma MCP, bez zrzutów Figmy, bez nowych
zależności npm. Przeczytane: `AGENTS.md`, `frontend/src/AGENTS.md`,
`.agent/guidelines/new-component.md`, `tokens.css`, `design-preset.css`,
log FE-024, moduły wytycznych: Kolor (COLOR-01..10), Obramowanie (BORDER-01..09),
Szerokość obramowania (BWIDTH-01..14), Promień (RADIUS-01..05), Nakładki
(OVERLAY-01..07), Cienie (SHADOW-01..05), Siatka i odstępy, Typografia
(rozmiar, grubość, wielkość liter), Przezroczystość.

Źródło ikon: `designs/figma-2026-11-05/icons.json` + `icons/*.svg` (20 ikon,
eksport wektorowy z 2026-11-10, commitowane z tym ticketem). Zestawy:
**Iconly Light** (Piqo Design, licencja Iconly — darmowa do użytku
komercyjnego i osobistego, bez wymogu przypisania; obrys 1.5) — Upload,
Setting, Scan, Edit, Arrow - Right Square, Arrow - Down 2, Arrow - Right 2,
Arrow - Left, Arrow - Right, Play, Profile, Checkbox- selected / Checkbox -
Empty, more-horizontal; **Remix Icon** (licencja Apache 2.0, ikony wypełniane)
— search-2, save-line, add-fill, film-line, contract-left-line (nieużywana,
FE-023), oraz ☰ `Frame 1` (wypełnienie, kształt jak Remix `menu-line`).

### Elementy interfejsu

1. **Pasek** (`AppShell`): ☰ = `Frame 1`, ⋮ = `more-horizontal`. Ikony konta
   nie dodaję.
2. **Panel boczny** (`SideNav`, `navigation.ts`): Upload = `Upload`, Setup for
   scan = `Setting`, Review for scan = `Scan`, Annotations = `Edit`.
3. **Przełącznik** (`NavItem` segment): Upload = `Upload`, Profile = `Setting`,
   Run = `Arrow - Right Square`.
4. **Pola wyboru** (`GroupedOptionList` combobox: Search profile, Source file,
   Profile): po lewej `search-2`, po prawej `Arrow - Down 2` (także w stanie
   otwartym; stan niesie `aria-expanded` i otwarta lista).
5. **Lista Search profile otwarta**: wiersze 35 px (`--list-row-height`),
   tło `surface/page`, tekst 12 / 300, bez znacznika wyboru w trybie `single`;
   nagłówki sekcji 12 / 400 `text/secondary`, bez wersalików; metadane czcionką
   interfejsu w `text/secondary`. Ten sam styl dostają pozostałe listy `single`
   (Source file, Profile, PSM, picker klasy w Review) — jeden komponent.
6. **Pola Run**: etykiety Source file = `film-line`, Profile = `Profile`,
   Sample rate = `Setting`; przycisk Run na Run = `Play`.
7. **Profile**: Save profile = `save-line`, Save as = `add-fill`, Run =
   `Arrow - Right Square`; Draw region i Change screenshot bez zmian ikony
   (brak odpowiednika w Figmie), tylko kolor glifu.
8. **Review**: poprzednia / następna klatka = `Arrow - Left` / `Arrow - Right`.
9. **Grupy klas** (`ClassGroupsPanel`, `GroupedOptionList` inline,
   `CollapsibleGroup`): checkbox po lewej (`Checkbox- selected` /
   `Checkbox - Empty`), chevron po prawej (`Arrow - Right 2` zwinięta,
   `Arrow - Down 2` rozwinięta); pozycje tylko z checkboxem; Custom i OCR
   settings — chevron po prawej. Wiersze 40 px, `radius/4`, etykieta 12 / 300.
10. **Edycja nazwy klasy**: pole na szerokość wiersza (35 px, styl pól Figmy),
    akcje jako przyciski-ikony (potwierdź / anuluj) z nazwami dostępnymi.
11. **Komponent Icon**: dane z SVG Figmy (elementy `path` / `circle`, fill albo
    stroke, `fill-rule`, grubość obrysu z pliku).
12. **Kanwa** (`RegionOverlay`, `ReferenceImage`): obraz domyślnie cały w polu
    (contain), obrysy regionów 1 px.

### Checklista (new-component.md §2.2)

- [x] **Layout / siatka (GRID-01/02/05, SPACING-01):** bez nowych odstępów;
  wiersze `--list-row-height` 35, `--class-row-height` 40, pola
  `--field-height` 34. Edycja nazwy: siatka `minmax(0, 1fr) auto` w wierszu,
  przyciski-ikony `--field-height` × `--field-height`.
- [x] **Typografia (TYPO-07, FONTSIZE-*, Casing):** nagłówki sekcji list
  `--font-size-xs` / `--font-weight-regular`, bez `uppercase` i
  `--letter-spacing-wide`; wiersze `--font-weight-light`; metadane
  `--font-family-ui` zamiast mono (zostaje `tabular-nums`).
- [x] **Kolory (COLOR-02/07/08/10):** stany wyłącznie z tokenów presetu o
  pasującej nazwie (tabela niżej). Nowe mapowania w sekcji 1 `tokens.css`:
  `--color-icon-strong-default` → `--color-icon-primary`,
  `--color-icon-weak-default` → `--color-icon-secondary`,
  `--color-icon-muted-default` → `--color-icon-placeholder`,
  `--color-surface-neutral-pressed` → `--color-surface-panel-pressed`
  (aktualizacja `EXPECTED_MAPPINGS`).
- [x] **Obramowania (BORDER-03/06, BWIDTH-05/06/08):** obrys kontrolek nadal
  `icon/placeholder` (odstępstwo 3:1 z FE-021/FE-024); fokus pól =
  `border/focus`. Obrysy regionów `--border-width-default` (1 px) przy każdym
  powiększeniu (`vector-effect: non-scaling-stroke`). Ikony zachowują obrys 1.5
  z Figmy — odstępstwo od BWIDTH-05 (ikona == obrys UI) na rzecz decyzji
  „ikony dokładnie jak w Figmie”.
- [x] **Promień (RADIUS-02/04/05):** wiersze grup `--radius-sm`; bez zmian
  reszty.
- [x] **Cienie (SHADOW-05):** bez zmian.
- [x] **Interakcje (COLOR-07, OPACITY-01/02):** disabled nadal
  `--opacity-disabled`; hover / pressed / selected jako kolory presetu.
- [x] **Komponenty (§4–5):** brak nowego komponentu. `Icon` (nie ma go w
  katalogu §4 — plik niezmienny, nie edytuję) zmienia źródło danych.
  `CollapsibleGroup` dostaje `markerPlacement` (`start` domyślnie / `end`),
  `GroupedOptionList` przekazuje `end` dla wariantu `inline`. Opis w
  `new-component.md` („trójkątnym znacznikiem”) zostaje — plik niezmienny;
  zmiana glifu odnotowana tutaj.

### Stany → tokeny presetu

| Stan | Gdzie | Token presetu |
|---|---|---|
| spoczynek, tło pola | pola tekstowe, combobox, lista otwarta, wiersze list | `--color-surface-page` |
| spoczynek, tło panelu / przycisku | panele, przyciski | `--color-surface-panel` |
| spoczynek, obrys panelu / listy | panele, lista Annotations, lista otwarta | `--color-border-default` |
| spoczynek, obrys kontrolki | przyciski, pola | `--color-icon-placeholder` (odstępstwo FE-024) |
| hover | przyciski, wiersze list, pola | `--color-surface-panel-hover` |
| wciśnięcie | przyciski, wiersze | `--color-surface-panel-pressed` |
| zaznaczenie | wiersz listy, region w Annotations, pozycja grupy, przełącznik | `--color-surface-panel-selected` (+ obrys `--color-border-focus` na pozycji grupy) |
| fokus | pole aktywne, otwarte pole wyboru, pole nazwy klasy | `--color-border-focus` |
| glif w spoczynku | przyciski, pola, nawigacja | `--color-icon-secondary` |
| glif hover / aktywny / zaznaczony | jw. | `--color-icon-primary` |
| tekst | etykiety, wiersze | `--color-text-primary` / `-secondary` / `-placeholder` |

Interpretacja: ticket pkt 3 i 6 podają dla zaznaczenia hex #383F4C (pomiar
Figmy, w presecie to `surface/panel-hover`), a pkt 2 — regułę „token o
pasującej nazwie” (`surface/panel-selected` #4B5465). Rozstrzygam według pkt 2
(decyzja użytkownika z 2026-11-10, preset jest wytyczną); różnica odnotowana
w raporcie.

### Decyzje

1. **Kolory w SVG.** Elementy w #F6F7F8 rysuję `currentColor` (kolor glifu z
   roli: `icon/secondary` w spoczynku, `icon/primary` przy hover / zaznaczeniu).
   Inne kolory z Figmy zostają przypisane do elementu przez token: #B9BFCB →
   `icon/secondary` (film-line, save-line, Arrow - Right 2, ptaszek
   checkboxa), #959EB0 → `icon/placeholder` (Play, obrys zaznaczonego
   checkboxa), #23262C → `surface/page` (tło zaznaczonego checkboxa). Pkt 7
   ticketu: „tam obowiązuje Figma”.
2. **Stan częściowy checkboxa** (`aria-checked="mixed"`): Figma nie ma takiej
   ikony; rysuję `Checkbox - Empty` z poziomą kreską środkową (obrys 1.5,
   `icon/secondary`) — różnica kształtu (COLOR-09). Własny dodatek, opisany.
3. **Obraz contain.** `RegionOverlay` z `fill` startuje w skali 1 (cała klatka
   wpisana w pole, wyśrodkowana); `ReferenceImage` `object-fit: contain`.
   Reset bez zmian (skala 1). Rozmiar pola bez zmian.
4. **Regiony 1 px.** Wszystkie obrysy (`default`, `muted`, `draft`, `error`,
   `manual`, szkic, fokus) `--border-width-default`. Zaznaczenie = uchwyty +
   miękkie wypełnienie; fokus = linia przerywana w `border/focus`; błąd nadal
   kolor statusu + przerywana.
5. **Save profile.** Spoczynek: tło `surface/page`, obrys kontrolki, glif
   `save-line`. Dirty (`emphasis`): tło `surface/panel-selected`, tekst i glif
   `text/primary` / `icon/primary`, obrys kontrolki; bez białego wypełnienia.
6. **Przyciski `primary`** rysowane jak `secondary` (Figma: wszystkie
   przyciski na `surface/panel`); dotąd spoczynek używał koloru hover — mieszanie
   ról usunięte.
7. **Pole tekstowe hover** = tło `surface/panel-hover` zamiast białej ramki
   (biel to fokus); fokus pola = obrys `border/focus` + globalny pierścień.

## Wykonanie (2026-11-12)

Najpierw testy, potem zmiany; każdy nowy test uruchomiony na kodzie `4edc37e`
i czerwony (Vitest: `Icon.test.tsx` — brak eksportu `ICONS`; 5 nowych
mapowań w `architecture.test.ts` FAIL na starym `tokens.css`; 2 testy
`CollapsibleGroup`, 4 `GroupedOptionList`, 5 `profileWorkspace` FAIL;
`RegionOverlay` „whole frame fits” FAIL — `178%` zamiast `100%`. E2E:
`fe025-figma-icons-polish.spec.ts` 12/12 FAIL na `frontend/src` z HEAD,
`fe023-icon-geometry.spec.ts` FAIL — brak `ICONS`), potem zielony.

### 1. Ikony (`Icon`, `iconPaths.ts`)

`ICONS: Record<IconName, IconDefinition>` — element po elemencie (`path` /
`circle`, `fill` / `stroke` z farbą, `strokeWidth`, `evenOdd`) z eksportu
Figmy; `figma: { name, file }` wskazuje plik SVG. `Icon` rysuje elementy,
farby jako `data-fill` / `data-stroke`, rozwiązywane w `Icon.css` przez
tokeny (`current` → `currentColor`, `icon-secondary` →
`--color-icon-weak-default`, `icon-placeholder` → `--color-icon-muted-default`,
`surface-page` → `--color-background-primary-default`). Atrybut `data-icon`
z nazwą. Własne (bez odpowiednika w Figmie): `checkbox-mixed` (pusty box
Figmy + kreska), `check` (potwierdzenie edycji), `draw`, `image`, `zoom-in`,
`zoom-out`, `reset`, `trash`, `close`, `video`, `info`, `folder`. Usunięte:
`run`, `hamburger`, stare `menu` (kropki), `settings` (suwaki), stare
`profile` (koło zębate FE-023 → Figma `Setting`).

| Miejsce | Ikona Figmy | `IconName` |
|---|---|---|
| pasek ☰ | `Frame 1` | `menu` |
| pasek ⋮ | `more-horizontal` | `more` |
| panel boczny: Upload / Setup for scan / Review for scan / Annotations | `Upload` / `Setting` / `Scan` / `Edit` | `upload` / `setting` / `scan` / `edit` |
| przełącznik: Upload / Profile / Run | `Upload` / `Setting` / `Arrow - Right Square` | `upload` / `setting` / `arrow-right-square` |
| Search profile, Source file, Profile — lewa / prawa | `search-2` / `Arrow - Down 2` | `search` / `chevron-down` |
| Save profile / Save as | `save-line` / `add-fill` | `save` / `add` |
| Run na Run / Run na Profile | `Play` / `Arrow - Right Square` | `play` / `arrow-right-square` |
| etykiety Run: Source file / Profile / Sample rate | `film-line` / `Profile` / `Setting` | `film` / `profile` / `setting` |
| Review: poprzednia / następna klatka | `Arrow - Left` / `Arrow - Right` | `arrow-left` / `arrow-right` |
| grupy klas: checkbox | `Checkbox- selected` / `Checkbox - Empty` | `checkbox-selected` / `checkbox-empty` (+ własny `checkbox-mixed`) |
| grupy klas: chevron zwinięta / rozwinięta | `Arrow - Right 2` / `Arrow - Down 2` | `chevron-right` / `chevron-down` |
| Pan (zoom) | `Arrow - Right` (ta sama nazwa co dotąd) | `arrow-right` |

`contract-left-line` nie wraca (FE-023). Glify tekstowe usunięte: `▸ ▾`
(`CollapsibleGroup`, combobox), `×` (usuń tag / wyczyść → `close`), `→` w
notatce (teraz „Moves the class from Numbers to Custom.”).

Testy: `Icon.test.tsx` — każda ikona Figmy równa plikowi SVG (czytanemu w
teście, mapowanie kolorów jak wyżej), render tych elementów, farby przez
tokeny, eksport pokrywa wszystkie pliki poza `contract-left-line`, koło
zębate wyśrodkowane (±0.25). `fe023-icon-geometry` — obejmuje nowe elementy
(każdy z własną grubością obrysu, wypełnione bez obrysu) i środek `Setting`
(piasta = `circle`). E2E: mapa miejsc → ikona, ścieżka po ścieżce z plików
SVG (`/profiles` 17 miejsc, `/run` 8, Review 2); brak glifów `▸▾▴◂▶◀▲▼←→↑↓⋮☰`
w tekście `/profiles`, `/run`, Review, `/materials`.

### 2. Stany według presetu

Tokeny (sekcja 1 `tokens.css`, `EXPECTED_MAPPINGS` +4):
`--color-surface-neutral-pressed`, `--color-icon-strong-default`,
`--color-icon-weak-default`, `--color-icon-muted-default`. Zmiany:

- `Button`: `primary` = `secondary` (`surface/panel`); `:active` →
  `panel-pressed`; glif w spoczynku `icon/secondary`, hover / wciśnięcie /
  `aria-pressed` / `emphasis` → `icon/primary`. Draw region wciśnięty
  zostaje biały (FE-021 FIX2), glif `text-on-brand`.
- `Field`: hover = tło `panel-hover` (było: biała ramka), `:focus` = obrys
  `border/focus`.
- `GroupedOptionList`: hover pola `panel-hover`; aktywne / otwarte pole
  obrys `border/focus`; lista otwarta obrys `border/focus` (było
  `text/secondary`); wiersze hover `panel-hover`, wciśnięcie `panel-pressed`,
  wybrany wiersz `single` `panel-selected` (było alpha 12 % akcentu); znacznik
  = checkbox Figmy; `single` bez znacznika; wiersze `single` 35 px, bez
  wcięcia, 16 px od lewej; metadane czcionką interfejsu.
- `CollapsibleGroup`: chevrony Figmy, `markerPlacement`, nagłówek 12 / 400
  `text/secondary` bez wersalików; przycisk chevronu bez szarego tła.
- `NavItem`: glif `icon/secondary` → `icon/primary` (hover / aktywny);
  aktywny segment przełącznika `panel-selected` (było `panel-hover`).
- `AnnotationsPanel`: wiersz hover `panel-hover`, wybrany `panel-selected`
  + `text/primary` (było `panel-hover`), bez białej ramki `aria-pressed`.

E2E `fe025` (testy stanów): pole (spoczynek / hover / fokus / lista
otwarta), przycisk (spoczynek / hover / wciśnięcie, glif secondary → primary,
narzędzia pod obrazem, zoom, panel boczny, przełącznik), wiersze (Annotations,
grupy klas z obrysem `border/focus`, lista Search profile: 35 px, 12 / 300,
nagłówek 12 / 400 bez wersalików, metadane nie-mono), Save profile.

### 3–6. Kolumna profilu

- **Save profile**: spoczynek `surface/page` + `save-line`; dirty
  (`emphasis`) `surface/panel-selected`, `text/primary`, obrys kontrolki
  (`icon/placeholder`, 5.6:1 do panelu). Test: ≠ biały, = `panel-selected`,
  ≥ 4.5:1 tekst, ≥ 3:1 obrys do panelu, ≠ spoczynek.
- **Edycja nazwy klasy**: pole w kolumnie `minmax(0, 1fr)`, 34 px; akcje
  ikonowe `check` / `close` 34 × 34 („Save the new name of class …”,
  „Cancel renaming class …”); notatka o przeniesieniu pod spodem. Enter /
  Escape bez zmian. E2E przy 1200 (kolumna 247) i 360: brak przepełnienia
  wiersza i strony, pole ≥ wiersz − akcje. Vitest: przyciski bez tekstu,
  z glifem, Enter zapisuje, Escape anuluje.
- **Grupy klas**: każdy wiersz 40 px, `radius/4`, `surface/page`, 16 px
  wcięcia, etykieta 12 / 300; nagłówek: checkbox po lewej, chevron po
  prawej; pozycje bez wcięcia, tylko checkbox; zaznaczona `panel-selected` +
  obrys `border/focus`; hover całego wiersza `panel-hover`. Nieaktywne (bez
  regionu) — `opacity-hover` (0.8) zamiast 0.2.

### 8. Obraz contain

`RegionOverlay` `fill`: start w skali 1 (cała klatka wpisana, wyśrodkowana;
`coverView` usunięte), Reset bez zmian. Pole mierzone wewnątrz obramowania
(`border-box − border`) — inaczej wpisany obraz tracił skrajny wiersz
pikseli pod `overflow: hidden` (wykryte testem e2e). `object-fit: contain`
przed pomiarem i w `ReferenceImage` (Run). Pola bez zmian. Testy:
`RegionOverlay` (100 %, 400 × 225, top 87.5, zoom i Reset), e2e — Profile
i Review od 100 %, obraz w polu, styka się z jedną osią, proporcja,
wyśrodkowanie; Run `contain`.

### 9. Regiony 1 px

Wszystkie obrysy `RegionOverlay` (`default`, `muted`, `draft`, `error`,
`manual`, szkic, fokus) `--border-width-default`, `non-scaling-stroke`.
Fokus = `border/focus` linią przerywaną 2/2; zaznaczenie = uchwyty + miękkie
wypełnienie; błąd = kolor statusu + przerywana 6/4. E2E: 1 px przy 100 %, po
trzech krokach zoomu, po zaznaczeniu i przy fokusie.

### Dostosowane specy (progi bez zmian)

- `visual-qa.spec.ts`: start 100 % zamiast kadru (Reset nieaktywny);
  `resetToWholeFrame` klika Reset tylko gdy aktywny.
- `fe022-touch-targets.spec.ts`: wspólna przerwa checkbox ↔ chevron w
  kolejności Figmy (checkbox lewy, chevron prawy).
- `fe016-visual-qa.spec.ts`, `profileWorkspace.test.tsx`: nowy tekst notatki
  i nazwy akcji edycji.
- `fe023-icon-geometry.spec.ts`: elementy zamiast jednej ścieżki.
- `fe022-figma-parity.spec.ts`: bez zmian (mierzy pole, nie obraz).

### Wartości, których preset nie ma (do uzupełnienia w pluginie)

1. Obrys kontrolki ≥ 3:1 — `border/strong` #626C80 ma 2.87:1 na stronie;
   nadal `icon/placeholder` (odstępstwo FE-021/FE-024).
2. Grubość obrysu ikon 1.5 (Iconly; `more-horizontal` 2) — preset ma tylko
   `border-width-1` (BWIDTH-05).
3. Pierścień fokusu 2 px i odsunięcie (`--focus-ring-width/offset`).
4. Wzory linii przerywanej: szkic 6/4, fokus regionu 2/2, błąd 6/4.
5. Stan częściowy checkboxa (ikona) — w Figmie brak.
6. Ikony potwierdź / anuluj edycję (użyte własne `check`, `close`).
7. Wysokości: wiersz listy 35, wiersz grupy 40, pole 34 / 42, kontrolki
   32 / 40 / 48, ikona 24, pasek 44.
8. Mnożniki `--opacity-hover` 0.8 / `--opacity-disabled` 0.2.
9. Bez zmian z FE-024: statusy, scrim, cienie, rodziny i grubości czcionek,
   rozmiary 14 / 20 / 24 / 32, interlinie, `border/subtle`, `text/inverse`.

### Interpretacje

- Zaznaczenie = `surface/panel-selected` #4B5465 (pkt 2), nie #383F4C z pkt 3
  i 6 — #383F4C to w presecie `panel-hover`.
- Combobox otwarty: ta sama ikona `Arrow - Down 2` (Figma nie ma stanu
  otwartego); stan niesie `aria-expanded` i obrys `border/focus`.
- Nagłówki 12 / 400 i brak znacznika dotyczą wszystkich list `single`
  (Search profile, Source file, Profile, PSM, picker klasy w Review) — jeden
  komponent; chevron po prawej tylko w grupach klas (`inline`).
- Checkboxy Figmy dotyczą też listy klas w Review (ten sam komponent).

### Incydenty

- Checkout z `core.autocrlf=true` daje `design-preset.css` z CRLF i test
  „preset untouched” pada niezależnie od zmian. Plik w drzewie odtworzony z
  LF (`git -c core.autocrlf=false checkout`); indeks bez zmian.
- Podczas próby „przed zmianą” błędne polecenie (`tar` z dyskiem `C:` jako
  hostem, łańcuch z `;`) usunęło `frontend/src` z niezacommitowanymi zmianami
  tego ticketu. Przywrócone `git checkout HEAD -- src`, zmiany odtworzone
  skryptami z zapisanych edycji; Vitest i e2e po odtworzeniu jak przed
  incydentem. Innych zmian w drzewie nie było (start: tylko `designs/`).

## Bramka końcowa (2026-11-12)

`scripts/check.ps1`, porty 5193/8033/8034 (Git Bash `export`),
`PYTEST_ADDOPTS=--basetemp=D:/tmp/fe025-gate-pytest`, na pierwszym planie
tury: **9/9 PASS, 0 SKIP** — ruff format, ruff check, mypy, pytest 473/473,
tsc, Vitest 1026/1026 (45 plików), vite build, Playwright 92/92 (26
`fe022-figma-parity` z niezmienionymi progami, 7 `fe022-touch-targets`, 10
`fe023-shell`, 2 `fe023-icon-geometry`, 3 `fe024-design-preset`, 12
`fe025-figma-icons-polish`, reszta jak w FE-024), E2E root safety. Historyczne
PNG w `docs/tickets/` przywrócone `git checkout`; wygenerowany
`FE-001/screenshots/run-setup-1440.png` usunięty. Bez zmian backendu, bez
nowych zależności npm, preset nietknięty.
