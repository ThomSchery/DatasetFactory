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
