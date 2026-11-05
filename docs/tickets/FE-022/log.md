# FE-022 — log wykonania

## Design Plan (2026-11-05, przed zmianą `frontend/src/`)

Źródło wiążące: `designs/figma-2026-11-05/geometry.json` i `variables.json` (odczyt MCP 05.11). Bez Figma MCP, bez zrzutów i bez PNG z `designs/figma-2026-11-03/`. Wykonawca: Claude (Codex wyczerpał limit; poprzedni wykonawca nie zostawił zmian). Bazowy stan: main `11342f5`, Vitest 736/736 przed zmianami.

### Elementy interfejsu (wszystkie, których dotyka ticket)

1. **Pasek górny 44 px** — ☰ po lewej (otwiera/przywraca panel boczny, `aria-expanded`, `aria-controls`), ⋮ po prawej (menu `AppMenu`). Bez tekstu, bez ikony konta (S01). Ikony 24 px.
2. **Panel boczny** (nowy prymityw `SideNav`) — 4 pozycje z ikonami 24 px i nazwą dostępną + podpowiedzią (`title`): 1. Upload `/materials`, 2. Setup for scan `/profiles`, 3. Review for scan `/run`, 4. Annotations `/annotations`. < 768 px: szuflada (modalna, Escape, klik poza, pułapka fokusu, powrót fokusu na ☰). ≥ 768 px: pasek ikon 56 px z przyciskiem zwijania `|←` na górze; zwinięty pasek przywraca ☰.
3. **Menu ⋮** — Exports, Run list jest już w panelu bocznym; pozycja „OCR engine” otwiera okno z `engine_id`, wersją, `quality_gate`, `experimental` i zdaniem o pełnej ręcznej weryfikacji (CONTEXT.md:235–236).
4. **Przełącznik Upload / Profile / Run** — pigułka 361×48 (328×48 przy 360), pozycje 100–120×40, promień 40 (`radius-pill`), ikona 24 + etykieta 12/300. Na `/materials`, `/profiles`, `/run`; znika na Review i pozostałych ekranach.
5. **Upload** — kafel „Upload Video” (328×173 przy 360, pełna szerokość treści wyżej, obrys `#4B5465`, promień 4) z ikoną; klik / Enter / Spacja → `POST /api/v1/local-files/pick` (systemowe okno w procesie potomnym, endpoint synchroniczny w puli wątków), wybrana ścieżka → istniejący `POST /materials`. Przycisk tekstowy „Enter path” rozwija pole ścieżki. Upuszczenie pliku → podpowiedź „Click to choose a file”. Po imporcie kafel pokazuje nazwę i parametry materiału (API nie daje podglądu). Stany: picking (busy), importing, error (`role=alert` z kodem), cancelled (bez komunikatu).
6. **Profile** — lewa kolumna 247 px (≥ 768): combobox Search profile (pierwsza pozycja „New profile”), panel Annotations (pole klasy na górze — fokus po narysowaniu boxa; lista nazwa + licznik; Reject / Accept), wiersz Save profile + Save as, panel grup Custom / Numbers / Letters / Symbols (zawsze widoczne, nieaktywne bez regionu; ustawienia OCR — whitelist i PSM — w rozwijanych ustawieniach grupy). Usuwanie regionu ikoną w wierszu. Okno Save as z jednym zdaniem „Region settings apply from the next run”. Panel obrazu: kanwa `RegionOverlay` z narzędziami-ikonami przy obrazie (Draw region, zoom, Reset, Change screenshot) i przyciskiem Run 120×40 w prawym dolnym rogu → `/run?profile=<id>`. Pusty stan: kafel „Add screenshot (JPG/PNG)” z tym samym pickerem i zapasem „Enter path”. < 768: obraz → Search → Annotations → Save → grupy.
7. **Run Setup** — nagłówek „Run Setup” 16/600; panel 205 px: Source file (combobox z ikoną), Profile (combobox), Sample rate (pole pełnej szerokości z sufiksem „ms”), przycisk Run na dole panelu (równo z dołem obrazu). Run = utworzenie runu + start, potem nawigacja do review. Aktywny run zwarty pod Run: status, postęp, Pause / Resume / Cancel / Start. < 768: obraz → panel → Run na całą szerokość. Bez `<select>`.
8. **Review** — w jednym wierszu „Review frames” 16/400 i pigułki filtrów All / Pending / Accepted / Rejected z licznikami (30 px, promień 16; przy 360 dwa wiersze). Lewa kolumna 261 px: ← n/N → (licznik otwiera wybór klatki — lista), panel Annotations (pole klasy 35 px domyślnie zamknięte; lista klas z licznikami; Reject / Accept decyzji klatki; Reopen dla odrzuconej), panel Repeat Previous (lista klas z licznikami, Accept). Obraz po prawej (465×543 przy 768), ≥ 992 rozszerza wariant 768. Kanwa z zoomem/pan/Reset i menu kontekstowym usuwania. Usunięte: panel-pasek narzędzi, „Klatka NN”, przełącznik.
9. **Stany** — loading / error / disabled / empty na każdym ekranie zachowane (UiStates), przetłumaczone na angielski; bez bloków ostrzeżeń OCR (`Notice` OCR znika z ekranów).

### Checklista (new-component.md §2.2)

- [x] **Layout / siatka (GRID-01..14, SPACING-01..13):** margines strony 16 px na każdej szerokości (`site/padding/XS`); wnętrza i odstępy z tokenów Figmy `element/padding/L-R/L|M|S` = 16/8/6, `element/padding/U-D/L|M` = 8/4, `element/gap/L|M` = 8/6 — nowe tokeny `--element-*` w `tokens.css`. Kolumny 247 / 205 / 261 px jako tokeny. Pasek 44 px, pasek boczny 56 px.
- [x] **Typografia (TYPO-*, WEIGHT-*, FONTSIZE-*, LHEIGHT-*, LSPACE-*):** nawigacja i przyciski 12/300, etykiety pól 12/300 (Figma 8–10 → 12, FONTSIZE-08), etykiety paneli 12/400, nagłówki ekranów 16 („Run Setup” 600, „Review frames” 400). Nowy token `--font-weight-light: 300`. Inter lokalny bez zmian.
- [x] **Kolory (COLOR-01..10):** tła `surface/page` #23262C, `surface/panel` #2B303A, pole/lista #23262C, zaznaczenie #4B5465, hover #383F4C, obrys paneli `border/default` #4B5465 (nowy `--color-stroke-panel-default`), tekst #F6F7F8 / #B9BFCB / #959EB0.
- [x] **Obramowania (BORDER-*, BWIDTH-*, RADIUS-*):** panele 1 px #4B5465, promień 4 (kontrolki, kafle, panele pola) lub 8 (panele Annotations / Repeat Previous); pigułki filtrów 16, przełącznik 40 (pill). Obrys kontrolek interaktywnych zostaje ≥ 3:1 (`--color-stroke-control-default`, odstępstwo FE-021:33).
- [x] **Cienie (SHADOW-*) i nakładki (OVERLAY-*):** płaskie panele bez cienia; cień `elevation-high` tylko dla szuflady, menu ⋮, listy comboboxa i okien (OVERLAY-04); szuflada ze scrimem (OVERLAY-01).
- [x] **Interakcje (COLOR-07, OPACITY-*):** hover #383F4C / warstwa 0.06, aktywne (aria-current / aria-pressed) #4B5465 z obrysem, disabled `--opacity-disabled`, focus-visible pierścień 2 px. Wyróżnienie wypełnieniem tylko dla Save profile w stanie dirty i stanów aktywnych.
- [x] **Komponenty (§4–5):** AppMenu, Button, CollapsibleGroup, Dialog, Field, GroupedOptionList, Icon, NavItem, Panel, RegionOverlay, StatusBadge, TextField, UiStates. Nowe prymitywy: `SideNav` (panel boczny) i `FilePickerTile` (kafel wyboru pliku) w `components/common/`. `SelectField` przestaje być używany w ekranach (Run, Review, PSM) na rzecz `GroupedOptionList`.

### Rozbieżności Figma vs wytyczne (zapisane świadomie)

- **SPACING-05** (mobilne marginesy 24/32) vs Figma 16 px — decyzja użytkownika 05.11: Figma.
- **GRID-01/SPACING-07** (siatka 8) vs Figma 4/6 px (`element/padding/*`, `element/gap/*`) — D07 rozstrzygnięte na rzecz Figmy; log FE-021:34 w części „sprowadzenie do siatki 8 px” przestaje obowiązywać. Zostaje z niego minimum 12 px tekstu (FONTSIZE-08).
- **WEIGHT/TYPO-06..11** (400/600) vs Figma 300 w przyciskach i nawigacji — Figma; 300 Inter na tle #23262C ma ten sam kontrast koloru (kontrast liczony z koloru, test `contrast.test.ts`).
- **GRID-04/06** (48 px dotyk) — widoczny rozmiar jak w Figmie, przy `pointer: coarse` obszar trafienia powiększa niewidoczny pseudo-element `::after` (bez zmiany wyglądu ani układu).
- **BORDER-02 / SPACING-02** (grupowanie przestrzenią) vs Figma — panele z obrysem #4B5465 jak w Figmie (już przyjęte w FE-021).
- Plik `new-component.md` jest chroniony; katalog i definicje nowych / zmienionych komponentów (SideNav, FilePickerTile, Panel bez nadtytułu/opisu, Button outline) zapisuję tutaj, jak w FE-021.

### Panel boczny a geometria Figmy (decyzja koordynatora 05.11, opcja A)

Ramki 768–1200 nie mają panelu w środku; komponent `sidebar` (69 px w wersji 03.11) leży obok ramek. Użytkownik wybrał widoczny pasek ≥ 768. Pasek ma 56 px (ikona 24 + 2×16); obecny widok Figmy pokazuje węższy pasek niż 69 px z 03.11. Spec zgodności mierzy treść względem obszaru treści (początek = prawa krawędź paska, margines 16 od niej); szerokości płynne porównuje z geometrią Figmy przeliczoną na szerokość obszaru treści (stałe kolumny 247/205/261 bez zmian; szerokość obrazu = Figma − pasek, wysokość w tej samej proporcji; ±4%). Dodatkowo przy 768/992/1200 z paskiem zwiniętym (|←) porównanie dosłowne z Figmą.

### Pasek przewijania przy 360 px

`scrollbar-gutter: stable` zostaje (wymóg FE-021). Headless Chromium na desktopie rezerwuje 15 px, przez co przy 360 px treść miałaby 313 px zamiast 328 (−4,6%). Wybór: ramki 360 i 576 spec mierzy w emulacji telefonu (`isMobile`, `hasTouch`) — nakładany pasek jak na prawdziwym telefonie, więc gutter = 0; przy ≥ 768 desktop z gutterem 15 px, a szerokości płynne przeliczane na rzeczywistą szerokość obszaru treści (`clientWidth`). Brak przewijania w poziomie sprawdzany w obu trybach.

### Zachowane mechanizmy

Izolacja kontekstu mutacji (`selectionContext`, `reviewMutationKey`), blokada nawigacji z niezapisanym draftem (`useBlocker` + `beforeunload`), sprzątanie `pointercancel` / `blur` w `RegionOverlay`, granice skrótów (`data-shortcut-scope`, `data-annotation-popover`), `scrollbar-gutter: stable`.

## Wykonanie — backend (2026-11-05)

- `POST /api/v1/local-files/pick` (`backend/app/api/local_files.py`): body `{kind: "video" | "image"}`, odpowiedź `{path: string | null}`. Okno systemowe (`tkinter.filedialog`) w procesie potomnym `python -I -c`, wywoływane z endpointu synchronicznego (pula wątków), więc pętla serwera nie jest blokowana. Jedno okno naraz (`file_picker_busy` 409), brak okna/środowiska → `file_picker_unavailable` 503, anulowanie → `path: null`. Implementacja wstrzykiwana przez `CompositionRoot.file_picker`; serwer E2E podmienia ją na `ControlledE2eFilePicker` (plik kontrolny `control/pick-video|image`). Testy: `backend/tests/test_local_file_picker_api.py` (7), granice API rozszerzone o `local_files`. Commit `8121fd0`.

## Katalog komponentów (new-component.md jest chroniony — zapis tutaj, jak w FE-021)

| Komponent | Ścieżka | Kiedy używać |
|---|---|---|
| `SideNav` | `components/common/SideNav` | Panel boczny sekcji: `mode="strip"` (pasek ikon 56 px z `|←`) albo `mode="drawer"` (modalna szuflada: fokus w środku, pułapka Tab, Escape, klik w scrim, powrót fokusu na ☰). Pozycje to `NavItem` (`strip`/`rail`). |
| `FilePickerTile` | `components/common/FilePickerTile` | Kafel wyboru pliku z dysku: główny przycisk (klik/Enter/Spacja → `onPick`), zapas „Enter path” (pole + Open), podpowiedź po upuszczeniu, komunikat błędu `role=alert`, stan busy. Logikę okna dostarcza konsument (`useLocalFilePicker`). |
| `Panel` (zmiana) | `components/common/Panel` | Bez `eyebrow`/`description`; etykieta 12/400, `radius` `sm`/`md`, `hideTitle` dla paneli bez etykiety w Figmie (nazwa zostaje w drzewie dostępności). |
| `Button` (zmiana) | `components/common/Button` | Wszystkie warianty obrysowane (radius 4, 12/300); nowy `emphasis` (wypełniony) tylko dla Save profile w stanie dirty; `aria-pressed=true` = stan aktywny. Dotyk: obszar 48 px przez `::after`, bez zmiany wyglądu. |
| `NavItem` (zmiana) | `components/common/NavItem` | Nowy wariant `strip` (ikona, etykieta ukryta wizualnie + `title`). |
| `TextField`/`Field` (zmiana) | `components/common/Field` | `labelIcon`, `suffix` (np. „ms”), `hideLabel`; opis tylko dla czytnika (Figma bez akapitów pomocy); slot błędu pojawia się tylko z błędem. |
| `GroupedOptionList` (zmiana) | `components/common/GroupedOptionList` | `placeholder` (zamknięty combobox pokazuje wybór), `icon`, `inline` (wiersze zawsze widoczne, bez pola filtra — grupy klas profilu, Repeat Previous), `initiallyCollapsedGroupIds`; klik w pole otwiera listę. Zastępuje natywny `<select>` na Run (Source file, Profile), w Review (wybór klatki) i dla PSM. |
| `RegionOverlay` (zmiana) | `components/common/RegionOverlay` | `fill` — obraz kadrowany jak `IMAGE FILL` (start: cover), Reset = cała klatka (skala 1, contain); `tools`/`trailing` — rząd narzędzi pod obrazem (zoom −/+, pan, reset, narzędzia ekranu, Run). |
| `AppMenu` (zmiana) | `components/common/AppMenu` | `actions` — pozycje niebędące trasą (OCR engine). |

## Decyzje wykonawcze

- Dashboard: usunięty ekran i trasa (`/` → `/materials`). Katalog `features/dashboard` zostaje z `RunPanel` (zwarty aktywny run na Run Setup), `useDashboard` i `useRunActions` — zmiana nazwy katalogu tylko dla porządku zwiększyłaby diff.
- Run: przycisk Run tworzy run i od razu go startuje, potem przechodzi do Review. Gdy start odpowie np. `409 active_run`, run zostaje w kolejce, a zwarty panel pod przyciskiem pokazuje Start/Cancel i komunikat.
- Profile: przycisk „Ustaw jako aktywny” zniknął (brak w Figmie); Run dostaje profil jawnie (`/run?profile=<id>` z przycisku Run na Profile, combobox Profile). Aktywny profil służy już tylko jako domyślny podgląd na Run.
- Review: decyzje Reject/Accept/Reopen w panelu Annotations; Repeat Previous jako lista inline z licznikami + Accept (kopiowanie). Filtrowanie listy Repeat Previous tekstem zniknęło (Figma: lista bez pola) — test FE-019 przepisany na „wszystkie klasy inline z licznikami”. Pole klasy domyślnie zamknięte i nieaktywne bez zaznaczonego boxa.
- Telefon (< 576 px) w Review: rząd narzędzi zoomu pływa w prawym dolnym rogu obrazu (Figma nie ma na niego miejsca pod obrazem 511 px). Na Profile narzędzia są zawsze pod obrazem („nie nad nim”); wartość zoomu < 992 px tylko dla czytnika.
- OCR (CONTEXT.md:235–236): „OCR engine” w ⋮ pokazuje `engine_id`, wersję, oba SHA-256, `quality_gate`, `experimental` i zdanie o pełnej ręcznej weryfikacji; propozycja OCR w Review ma plakietkę „Pending”. Test: `src/app/ocrEngine.test.tsx`.

## Bramka zgodności z Figmą (e2e/fe022-figma-parity.spec.ts)

- Źródło: `designs/figma-2026-11-05/geometry.json` (14 ramek z `screenToFrame`). Dane API deterministyczne (mock w specu, zapisy przerywane), obrazy z `backend/tests/fixtures/video/synthetic-frame.png`.
- Na ramkę: margines 16 ± 1 po obu stronach obszaru treści; lewa kolumna ± 4 px (Profile 247, Run 205, Review 261 — tylko gdy Figma ma kolumnę węższą niż ekran); pole obrazu ± 4 % w obu wymiarach (Profile/Review: wysokość stała z Figmy, Upload/Run: wysokość z proporcji); kontrolki kluczowe (Save profile, grupy klas, Run, filtry, Repeat Previous) nie niżej niż y Figmy + 32 i nad krawędzią 900 px, gdy w Figmie są nad nią; wszystkie etykiety tekstowe ramki widoczne (dane przykładowe pominięte, liczniki „(n)” sprawdzane bez liczby); koniec treści ≤ `contentBottom` + 10 %; promienie paneli i kontrolek z obrysem ∈ {4, 8} (pigułki filtrów i przełącznika poza regułą — Figma 16/40); brak bloków `.df-notice`; brak tekstu w pasku; brak przewijania w poziomie.
- Panel boczny (decyzja koordynatora, opcja A): z paskiem 56 px początek obszaru treści = prawa krawędź paska; szerokości płynne porównywane z Figmą przeliczoną na szerokość obszaru treści (`main`), kolumny stałe bez zmian. Dodatkowo 768/992/1200 z paskiem zwiniętym (|←) — porównanie dosłowne z Figmą (7 testów).
- Pasek przewijania: Chromium desktop rezerwuje 15 px (`scrollbar-gutter: stable` zostaje), a `documentElement.clientWidth` nie odejmuje tej rezerwy — prawą krawędź obszaru treści mierzę na `main`. 360 i 576 w emulacji telefonu (`isMobile`, `hasTouch`): nakładany pasek jak na telefonie, pole 328 px jak w Figmie.
- Każdy ekran × 360/576/768/992/1200/1400/1440/1920: brak przewijania w poziomie; < 768 pasek schowany, ☰ otwiera szufladę, Escape zamyka i oddaje fokus; ≥ 768 pasek widoczny.
- Wyniki: po jednej linii JSON na ramkę w `D:/DatasetFactory/cache/playwright/fe022-parity.jsonl`.
- Kontrola mutacyjna (2026-11-05): `--site-padding: 24px` → profile 1200 i run 360 FAIL („margin 24/24 ≠ 16±1”, obraz run 360 −4,9 %); `.df-panel--radius-md` → `--radius-lg` → review 768 FAIL („radii … df-review-workspace__inspector=16; … df-review-copy=16”). Obie zmiany cofnięte (`git diff` czysty).

## Dopasowania E2E do nowego układu (2026-11-05)

- Wspólny pomocnik `showWholeFrame` (Reset → 100 %, fokus wraca na body) przed asercjami geometrii FE-010…FE-019: kanwa startuje w kadrze `IMAGE FILL`, a stare testy mierzą od całej klatki. Cel testów zostaje: zoom/pan zakotwiczony, brak skoku kanwy przy zmianie stanu, panel w kolumnie i w oknie.
- FE-019 layout: Repeat Previous jest listą inline, więc rosnącą kontrolką jest teraz pole klasy w Annotations (otwiera listę po zaznaczeniu boxa); asercja „prawa krawędź kanwy nie drgnie, gdy dokument zaczyna się przewijać” bez zmian.
- Upload: `pick-video` w katalogu kontrolnym E2E zastępuje systemowe okno (vertical-flow), negative-flow używa „Enter path”. Run: comboboxy Source file / Profile; start z 409 `active_run` zostawia run w kolejce i pokazuje alert.
- Dashboard: zrzuty loading/empty/error przeniesione na Run Setup; stan zależności lokalnych (workspace niedostępny) sprawdzany w oknie „OCR engine”.
- Zrzuty historyczne w `docs/tickets/FE-0xx/` nadpisywane przez E2E przywracane `git checkout` po każdym przebiegu; nowego `run-setup-1440.png` nie commituję.

## Bramka końcowa (2026-11-05)

`scripts/check.ps1`, porty 5193/8033/8034, `PYTEST_ADDOPTS=--basetemp=D:/tmp/fe022-gate-pytest`: **9/9 PASS, 0 SKIP** — ruff format, ruff check, mypy, pytest 466/466, tsc, Vitest 732/732 (40 plików), vite build, Playwright 58/58 (w tym 26 testów `fe022-figma-parity`), E2E root safety 4/4. Historyczne PNG w `docs/tickets/FE-0xx/` przywrócone `git checkout` (byte-for-byte); nowy `FE-001/screenshots/run-setup-1440.png` z bramki usunięty.

Pomiar aplikacji: `designs/figma-2026-11-05/measure-app-geometry.cjs` (parametry: run id, port z `DF_E2E_FRONTEND_PORT`, wyjście) na Vite 5193 + backend dev 8033 z workspace `D:/DatasetFactory/fe022/workspace` (profil, materiał i run zasiane przez API), szerokości 360–1400, okno 900 px, Chromium desktop jak w pomiarze bazowym (gutter 15 px), zapisy API zablokowane (0 prób) → `docs/tickets/FE-022/app-geometry.json` (+ stan `strip-collapsed` dla Review 768).

### Wynik specu zgodności (14 ramek + 7 z paskiem zwiniętym)

| Ekran | Szer. | Ramka | Tryb | Margines L/P | Kolumna app/Figma | Pole obrazu (app vs oczekiwane) | Kontrolki y app/Figma | Etykiety | Dół app/Figma | Wynik |
|---|---|---|---|---|---|---|---|---|---|---|
| upload | 360 | 1248:831 | phone | 16/16 | — | 328×173 vs 328×173 (0.0%/0.0%) | — | ok | 297/281 | PASS |
| profile | 360 | 1355:1291 | phone | 16/16 | — | 328×279 vs 328×279 (0.0%/0.0%) | Save profile 768/737; Class groups 810/779 | ok | 1144/1127 | PASS |
| profile | 576 | 1395:1656 | phone | 16/16 | — | 544×279 vs 544×279 (0.0%/0.0%) | Save profile 768/737; Class groups 810/779 | ok | 1144/1127 | PASS |
| profile | 768 | 1355:1306 | strip | 16/16 | 247/247 | 368×479 vs 368×479 (0.0%/0.0%) | Save profile 439/442; Class groups 481/484 | ok | 815/832 | PASS |
| profile | 992 | 1355:1307 | strip | 16/16 | 247/247 | 592×479 vs 592×479 (0.0%/0.0%) | Save profile 439/442; Class groups 481/484 | ok | 815/832 | PASS |
| profile | 1200 | 1355:1308 | strip | 16/16 | 247/247 | 800×479 vs 800×479 (0.0%/0.0%) | Save profile 439/442; Class groups 481/484 | ok | 815/832 | PASS |
| run | 360 | 1378:2014 | phone | 16/16 | — | 328×173 vs 328×173 (0.0%/0.0%) | Run 586/612 | ok | 621/646 | PASS |
| run | 576 | 1362:1567 | phone | 16/16 | — | 544×297 vs 544×297 (0.0%/0.0%) | Run 710/736 | ok | 745/770 | PASS |
| run | 768 | 1362:1568 | strip | 16/16 | 205/205 | 444×244 vs 444×243 (0.0%/0.5%) | Run 408/487 | ok | 451/530 | PASS |
| run | 992 | 1362:1569 | strip | 16/16 | 205/205 | 668×368 vs 668×367 (0.0%/0.1%) | Run 449/519 | ok | 492/562 | PASS |
| run | 1200 | 1362:1570 | strip | 16/16 | 205/205 | 876×482 vs 876×482 (0.0%/-0.0%) | Run 563/618 | ok | 606/661 | PASS |
| review | 360 | 1002:14 | phone | 16/16 | — | 328×511 vs 328×511 (0.0%/0.0%) | Filters 87/89; Repeat Previous 1030/1026 | ok | 1174/1247 | PASS |
| review | 576 | 1473:4993 | phone | 16/16 | 261/261 | 275×543 vs 273×543 (0.7%/0.0%) | Filters 60/60; Repeat Previous 429/428 | ok | 691/649 | PASS |
| review | 768 | 1473:5012 | strip | 16/16 | 261/261 | 396×543 vs 394×543 (0.5%/0.0%) | Filters 60/60; Repeat Previous 429/428 | ok | 691/649 | PASS |
| profile | 768 | 1355:1306 | collapsed | 16/16 | 247/247 | 424×479 vs 439×479 (-3.4%/0.0%) | Save profile 439/442; Class groups 481/484 | ok | 815/832 | PASS |
| profile | 992 | 1355:1307 | collapsed | 16/16 | 247/247 | 648×479 vs 663×479 (-2.3%/0.0%) | Save profile 439/442; Class groups 481/484 | ok | 815/832 | PASS |
| profile | 1200 | 1355:1308 | collapsed | 16/16 | 247/247 | 856×479 vs 871×479 (-1.7%/0.0%) | Save profile 439/442; Class groups 481/484 | ok | 815/832 | PASS |
| run | 768 | 1362:1568 | collapsed | 16/16 | 205/205 | 500×275 vs 515×282 (-2.9%/-2.5%) | Run 408/487 | ok | 451/530 | PASS |
| run | 992 | 1362:1569 | collapsed | 16/16 | 205/205 | 724×398 vs 739×406 (-2.0%/-1.9%) | Run 479/519 | ok | 522/562 | PASS |
| run | 1200 | 1362:1570 | collapsed | 16/16 | 205/205 | 932×513 vs 947×521 (-1.6%/-1.6%) | Run 594/618 | ok | 637/661 | PASS |
| review | 768 | 1473:5012 | collapsed | 16/16 | 261/261 | 452×543 vs 465×543 (-2.8%/0.0%) | Filters 60/60; Repeat Previous 429/428 | ok | 691/649 | PASS |
