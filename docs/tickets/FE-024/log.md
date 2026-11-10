# FE-024 — log wykonania

## Design Plan (2026-11-10, przed zmianą `frontend/src/`)

Baza: main `adf6ea4`, branch `feat/fe-024-design-preset`. Wykonawca: Claude
(`traycer-implement`). Bez Figma MCP, bez zrzutów Figmy, bez Tailwinda (F16
bez zmian), bez nowych zależności npm. Przeczytane: `AGENTS.md`,
`frontend/src/AGENTS.md`, `.agent/guidelines/new-component.md`, `tokens.css`,
`design-preset.css`, moduły wytycznych Siatka i Odstępy, Kolor, Obramowanie,
Szerokość obramowania, Promień, Nakładki, Cienie, Typografia (rodzina,
grubość, rozmiar, wysokość linii, odstępy liter), Przezroczystość.

Preset `frontend/src/styles/design-preset.css` (SHA-256
`76dcfbef4c86223b9888f1bc84ae742e9599ea9e632cbe055b7cce72e3f5a623`) zostaje
bajt w bajt; nic w nim nie jest edytowane.

### Elementy interfejsu

Zmiana nie dodaje ani nie przestawia żadnego elementu. Dotyka wartości, na
których stoją wszystkie ekrany i komponenty wspólne:

1. **Powłoka** (`AppShell`: pasek 44 px, panel boczny / szuflada, przełącznik
   Upload / Profile / Run, tło `html` / `body`) — tła `surface/page` i
   `surface/panel`, obrys `border/default`.
2. **Panele i listy** (`Panel`, `DataList`, `GroupedOptionList`,
   `CollapsibleGroup`, `StatusBadge`, `Notice`, `UiStates`) — powierzchnie
   panel / panel-hover / panel-selected, obrysy, promienie 4 / 8 / 16,
   odstępy elementów. `DataList` w układzie kolumn: `minmax(160px, 1fr)`
   przechodzi na token.
3. **Kontrolki** (`Button`, `TextField`, `SelectField`, `Field`, `NavItem`,
   `FilePickerTile`, `AppMenu`, `Dialog`) — obrys kontrolki (odstępstwo
   3:1 → `icon/placeholder`), fokus `border/focus`, tekst `text/primary` /
   `text/secondary` / `text/placeholder`, tekst na akcencie `icon/inverse`.
4. **Kanwa** (`RegionOverlay`) — obrys regionu `border/focus`, powierzchnie
   zaznaczenia i hover (warstwy alpha nad kolorami presetu).
5. **Ekrany** (`RunListScreen`, `ExportsScreen`, `ProfileWorkspaceScreen`,
   `AnnotationReviewScreen`, `RunSetupScreen`, `FrameToolbar`) — progi
   szerokości przechodzą na kanoniczny zestaw 576 / 768 / 992 / 1200
   (`max-width` z `.98`): 720 → 767.98, 960 → 991.98, 575 → 575.98,
   991 → 991.98.
6. **Design harness** — bez zmian w kodzie; pokazuje te same tokeny.

### Checklista (new-component.md §2.2)

- [x] **Layout / siatka (GRID-01/02, SPACING-01..13):** `--size-none/xxs/xs/
  sm/md/lg/xl` mapują `spacing/0/4/8/16/24/32` i `gap/48` z presetu;
  `--site-padding` → `site/padding/XS`; `element/padding/*` i `element/gap/*`
  → odpowiednie zmienne presetu (D07 z FE-022 bez zmian). `--size-xxl` 64 i
  `--size-3xl` 80 (GRID-01, skala 8-punktowa) nie mają odpowiednika w presecie
  i zostają w sekcji „Not in the preset yet”, podobnie jak wysokości kontrolek
  32 / 40 / 48, ikona 24, pasek 44, kolumny 247 / 205 / 261 / 361 i wysokości
  pól / obrazów (geometria z Figmy 05.11, nie zmienne pluginu). Nowy token
  `--data-list-column-min` (160 px) dla `minmax()` w `DataList`.
- [x] **Typografia (TYPO-02..11, FONTSIZE-02..10, LHEIGHT-09/10/11,
  LSPACE-02/03/09):** `--font-size-xs` → `text/p/sm` (12 px — odstępstwo
  FE-021: 8 / 10 px presetu nie są czytelne), `--font-size-md` → `text/p/md`
  (16 px). `sm` 14 px, `lg` 20, `xl` 24, `2xl` 32, rodziny, grubości,
  interlinie i odstępy liter — poza presetem. Zmiana jednostki: 0.75rem /
  1rem → 12px / 16px z presetu (bez różnicy przy domyślnych 16 px
  przeglądarki; preset podaje px, więc mapowanie bierze px).
- [x] **Kolory (COLOR-01/02/07/08/10):** tła `surface/page` (60 %), panele
  `surface/panel` (30 %), akcent `border/focus` (10 %). Każdy kolor presetu jest
  dokładnym hex zamiast przybliżenia `hsl()`. Stany interakcji (COLOR-07) jako
  warstwy alpha nad kolorami presetu przez `color-mix(in srgb, var(--…) N%,
  transparent)`: hover 6 %, `*-soft` 12 %, hover/active akcentu 80 %. Statusy
  success / warning / error, `surface/error`, scrim — poza presetem (error
  jako dokładny hex z Figmy 03.11). Kontrast liczony po rozwiązaniu `var()`.
- [x] **Obramowania (BORDER-03/05/06, BWIDTH-06/10/11):** `--border-width-
  default` → `--border-width-1`; `--color-stroke-panel-default` → `border/
  default`; `--color-stroke-control-default` → `icon/placeholder` (odstępstwo
  3:1 z FE-021:33 zachowane jako mapowanie, nie wartość); `--color-stroke-
  strong-default` → `text/secondary` (jak w FE-021); `--color-stroke-weak-
  default` (#383F4C, Figma `border/subtle`, nieeksportowane przez plugin) →
  `surface/panel-hover`, ta sama wartość. Grubość 2 px akcentu i pierścienia
  fokusu poza presetem.
- [x] **Promień (RADIUS-02/03):** `--radius-none/sm/md/lg` → `radius/0/4/8/16`.
  `radius/element-S`, `radius/32`, `radius/40` nie mają użycia w aplikacji
  (odnotowane w README jako dostępne, nieużywane). `--radius-pill` poza
  presetem.
- [x] **Nakładki i cienie (OVERLAY-*, SHADOW-03):** scrim i oba cienie poza
  presetem (plugin ich nie eksportuje); wartości bez zmian.
- [x] **Interakcje / przezroczystość (COLOR-07, OPACITY-01/02):** mnożniki
  `--opacity-hover` / `--opacity-disabled` poza presetem, bez zmian.
- [x] **Komponenty (§4–5):** brak nowego komponentu; katalog bez zmian.
  Nazwy `*-impeccable` z `new-component.md` zostają jako nazwy mapowane.

### Decyzje

1. **Konwersja `@theme` w repo, bez Tailwinda.** `frontend/src/styles/
   designPreset.ts`: czysta funkcja `convertThemeBlocks(css, file)` zamienia
   bloki `@theme`, `@theme static`, `@theme inline` na `:root { … }`
   (deklaracje `--*` przepisane 1:1, komentarze zachowane, reszta pliku bez
   zmian). Nieobsługiwana składnia — `@theme reference`, `@utility`,
   `@variant`, `@custom-variant`, `@apply`, `@import "tailwindcss"`,
   `--*: initial`, deklaracja bez `--` wewnątrz `@theme`, zagnieżdżony blok —
   rzuca błąd z nazwą pliku i numerem linii. Plugin Vite `designPresetPlugin()`
   (`enforce: "pre"`, tylko pliki `.css` zawierające `@theme`) woła tę funkcję
   w dev, `vite build` i Playwright (dev server). Vitest czyta ją wprost
   (testy konwersji, kontrastu i architektury).
2. **Preset ładowany jako moduł JS**, nie przez `@import` w `global.css`:
   Vite rozwiązuje `@import` w CSS wewnątrz `postcss-import` z pominięciem
   hooków `transform` innych pluginów, więc blok `@theme` trafiłby do
   przeglądarki bez konwersji. `main.tsx` importuje `design-preset.css` przed
   `global.css`. Kolejność nie wpływa na `var()` (rozwiązywane w czasie
   obliczania wartości), ale zachowuje czytelność kaskady.
3. **`tokens.css` w dwóch sekcjach.** Sekcja pierwsza: wyłącznie mapowania na
   zmienne presetu (`var(--…)` albo `color-mix(… var(--…) …)`), bez żadnej
   wpisanej wartości. Sekcja druga za znacznikiem `Not in the preset yet`:
   wartości z adnotacją pochodzenia (Figma 03.11 / 05.11, FE-SETUP, FE-021,
   FE-022). Test architektury czyta obie sekcje po znaczniku.
4. **Progi szerokości:** `frontend/src/styles/breakpoints.ts` —
   `BREAKPOINTS = { sm: 576, md: 768, lg: 992, xl: 1200 }`, `maxWidth(bp)`
   = `bp − 0.02` dla zapytań `max-width`. `STRIP_MIN_WIDTH` w `AppShell`
   bierze `BREAKPOINTS.md`. Test architektury dopuszcza w `@media` całego
   `frontend/src` tylko 576 / 768 / 992 / 1200 (`min-width`) i 575.98 /
   767.98 / 991.98 / 1199.98 (`max-width`), a w TS/TSX produkcyjnym żadnych
   literałów tych progów poza `breakpoints.ts`. Przeniesienia: `RunListScreen`
   720 → 767.98 (nagłówek listy runów układa się w kolumnę do 767 px zamiast
   do 720 — widoczne tylko w oknie 721–767 px), `ExportsScreen` 960 → 991.98
   (proporcje podziału w 2 kolumnach do 991 px zamiast do 960 — widoczne
   w oknie 961–991 px). Makiety Figmy nie definiują 720 ani 960.
5. **Wygląd:** oczekiwane różnice to dokładne hex presetu zamiast `hsl()`
   oraz warstwy alpha liczone z `text/primary` #F6F7F8 zamiast ad hoc
   `hsl(216 18% 92%)`; pełna lista w sekcji wykonania. Specy FE-022 / FE-023
   i testy dotyku z niezmienionymi progami są dowodem braku zmian geometrii.

## Wykonanie (2026-11-10)

Najpierw testy, potem zmiany; każdy nowy test uruchomiony na kodzie `adf6ea4`
(tokens.css, CSS progów, `AppShell.tsx` przywrócone z HEAD na czas próby)
i czerwony, potem zielony.

### 1. Konwersja `@theme` (`frontend/src/styles/designPreset.ts`)

`convertThemeBlocks(css, file)`: skanuje plik z zamaskowanymi komentarzami,
znajduje `@theme` (bez opcji / `static` / `inline`, także razem), dopasowuje
klamrę, sprawdza każdą deklarację (`--nazwa: wartość`), i przepisuje blok jako
`:root {…}` z zachowaniem komentarzy; reszta pliku bajt w bajt. Błąd
`DesignPresetSyntaxError` z `plik:linia` dla: `@theme reference` / `default`,
`@utility`, `@variant`, `@custom-variant`, `@apply`, `@plugin`, `@source`,
`@config`, `@import "tailwindcss"`, `--x-*: initial` (reset przestrzeni),
`--x: initial`, deklaracji bez `--`, bloku zagnieżdżonego, niezamkniętej
klamry. `parseRootVariables(css)` czyta zmienne z reguł `:root` (preset po
konwersji, `tokens.css`). `designPresetPlugin()` — plugin Vite
`enforce: "pre"`, tylko `.css` zawierające `@theme`; w `vite.config.ts` przed
`react()`. `main.tsx` importuje `design-preset.css` jako moduł przed
`global.css` (decyzja 2). Preset w `dist/assets/index-*.css` po `vite build`:
`--color-surface-page:#23262c`, zero `@theme`.

Testy `designPreset.test.ts` (23): konwersja static / inline / zwykły /
łączony, komentarze (także z „@import "tailwindcss"” i „@utility” w treści),
kilka bloków, plik bez `@theme` bez zmian, 12 przypadków błędów z `plik:linia`,
numer linii deklaracji, zacommitowany preset → 50 zmiennych o wartościach
z pliku, preset nietknięty (nagłówek pluginu, `@theme static {`, `:root {
--border-width-1 }`), podmiana presetu zmienia zmienne, `parseRootVariables`,
plugin (`enforce: "pre"`, filtr plików, błąd buildu). Przed zmianą: moduł nie
istnieje → plik testu FAIL.

### 2. `tokens.css` jako mapowanie

Sekcja 1 (40 tokenów): wyłącznie `var(--preset)` albo `color-mix(in srgb,
var(--preset) N%, transparent)`. Sekcja 2 „Not in the preset yet” (znacznik
`2. Not in the preset yet`): wartości własne z adnotacją źródła (tabela w
`frontend/src/styles/README.md`). Nowy token `--data-list-column-min: 160px`
(`DataList.css` `minmax(var(--data-list-column-min), 1fr)`).
`--color-surface-transparent` = `transparent` (było `hsl(page / 0)`; alpha 0
interpoluje się tak samo w gradientach i przejściach).

| Zmienna presetu | Token aplikacji |
|---|---|
| `--spacing-0/4/8/16/24/32`, `--spacing-gap-48` | `--size-none/xxs/xs/sm/md/lg/xl` |
| `--spacing-site-padding-xs` | `--site-padding` |
| `--spacing-element-padding-l-r-l/m/s` | `--element-padding-x-lg/md/sm` |
| `--spacing-element-padding-u-d-l/m` | `--element-padding-y-lg/md` |
| `--spacing-element-gap-l/m` | `--element-gap-lg/md` |
| `--text-p-sm` (12) | `--font-size-xs` (odstępstwo FE-021:34) |
| `--text-p-md` (16) | `--font-size-md` |
| `--radius-0/4/8/16` | `--radius-none/sm/md/lg` |
| `--border-width-1` | `--border-width-default` |
| `--color-surface-page` | `--color-background-primary-default` |
| `--color-surface-panel` | `--color-surface-neutral-default` |
| `--color-surface-panel-hover` | `--color-surface-neutral-raised`, `--color-stroke-weak-default` (Figma `border/subtle`, ta sama wartość, nieeksportowane) |
| `--color-surface-panel-selected` | `--color-surface-neutral-selected`, `--color-fill-brand-default` |
| `--color-text-primary` | `--color-text-strong-default`; `--color-surface-neutral-hover` = 6 % |
| `--color-text-secondary` | `--color-text-weak-default`, `--color-stroke-strong-default` |
| `--color-text-placeholder` | `--color-text-placeholder-default` |
| `--color-icon-placeholder` | `--color-stroke-control-default` (odstępstwo FE-021:33) |
| `--color-icon-inverse` | `--color-text-on-brand` (Figma `text/inverse`, nieeksportowane) |
| `--color-border-default` | `--color-stroke-panel-default` |
| `--color-border-focus` | `--color-fill-brand-impeccable`; `-hover` / `-active` = 80 %, `-soft` = 12 % |

Bez tokenu aplikacji (dostępne na `:root`): `spacing-2/6`,
`site-padding-m/l`, `gap-16/32`, `size-16/40`, `radius-element-s/32/40`,
`text-p-xxs/xs`, `surface-panel-pressed`, `icon-primary/secondary`,
`border-strong`.

Test architektury (`architecture.test.ts`, „tokens.css is a mapping layer”):
dwie sekcje w kolejności; zbiór tokenów sekcji 1 = `EXPECTED_MAPPINGS`
(40 par z ticketu); każdy wskazuje istniejącą zmienną presetu bez wartości
własnej; sekcja 2 nie dubluje sekcji 1, nie przesłania zmiennych presetu i nie
powtarza żadnego koloru presetu; na `:root` tylko `--*` i `color-scheme`.
Przed zmianą: 44 FAIL (stare `tokens.css`). Dodatkowo: pliki TS/TSX
produkcyjne bez literałów kolorów (hex w stringu, `hsl(`/`rgb(` z liczbą);
wyłączenie `design-preset.css` z testu kolorów CSS.

Test kontrastu (`contrast.test.ts`): rozwiązuje łańcuch `var()` przez
`tokens.css` do presetu, czyta hex / hsl / rgb; nowe: „follows the var() chain
… to the preset's exact hex” (`#23262c`, `#2b303a`, `#959eb0`, `#f6f7f8`,
`12px`, `1px` — przed zmianą FAIL: wartości `hsl()`), parser kolorów, obrys
kontrolki ≥ 3:1 na stronie / panelu / panelu podniesionym. Wszystkie pary
z FE-001 bez zmiany progów.

### 3. Progi szerokości (`frontend/src/styles/breakpoints.ts`)

`BREAKPOINTS = { sm: 576, md: 768, lg: 992, xl: 1200 }`, `maxWidthBelow()`,
`MIN_/MAX_WIDTH_QUERY_VALUES`. `AppShell.tsx`: `STRIP_MIN_WIDTH =
BREAKPOINTS.md`. CSS: `RunListScreen` 720 → 767.98, `ExportsScreen` 960 →
991.98, `ProfileWorkspaceScreen` 991 → 991.98, `AnnotationReviewScreen` 575 →
575.98; 576 / 768 / 992 bez zmian. Test architektury („width thresholds come
from breakpoints.ts alone”): każdy `@media (min|max-width)` w `frontend/src`
tylko z wartością kanoniczną; TS produkcyjny (po usunięciu komentarzy) bez
literałów 575 / 576 / 720 / 767 / 768 / 960 / 991 / 992 / 1199 / 1200 poza
`breakpoints.ts`; `STRIP_MIN_WIDTH = BREAKPOINTS.md`. Przed zmianą 4 FAIL
(`RunListScreen.css`, `ExportsScreen.css`, literał w `AppShell.tsx`, strażnik
`STRIP_MIN_WIDTH`).

### 4. E2E `e2e/fe024-design-preset.spec.ts` (3 testy)

Wartości oczekiwane czytane z `design-preset.css` przez `convertThemeBlocks` +
`parseRootVariables` (nie wpisane). (a) `/materials`: każda z 50 zmiennych
presetu na `:root` równa wartości z pliku; żaden arkusz w przeglądarce nie
zawiera `@theme`. (b) `/profiles`: tło `body` = `surface/page`, pasek =
`surface/panel`, panel = `surface/panel`, obrys panelu = `border/default`
o `border-width-1`, tekst = `text/primary`, margines paska =
`site/padding/XS`. (c) podmiana: `setProperty` zmiennych presetu na `:root`
zmienia tło strony i paska (tokeny są referencjami, nie kopiami). Przed zmianą
(bez importu presetu w `main.tsx`): (a) i (b) FAIL (`Expected "2px" Received
""`, `Expected "rgb(35, 38, 44)" Received "rgba(0, 0, 0, 0)"`). Uwaga:
Chromium podstawia `var()` w obliczonej wartości zmiennej, więc odczyt
`--color-background-primary-default` daje hex, nie `var(--…)` — referencję
dowodzi test (c).

### 5. Dokumentacja

`frontend/src/styles/README.md` (podmiana presetu, pliki, tabela mapowania,
nieużywane zmienne presetu, „Not in the preset yet”, dwa odstępstwa);
`docs/CONTEXT.md` — notatka „Centrum wyglądu: preset z pluginu
figma-tailwind-tokens (2026-11-10, FE-024)”, F16 bez zmian.

### Różnice wyglądu

Dokładne hex presetu zamiast przybliżeń `hsl()` (różnice ≤ 1–2 w kanale):

| Token | Było (hsl → hex) | Jest |
|---|---|---|
| `--color-background-primary-default` | `hsl(220 11% 15%)` ≈ #22252A | #23262C |
| `--color-surface-neutral-default` | `hsl(220 15% 20%)` ≈ #2B303B | #2B303A |
| `--color-surface-neutral-raised`, `--color-stroke-weak-default` | `hsl(219 15% 26%)` ≈ #383F4C | #383F4C |
| `--color-surface-neutral-selected`, `--color-fill-brand-default`, `--color-stroke-panel-default` | `hsl(219/220 15% 35%)` ≈ #4C5567 | #4B5465 |
| `--color-stroke-control-default`, `--color-text-placeholder-default` | `hsl(220 15% 64%)` ≈ #959FB1 | #959EB0 |
| `--color-stroke-strong-default`, `--color-text-weak-default` | `hsl(220 15% 76%)` ≈ #B9BFCB | #B9BFCB |
| `--color-text-strong-default`, `--color-fill-brand-impeccable` | `hsl(210 12% 97%)` ≈ #F6F7F8 | #F6F7F8 |
| `--color-text-on-brand` | `hsl(220 11% 15%)` ≈ #22252A | #23262C |
| `--color-status-error-default` / `-soft` | `hsl(5 83% 72%)` ≈ #F3867C / `hsl(4 48% 16%)` ≈ #3C1815 | #F3877D / #3E1916 |

Inne, wyjaśnione:

- `--color-surface-neutral-hover`: warstwa 6 % liczona z `text/primary`
  #F6F7F8 (`color-mix`) zamiast z ad hoc `hsl(216 18% 92%)` ≈ #E7EAEE — na
  panelu #2B303A daje ≈ #373C45 zamiast ≈ #363B45 (różnica 1 w kanale R).
- `--color-fill-brand-impeccable-hover/-active/-soft`: `color-mix` 80 % / 12 %
  z `border/focus` — ten sam kolor bazowy i alpha co dotąd.
- `--font-size-xs` / `--font-size-md`: `12px` / `16px` z presetu zamiast
  `0.75rem` / `1rem` — identyczne przy domyślnych 16 px przeglądarki; przy
  zmienionym rozmiarze bazowym przeglądarki te dwa kroki już nie skalują
  (preset podaje px). Pozostałe kroki (`sm/lg/xl/2xl`) nadal w rem.
- `RunListScreen` nagłówek listy runów w kolumnie do 767.98 px zamiast do
  720 px (okna 721–767 px); `ExportsScreen` proporcje podziału w 2 kolumnach
  do 991.98 px zamiast do 960 px (okna 961–991 px). Specy FE-022 mierzą
  360 / 576 / 768 / 992 / 1200 / 1400 / 1440 / 1920 — poza tymi oknami.
- `--color-surface-transparent: transparent` zamiast `hsl(220 11% 15% / 0)` —
  bez różnicy w malowaniu (alpha 0, premultiplied).

Geometria bez zmian: spec zgodności FE-022 (26) z niezmienionymi progami,
testy dotyku (7), FE-023 (12) — 48/48 PASS razem z FE-024 (3) na portach
5193 / 8033 / 8034 przed bramką.

### 6. Spec FE-021 i serializacja `color-mix`

Pierwszy przebieg bramki: 8/9, E2E 79/80 — `fe021-dialog.spec.ts` „FIX2: draw
mode has a visible high-contrast pressed state” FAIL (`Received 1.49`,
sprawdzenie po `hover()`). Przyczyna: Chromium serializuje wynik `color-mix()`
(a także `rgb(from …)`) jako `color(srgb 0.9647 0.9686 0.9725 / 0.8)`, a parser
w tym specu brał kanały 0–1 jako 0–255. Poprawka w parserze specu: kanały
`color(srgb …)` × 255; próg 3:1 i asercje bez zmian. Po poprawce 5/5 PASS.
Wartość malowana jest ta sama co dotąd (#F6F7F8 przy alpha 0.8).

## Bramka końcowa (2026-11-10)

Przebieg 1 (przed poprawką z pkt 6): PASS ruff format, ruff check, mypy,
pytest 473/473 (548 s), tsc, Vitest 974/974 (44 pliki), vite build; E2E
79/80 FAIL (pkt 6); E2E root safety SKIP.

Przebieg 2: 8/9 — E2E 80/80 PASS, ale „E2E root safety” FAIL:
`scripts/e2e-runtime-root.node.mjs` importuje `vite.config.ts` czystym Node
(type stripping), a Node ESM nie rozwiązuje importu bez rozszerzenia
(`Cannot find module '…/src/styles/designPreset'`). Poprawka: import
`./src/styles/designPreset.ts` w `vite.config.ts` i `allowImportingTsExtensions`
w `tsconfig.json` (dozwolone przy `noEmit`). Po poprawce tsc OK, root safety
4/4, testy konwersji 23/23.

Przebieg 3 — `scripts/check.ps1`, porty 5193/8033/8034 (Git Bash `export`),
`PYTEST_ADDOPTS=--basetemp=D:/tmp/fe024-gate-pytest`: **9/9 PASS, 0 SKIP** —
ruff format, ruff check, mypy, pytest 473/473, tsc, Vitest 974/974 (44 pliki),
vite build, Playwright 80/80 (26 `fe022-figma-parity` z niezmienionymi
progami, 7 `fe022-touch-targets`, 10 `fe023-shell`, 2 `fe023-icon-geometry`,
3 `fe024-design-preset`, 5 `fe021-dialog`, reszta jak w FE-023), E2E root
safety 4/4. Historyczne PNG w `docs/tickets/` przywrócone `git checkout`;
wygenerowany `FE-001/screenshots/run-setup-1440.png` usunięty. `.env`
skopiowany z repo bazowego (ignorowany przez git), `.venv` i `node_modules`
zainstalowane w worktree z cache na D:. Bez zmian backendu, bez nowych
zależności npm. Preset `design-preset.css` zacommitowany bajt w bajt (SHA-256
`76dcfbef…a623`).
