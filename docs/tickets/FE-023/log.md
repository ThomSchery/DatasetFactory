# FE-023 — log wykonania

## Design Plan (2026-11-09, przed zmianą `frontend/src/`)

Baza: main `d3ac199`, branch `feat/fe-023-shell-polish`. Wykonawca: Claude
(`traycer-implement`). Bez Figma MCP, bez zrzutów Figmy; widoczna geometria
ekranów FE-022 bez zmian. Przeczytane: `AGENTS.md`, `frontend/src/AGENTS.md`,
`.agent/guidelines/new-component.md`, `tokens.css`, moduły wytycznych Siatka
i Odstępy, Kolor, Obramowanie, Szerokość obramowania, Promień, Nakładki,
Przezroczystość.

### Elementy interfejsu

1. **Pasek górny** (`AppShell`, `.df-shell__bar`) — tło `surface/panel`
   44 px; ☰ (lewa), ⋮ (prawa) bez zmian położenia. Nowe: tło paska widoczne
   także w pasie rezerwy `scrollbar-gutter: stable` (prawa krawędź okna).
2. **☰** — jedyny przełącznik panelu bocznego na każdej szerokości:
   < 768 otwiera i zamyka szufladę, ≥ 768 zwija i rozwija pasek ikon.
   `aria-expanded` = faktyczna widoczność panelu, `aria-controls` = id panelu
   (element istnieje także, gdy panel jest ukryty), nazwa „Sections”.
3. **Panel boczny** (`SideNav`) — pasek ikon 56 px ≥ 768 bez przycisku `|←`
   (pierwsza pozycja listy na górze paska); szuflada < 768 bez przycisku
   zamknięcia `|←`, zaczyna się pod paskiem górnym (☰ widoczny i klikalny
   nad scrimem); fokus po otwarciu na pierwszej pozycji, pułapka Tab,
   Escape, klik w scrim, wybór sekcji, powrót fokusu na ☰ — bez zmian.
   Pozycje i stan aktywny (`aria-current`) bez zmian.
4. **Icon** — nowa ścieżka `profile` (koło zębate, środek 12/12, w całości
   w `viewBox` z obrysem); ikona `collapse` usunięta (brak użyć). Koło zębate
   występuje w panelu bocznym (Setup for scan) i w pigułce Profile
   przełącznika Upload / Profile / Run — oba miejsca dostają poprawkę
   automatycznie.
5. **Pigułka Profile** w przełączniku — tylko ikona (pkt 4), układ bez zmian.
6. **Niewidoczne obszary dotyku** (`useTouchTargets`) — bez zmiany wyniku,
   tylko koszt obliczeń (cache przycięcia per przodek).

### Checklista (new-component.md §2.2)

- [x] **Layout / siatka (GRID-01/02/04/06/12/14, SPACING-01/07):** bez nowych
  wymiarów. `--topbar-height` (44 px) wyznacza wysokość pasa w kolorze paska
  w rezerwie przewijania; `--sidenav-width` 56 px bez zmian. Szuflada startuje
  od `--topbar-height` (inset), szerokość bez zmian. GRID-14: ikony nadal
  24 px, rysowane w swoim `viewBox` bez skalowania; poprawka koła zębatego
  usuwa wyjście poza `viewBox` (ucięte ząbki). GRID-04/06: ☰ i pozycje paska
  zachowują obszary dotyku z FE-022 FIX1/FIX2 (bez zmiany progów).
- [x] **Typografia:** bez zmian (pasek i panel bez tekstu widocznego).
- [x] **Kolory (COLOR-01/02/10):** pas w rezerwie = `--color-surface-neutral-default`
  (`surface/panel`, kolor paska, 30 %), reszta tła = `--color-background-primary-default`
  (`surface/page`, 60 %). Bez nowych tokenów i wartości.
- [x] **Obramowania (BORDER-02/03, BWIDTH-05/06/08/13):** krawędź paska ikon
  `--border-width-default` + `--color-stroke-panel-default` bez zmian. Obrys
  ikon 1.5 i `vector-effect: non-scaling-stroke` bez zmian (BWIDTH-08).
- [x] **Promień (RADIUS-05 „Dopasowanie ikonografii”):** koło zębate z
  `stroke-linecap/linejoin: round` jak pozostałe glify (UI ma radius > 0).
- [x] **Nakładki (OVERLAY-01/03/04/06):** scrim szuflady `--color-overlay-scrim`
  i cień `--shadow-elevation-high` bez zmian; scrim zaczyna się pod paskiem
  górnym, więc ☰ nad nim pozostaje widoczny i działa.
- [x] **Interakcje / przezroczystość (COLOR-07, OPACITY-01/02):** stany ☰
  (hover/focus/disabled) z `Button variant="muted"` bez zmian.
- [x] **Komponenty (§4–5):** `Button`, `Icon`, `NavItem`, `SideNav`,
  `useTouchTargets`; brak nowego komponentu, katalog bez zmian.

### Decyzje

1. **Pasek do krawędzi:** tło `html` = kolor strony + pas
   `linear-gradient(surface/panel, surface/panel)` o rozmiarze
   `100% × --topbar-height`, `repeat-x`. Tło `html` maluje cały canvas, także
   pas rezerwy (którego `body` i powłoka nie pokrywają), a obraz `repeat-x`
   powtarza się poziomo do prawej krawędzi okna. `body` i powłoka nadal malują
   kolor strony pod treścią, więc pas widać tylko w rezerwie, dokładnie na
   wysokości paska; pas przewija się razem z paskiem (tło korzenia przewija
   się z dokumentem). `scrollbar-gutter: stable` zostaje, układ treści nie
   zmienia się (FE-017/FE-019). Gdy dokument się przewija, w rezerwie jest
   pasek przewijania przeglądarki — tło paska dochodzi do niego.
   Odrzucone: pasek szerszy o `100vw − 100%` — wychodzi poza `clientWidth`
   i daje przewijanie w poziomie.
2. **☰ zamyka szufladę:** szuflada (scrim i panel) zaczyna się pod paskiem
   górnym, więc ☰ zamyka ją kliknięciem jak przełącznik (wcześniej scrim
   przykrywał ☰ i zamykał szufladę tylko jako „klik poza”). Pułapka fokusu
   bez zmian; klawiatura zamyka Escape.
3. **Koło zębate:** własna geometria (bez zestawu ikon, bez licencji
   zewnętrznej) — opis w sekcji wykonania.
4. **Vitest:** limit testów pliku `profileWorkspace.test.tsx` 15 s
   (`describe(..., { timeout: 15_000 })`), `asyncUtilTimeout` 5 s zostaje
   krótszy od limitu testu, więc zawieszone oczekiwanie zgłasza własny błąd.
5. **useTouchTargets:** memoizacja przycięcia per (przodek, tryb pozycji)
   i stylów per element w obrębie jednej aktualizacji; wynik identyczny.

## Wykonanie (2026-11-09)

Najpierw testy, potem poprawki; każdy nowy test uruchomiony na kodzie `d3ac199`
(po czysto mechanicznym przeniesieniu ścieżek ikon do `iconPaths.ts`) i
czerwony, potem zielony.

### 1. Pasek górny do prawej krawędzi

`global.css`: tło `html` = `--color-background-primary-default` + pas
`linear-gradient(--color-surface-neutral-default ×2)` `100% × --topbar-height`,
`repeat-x`, `0 0`. `scrollbar-gutter: stable` bez zmian.

Test `e2e/fe023-shell.spec.ts` („FE-023 top bar reaches the right window edge”):
desktop 360 / 768 / 1200 / 1920 (rezerwa 15 px) i telefon 360 (nakładany
pasek). Kolor malowany w punkcie liczony jak w przeglądarce: najwyższy element
z nieprzezroczystym tłem z `elementsFromPoint`, a gdy go brak — canvas, czyli
tło `html` (kolor + pas obrazu w układzie dokumentu). Punkty `innerWidth − 1`,
środek rezerwy i ostatni piksel układu, na górze / środku / dole paska →
kolor paska; 4 px pod paskiem → nie kolor paska. Szerokość układu mierzona
na `body` (Chromium nie odejmuje w `documentElement.clientWidth` rezerwy bez
paska przewijania — jak w FE-022). Z paskiem przewijania (Profiles, okno
360 px wysokości): szerokość układu taka sama jak bez niego (FE-017/019),
pasek górny dochodzi do paska przewijania. Przed poprawką 4/5 FAIL
(`(1919, 1) painted by canvas: rgb(34, 37, 42) ≠ rgb(43, 48, 59)`); telefon
przechodził już wcześniej (brak rezerwy).

### 2. ☰ zamiast |←

`SideNav`: usunięte przyciski „Collapse sections” (pasek) i „Close sections”
(szuflada) oraz ich CSS; `onClose` służy tylko szufladzie. Szuflada (scrim
i panel) zaczyna się od `--topbar-height`, więc ☰ jest nad nią widoczny
i zamyka ją jako przełącznik; fokus po otwarciu na pierwszej pozycji (Upload),
pułapka Tab, Escape, scrim, wybór sekcji i powrót fokusu na ☰ bez zmian.
Stan zwinięcia paska ikon żyje w `AppShell` i przetrwa nawigację (jak dotąd).
Ikona `collapse` usunięta z `Icon` (brak użyć).

Testy: `routes.test.tsx` — „collapses and restores the strip with ☰ alone,
and keeps the choice across routes” (brak |←, `aria-controls` wskazuje pasek
także ukryty, stan po przejściu na Profile), „hides the sections below 768 px
and opens them as a drawer from ☰” (bez przycisków w szufladzie, fokus na
Upload, `aria-controls` zawiera dialog), „closes the drawer with the same ☰”,
pułapka fokusu i obsługa klawiaturą przepisane; przed poprawką 4 FAIL.
E2E `fe023-shell.spec.ts`: „below 768 px ☰ opens and closes the drawer”
(klik w ☰ przy otwartej szufladzie — wcześniej przykryty scrimem) i „from
768 px ☰ collapses and restores the strip, across routes”; przed poprawką
2/2 FAIL. Spec zgodności FE-022: ścieżka „strip collapsed” zwija pasek ☰
(+ asercja `aria-expanded=false`), progi bez zmian.

### 3. Koło zębate

Własna geometria (bez zestawu ikon, bez zewnętrznej licencji): 8 zębów co 45°
od góry, wierzchołki na r 9.75 (±9°, łuk), podstawy na r 7.25 (±14°, łuk
między zębami), piasta r 3; środek 12/12. Zasięg konturu 2.25–21.75,
z obrysem 1.5 → 1.5–22.5. Zaokrąglone złącza jak w pozostałych glifach.

Test `e2e/fe023-icon-geometry.spec.ts` (Chromium `getBBox()` każdej ścieżki
z `ICON_PATHS`, `stroke-width` czytane z `Icon.css`): wszystkie ikony
w 0–24 z połową obrysu; dla `profile` środek konturu = środek piasty ± 0,25
i oba = 12/12 ± 0,25. Przed poprawką FAIL: `profile: left 0.45, top −1.05,
right 23.75, bottom 22.25` oraz `outline centre {12.1, 10.6}, centre element
{12, 12}`. Pozostałe ikony mieściły się już wcześniej.

### 4. P3-a — Vitest `profileWorkspace.test.tsx`

`describe(..., { timeout: 15_000 })`; `asyncUtilTimeout` 5 s bez zmian,
asercje bez zmian. Test strażnik „gives each test room for several slow waits,
not just one (FE-023 P3-a)” sprawdza `task.timeout ≥ 3 × asyncUtilTimeout`;
przed poprawką FAIL (`5000 < 15000`). Na tej maszynie flake nie odtworzył się
przed poprawką (3/3 pełne przebiegi 757/757 zielone, 08:28–08:31), więc
strażnik jest deterministycznym dowodem przyczyny.

Po poprawce 3 kolejne pełne przebiegi `npx vitest run`:

| Przebieg | Start | Wynik | Czas |
|---|---|---|---|
| 1 | 08:46:17 | 43 pliki, 762/762 PASS | 50,9 s |
| 2 | 08:47:10 | 43 pliki, 762/762 PASS | 45,2 s |
| 3 | 08:47:57 | 43 pliki, 762/762 PASS | 53,7 s |

### 5. P3-b — `useTouchTargets`

`createUpdateCache()` na jedną aktualizację: `getComputedStyle` najwyżej raz
na element, a przycięcie memoizowane per (przodek, sposób pozycjonowania
pudełka poniżej: flow / absolute / fixed) — reguła containing block z FIX2
bez zmian, więc wynik identyczny. Nic nie przechodzi między aktualizacjami.

Testy: `useTouchTargets.test.tsx` — „reads each element's computed style at
most once per update” (30 celów, 12 wrapperów; przed poprawką 481 odczytów
z powtórzeniami → FAIL, po: każdy element raz) i „still keeps the hit area
inside the shared scroll container” (wartości `--touch-*` przy krawędzi
kontenera; zielony przed i po — strażnik wyniku). E2E N1/N2 z FE-022
(`fe022-touch-targets.spec.ts`, 7 testów) zielone.

Pomiar `e2e/perf/touch-targets.measure.ts` (poza bramką; uruchomienie:
`node scripts/playwright.mjs test --config e2e/perf/playwright.perf.config.ts`):
czas każdego wywołania `update` z `requestAnimationFrame`, 300 przewinięć
(zdarzenie `scroll`) na stan, coarse pointer, Chromium headless; mediana
z 3 przebiegów (rozdzielczość `performance.now` 0,1 ms):

| Stan | Cele przed / po | p95 przed (3 przebiegi) | p95 po (3 przebiegi) | p50 przed → po |
|---|---|---|---|---|
| Review 360 | 16 / 16 | **4,7** ms (2,9 / 4,7 / 4,9) | **1,0** ms (1,0 / 1,0 / 1,3) | 1,3 → 0,6 |
| Review 992 | 27 / 26 | **7,9** ms (7,1 / 7,9 / 8,0) | **1,7** ms (1,6 / 1,7 / 1,7) | 2,4 → 0,8 |
| Profiles 992, Numbers rozwinięte | 35 / 34 | **9,2** ms (8,9 / 9,2 / 9,8) | **1,9** ms (1,6 / 1,9 / 2,6) | 2,4 → 0,9 |

Jeden cel mniej przy 992 to usunięty przycisk `|←`.

## Bramka końcowa (2026-11-09)

E2E FE-023 + FE-022 przed bramką: `fe023-icon-geometry` 2, `fe023-shell` 7,
`fe022-figma-parity` 26 (progi bez zmian), `fe022-touch-targets` 7 — 42/42 PASS.

`scripts/check.ps1`, porty 5193/8033/8034 (Git Bash `export`),
`PYTEST_ADDOPTS=--basetemp=D:/tmp/fe023-gate-pytest`: **9/9 PASS, 0 SKIP** —
ruff format, ruff check, mypy, pytest 473/473, tsc, Vitest 762/762 (43 pliki),
vite build, Playwright 74/74 (65 z FE-022 + 9 nowych FE-023), E2E root safety
4/4. Historyczne PNG w `docs/tickets/` przywrócone `git checkout`;
wygenerowany przez bramkę `FE-001/screenshots/run-setup-1440.png` usunięty.
`.env` skopiowany z repo bazowego (ignorowany przez git). Bez zmian backendu.

Widoczna geometria ekranów bez zmian (parity zielone z tymi samymi progami),
więc `FE-022/app-geometry.json` bez ponownego pomiaru. Zmiana widoczna:
pas w kolorze paska w rezerwie przewijania, brak `|←` w panelu, szuflada
pod paskiem górnym, nowy glif koła zębatego.

## FIX1 — Design Plan (2026-11-09, przed zmianą `frontend/src/`)

Źródło: cold review `70cc019` (artefakt `fe-023-cold-review`), jedno P2:
szuflada pod paskiem górnym odsłaniała ⋮ More poza modalnym zakresem —
klik w More przy otwartej szufladzie przenosił fokus poza dialog, a Escape
szuflady (lokalny dla panelu) już do niej nie docierał. Decyzja koordynatora:
szuflada zostaje modalna, ☰ jedynym przełącznikiem, zakres modalny = ☰ + panel.

- [x] Layout/Siatka, Typografia, Kolory, Obramowania, Cienie: bez zmian
  (GRID-*, SPACING-*, COLOR-*, BORDER-*, BWIDTH-*, RADIUS-* jak w planie FE-023).
- [x] Nakładki (OVERLAY-03/06): scrim bez zmian; elementy poza zakresem
  dostają `inert` — nieklikalne, poza kolejnością Tab, poza drzewem
  dostępności — zamiast samego przykrycia scrimem.
- [x] Interakcje (COLOR-07, OPACITY-*): ☰ bez zmian wyglądu i stanów.
- [x] Komponenty: `SideNav`, `AppShell`, `Button`, `AppMenu` (bez zmian w nim).

## FIX1 — wykonanie (2026-11-09)

- `AppShell`: przy otwartej szufladzie (< 768) `inert` na link „Skip to
  content”, `nav` ⋮ More (cała reszta paska poza ☰) i `main`. ☰ i szuflada
  nigdy nie są `inert`. ≥ 768 (pasek ikon) nic nie jest `inert`.
- `SideNav`: obsługa klawiatury przeniesiona z panelu na `document` na czas
  otwarcia: Tab / Shift+Tab cyklicznie ☰ ↔ pozycje sekcji (z dowolnego miejsca,
  także gdy fokus wypadł na `body`), Escape z dowolnego miejsca zamyka szufladę
  i oddaje fokus ☰. Zdarzenie już obsłużone przez wyższą warstwę
  (`defaultPrevented` albo zatrzymane przez nią) nie zamyka szuflady, więc
  Escape zamyka najpierw warstwę najwyższą.
- Semantyka: `role="dialog"` zostaje z nazwą „Sections”; `aria-modal` usunięte.
  ☰ leży poza elementem dialogu (w pasku), więc `aria-modal="true"` kazałoby
  technologii asystującej ukryć właśnie ☰ — jedyny przełącznik zakresu.
  Modalność zapewnia `inert` na wszystkim poza ☰ i panelem, co Chromium
  potwierdza w drzewie dostępności (test niżej). ☰: `aria-expanded` i
  `aria-controls` bez zmian.

Testy (czerwone przed poprawką, zielone po):

- Vitest `routes.test.tsx`: „traps focus in ☰ and the drawer and closes it
  after a choice” (Shift+Tab z Upload → ☰ → Annotations, Tab → ☰ → Upload),
  „keeps ⋮ More, the skip link and the page out of reach while the drawer is
  open”, „closes the drawer with Escape from ☰ as well as from a section” —
  przed: 3 FAIL. „leaves the header and page live with the strip from 768 px”
  (strażnik ≥ 768, zielony przed i po).
- E2E `fe023-shell.spec.ts` „below 768 px ☰ and the drawer are one modal scope
  (FIX1)”, 360×900 telefon: More i `main` ignorowane w drzewie dostępności
  Chromium (CDP `Accessibility.getPartialAXTree`; role query Playwrighta nie
  uwzględnia `inert`), ☰ nie; klik myszą w współrzędne More nie otwiera menu
  i nie przenosi na nie fokusu, szuflada zostaje; jedno Escape zamyka ją
  i fokus na ☰ (scenariusz z review); Tab / Shift+Tab ☰ ↔ 4 sekcje;
  Escape z sekcji i z ☰ zamyka i fokus na ☰. Przed poprawką FAIL
  (`ignoredByAccessibility(More) false`). Test „from 768 px ☰ collapses and
  restores the strip” rozszerzony: brak `[inert]`, More otwiera i zamyka się.

### Bramka końcowa FIX1 (2026-11-09)

`scripts/check.ps1`, porty 5193/8033/8034, `PYTEST_ADDOPTS=--basetemp=D:/tmp/fe023-gate-pytest`:
**9/9 PASS, 0 SKIP** — ruff format, ruff check, mypy, pytest 473/473, tsc,
Vitest 765/765 (43 pliki), vite build, Playwright 75/75 (26 `fe022-figma-parity`
z niezmienionymi progami, 7 `fe022-touch-targets`, 8 `fe023-shell`,
2 `fe023-icon-geometry`), E2E root safety 4/4. Historyczne PNG przywrócone
`git checkout`; wygenerowany `FE-001/screenshots/run-setup-1440.png` usunięty.

## FIX2 — Design Plan (2026-11-09, przed zmianą `frontend/src/`)

Źródło: sekcja „FIX1 re-review” w `fe-023-cold-review`, dwa P2:
(1) dokumentowy `keydown` szuflady przejmował Tab i Escape natywnego okna
„Unsaved changes” (zablokowana nawigacja z szuflady otwierała okno nad
otwartą szufladą), a obsłużone Escape docierało do skrótów strony
(`ProfileWorkspaceScreen` kończył tryb rysowania); (2) dialog bez
`aria-modal` nie obejmował ☰.

- [x] Layout/Siatka, Typografia, Kolory, Obramowania, Cienie: bez zmian
  (GRID-*, SPACING-*, COLOR-*, BORDER-*, BWIDTH-*, RADIUS-* jak w planie FE-023).
- [x] Nakładki (OVERLAY-03/06): scrim i `inert` bez zmian; warstwy
  koordynowane jawnie (natywny `<dialog>` nad szufladą ma pierwszeństwo).
- [x] Interakcje (COLOR-07, OPACITY-*): bez zmian wyglądu.
- [x] Komponenty: `SideNav`, `AppShell`, `Dialog` (bez zmian w nim),
  `NavItem` (bez zmian).

## FIX2 — wykonanie (2026-11-09)

1. **Koordynacja warstw** (`SideNav`):
   - Wybór sekcji w szufladzie zamyka ją przed nawigacją (klik w link listy),
     więc strażnik „Unsaved changes” otwiera się sam, nad stroną bez `inert`.
     Po „Back to the draft” / Escape fokus wraca na ☰ (okno zapamiętuje ☰ jako
     otwierającego, bo sprzątanie szuflady oddaje fokus przed `showModal`).
   - Klawisze: nasłuch `window` w fazie capture tylko na czas otwarcia.
     Szuflada bierze Tab / Escape wyłącznie, gdy cel zdarzenia leży w jej
     zakresie (☰, panel albo `body` po tapnięciu w nieaktywną stronę) i nie ma
     otwartego `<dialog>` poza panelem. Wtedy `preventDefault` +
     `stopPropagation`: zdarzenie nie dociera do skrótów strony na `window`
     (tryb rysowania, edytor klatek, `RegionOverlay`). Zamiast polegać na
     `defaultPrevented`, warstwa wyżej po prostu jest pomijana.
2. **Semantyczny zakres modalny** (`AppShell`): przy otwartej szufladzie
   kontener powłoki `.df-shell` — najbliższy wspólny przodek ☰ i panelu —
   dostaje `role="dialog"`, `aria-modal="true"`, `aria-label="Sections"`;
   reszta jego zawartości (skip link, ⋮ More, `main`) jest `inert`, więc
   w dialogu zostają tylko ☰ i panel. Panel traci własne `role="dialog"`
   (zostaje `nav` „Sections”). Nic nie jest przenoszone w DOM, ☰ to ten sam
   węzeł i nie traci fokusu. Zamknięta szuflada: kontener bez roli, ☰ zwykły
   przycisk paska z `aria-expanded` / `aria-controls`. Odrzucone: wrapper
   z `display: contents` wokół paska i panelu — ryzyko utraty roli
   w drzewie dostępności części przeglądarek; przeniesienie ☰ do szuflady —
   utrata fokusu przy przemontowaniu.

Testy (czerwone przed poprawką, zielone po):

- E2E `fe023-shell.spec.ts`:
  - „a section blocked by unsaved changes leaves the confirmation alone
    (FIX2)” — 360×900 telefon, `/profiles`, region zaznaczony, zmieniona nazwa,
    ☰ → Upload: okno „Unsaved changes” samo (brak dialogu „Sections”, szuflada
    ukryta, `aria-expanded=false`, URL `/profiles`); fokus na „Back to the
    draft”, Tab → „Discard changes”, Shift+Tab z powrotem; jedno Escape zamyka
    tylko okno, szkic zostaje, fokus na ☰; potem szuflada otwiera się
    i zamyka normalnie. Przed: FAIL (dialog „Sections” wciąż otwarty).
  - „the drawer's Escape does not reach the page underneath (FIX2)” — tryb
    rysowania włączony, ☰, Escape zamyka szufladę, `Draw region` zostaje
    `aria-pressed=true`; kolejne Escape (bez szuflady) kończy rysowanie jak
    dotąd. Przed: FAIL.
  - „below 768 px ☰ opens and closes the drawer” rozszerzony: dialog
    „Sections” ma `aria-modal=true` i zawiera ☰ oraz panel z `aria-controls`;
    po zamknięciu ☰ nie leży w żadnym dialogu. Przed: FAIL (`aria-modal`).
- Vitest `routes.test.tsx`: „makes one labelled modal of ☰ and the drawer while
  it is open (FIX2)” (rola, `aria-modal`, nazwa, ☰ i `nav` „Sections” jako
  potomkowie, ten sam węzeł ☰, po zamknięciu brak dialogu i fokus na ☰) oraz
  „hides the sections below 768 px…” (`aria-controls` wewnątrz modalu) —
  przed: 2 FAIL. Zapytania o linki szuflady idą przez `nav` „Sections”, bo
  modal obejmuje też (nieaktywną) stronę; tak samo jedna linia w specu
  zgodności FE-022 (bez zmiany progów).

### Bramka końcowa FIX2 (2026-11-09)

`scripts/check.ps1`, porty 5193/8033/8034, `PYTEST_ADDOPTS=--basetemp=D:/tmp/fe023-gate-pytest`:
**9/9 PASS, 0 SKIP** — ruff format, ruff check, mypy, pytest 473/473, tsc,
Vitest 766/766 (43 pliki), vite build, Playwright 77/77 (26 `fe022-figma-parity`
z niezmienionymi progami, 7 `fe022-touch-targets`, 10 `fe023-shell`,
2 `fe023-icon-geometry`), E2E root safety 4/4. Historyczne PNG przywrócone
`git checkout`; wygenerowany `FE-001/screenshots/run-setup-1440.png` usunięty.
