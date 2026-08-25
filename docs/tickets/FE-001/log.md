# FE-001 — log wykonania

Log wspólny dla podticketów FE-001-F1 … FE-001-F5. Każdy podticket dopisuje
własną sekcję; sekcje wcześniejsze pozostają nietknięte.

---

# FE-001-F1 — Fundament: klient API, routing i powłoka

## Design Plan (przed kodem UI)

Źródła przeczytane przed pisaniem kodu: `frontend/src/styles/tokens.css`
w całości, `.agent/guidelines/new-component.md` w całości oraz następujące
moduły `_agent_oriented_guidelines_final_UI_UX_v3.md` przeczytane od nagłówka
modułu do jego końca, nie pojedynczymi ID:

| Moduł | Zakres ID | Po co w tym tickecie |
|---|---|---|
| Siatka i Odstępy | GRID-00…14, SPACING-01…13 | Układ powłoki, szerokość szyny nawigacji, hit area pozycji nawigacji |
| Kolor | COLOR-01…10 | Podział 60/30/10 między tło, szynę i akcent; tokeny statusu |
| Obramowanie | BORDER-01…09 | Dzielnik szyny, akcent aktywnej pozycji, obrys fokusu |
| Szerokość Obramowania | BWIDTH-01…14 | 1 px strukturalnie, 2 px dla akcentu i fokusu, rysowane do wewnątrz |
| Promień Obramowania | RADIUS-01…05 | Pigułka odznaki, `md` pozycji nawigacji, `lg` paneli |
| Nakładki | OVERLAY-01…07 | Brak modali w F1; reguła alpha dla warstwy hover |
| Cienie | SHADOW-01…05 | SHADOW-05: w ciemnym motywie hierarchię niesie jasność powierzchni, nie cień |
| Typografia | TYPO-01…21, FONTSIZE-02…11, LHEIGHT-01…14, LSPACE-01…09, PARASPACE-01…06, CASING-01…03 | Skala nagłówków powłoki, dekoracja linków nawigacji, kerning odznaki `UPPERCASE` |
| Przezroczystość | OPACITY-01…02 | Hover 0.8 / warstwa 0.06, disabled 0.2 |

### Elementy UI powstające w F1

1. `AppShell` (`frontend/src/app/AppShell`) — powłoka: nagłówek produktu,
   szyna nawigacji z pięcioma destynacjami FE-04, lista pięciu etapów
   pipeline'u z SAM 3 oznaczonym jako poza v1, region `<main>` z `Outlet`
   i link „przejdź do treści”.
2. `WidthGuard` (`frontend/src/app/WidthGuard`) — komunikat FE-07 poniżej
   1280 px; niesie wyłącznie tekst, bez elementu interaktywnego.
3. `NavItem` (`frontend/src/components/common/NavItem`) — NOWY komponent
   wspólny. Router-aware pozycja nawigacji; jedyny dozwolony sposób
   renderowania linku nawigacyjnego w aplikacji.
4. `StatusBadge` (`frontend/src/components/common/StatusBadge`) — NOWY
   komponent wspólny. Odznaka-pigułka na stan/etap; w F1 niesie „poza v1”
   przy SAM 3, w F2…F5 status runu, klatki i eksportu.
5. Pięć widoków tras plus widok nieznanej trasy — każdy renderuje wyłącznie
   `Empty` z istniejącego `UiStates`. Zero własnego markupu stanu pustego.

### Checklista wymagana przez `new-component.md` §2.2

- [x] **Layout/Siatka (GRID-01/02, SPACING-01/02/06/10)** — powłoka to
  `grid-template-columns: var(--nav-rail-width) 1fr`. Padding szyny
  `--size-md`, padding głównego regionu `--size-lg`, odstęp między grupami
  szyny `--size-xl` (SPACING-01: odstęp zewnętrzny grupy > paddingu
  wewnątrz; SPACING-06: przy wątpliwości wybrany większy krok).
  `--nav-rail-width: 280px` dopisane do `tokens.css` z komentarzem GRID-01:
  280 = 35 × 8, więc pozostaje na siatce 8-punktowej i nie jest magiczną
  liczbą rozsianą po CSS. Pozycja nawigacji ma `min-height:
  var(--control-height-md)` = 40 px > 32 px minimum desktopu (GRID-05).
  Opis trasy ograniczony `--measure-copy` (GRID-09).
- [x] **Typografia (TYPO-07/08/11/19/20, FONTSIZE-02/08/09, LHEIGHT-09/10,
  LSPACE-07/09, CASING-02/03)** — trzy rozmiary na ekran: `--font-size-xl`
  dla `h1` trasy, `--font-size-md` dla nazwy produktu, `--font-size-sm` dla
  nawigacji i etapów, `--font-size-xs` wyłącznie dla odznaki i mikrokopii
  (FONTSIZE-09; nic poniżej 12 px, FONTSIZE-08). Dwie wagi: regular i
  semibold (TYPO-08). Hierarchię aktywnej pozycji nawigacji niesie waga i
  kolor, nie rozmiar (TYPO-07, FONTSIZE-10). `--line-height-tight` dla
  nagłówków, `--line-height-standard` dla reszty (LHEIGHT-09/10).
  Nawigacja jest strukturalnie interaktywna, więc domyślnie
  `text-decoration: none` (TYPO-19), a podkreślenie DODAJE się na hover
  (TYPO-20 Logika B). Odznaka jest jedynym `UPPERCASE` — 1–2 słowa, mały
  rozmiar, semibold i obowiązkowy `--letter-spacing-wide` (CASING-02,
  LSPACE-07). Reszta copy w `Sentence case` (CASING-02); `lowercase`
  nie występuje (CASING-03).
- [x] **Kolory (COLOR-02/07/09/10)** — 60 % `--color-background-primary-default`
  (region główny), 30 % `--color-surface-neutral-default` i
  `--color-surface-neutral-raised` (szyna, panele), 10 %
  `--color-fill-brand-impeccable` (aktywna pozycja, akcent, fokus).
  Tekst nieaktywny `--color-text-weak-default`, aktywny
  `--color-text-strong-default`. Etap poza v1 używa
  `--color-text-weak-default` i neutralnej odznaki, nie koloru statusu —
  „poza v1” to nie ostrzeżenie ani błąd (COLOR-09 zakazuje zajmowania
  zakresów H statusu dla znaczeń niestatusowych). Wszystkie tokeny są
  semantyczne, żaden literał koloru nie trafia do CSS (COLOR-10).
- [x] **Obramowania (BORDER-02/03/05/06/08, BWIDTH-06/10/11/13)** — szyna
  oddzielona pojedynczym `border-inline-end` `--color-stroke-weak-default`
  `1px` (BORDER-03 strukturalny dzielnik). Aktywna pozycja nawigacji dostaje
  jednostronny akcent `border-inline-start` `--border-width-emphasis` (2 px)
  w kolorze marki (BORDER-08). Fokus: globalna reguła `:focus-visible`
  z `global.css` daje `--focus-ring-width` 2 px w kolorze marki (BORDER-06).
  Wszystkie obramowania rysowane do wewnątrz — `box-sizing: border-box` jest
  globalny, a nieaktywna pozycja rezerwuje ten sam 2 px akcent w kolorze
  przezroczystym, więc aktywacja nie przesuwa układu (BWIDTH-13).
  Promienie: `--radius-md` dla pozycji nawigacji, `--radius-lg` dla paneli
  (spójne z `df-ui-state--panel`), `--radius-pill` dla odznaki.
- [x] **Cienie (SHADOW-05)** — motyw jest ciemny (`L = 10 %` tła), więc cień
  jest matematycznie niewidoczny i nie jest używany do komunikowania
  wysokości. Wyniesienie niesie jaśniejsza powierzchnia:
  `--color-surface-neutral-raised` (18 %) ponad `--color-surface-neutral-default`
  (14 %) ponad tłem (10 %). Żaden element F1 nie ustawia `box-shadow`.
- [x] **Interakcje (COLOR-07, OPACITY-02, BORDER-06, GRID-05, TYPO-11/20)** —
  hover pozycji nawigacji to warstwa `--color-surface-neutral-hover`
  (alpha 0.06, OPACITY-02 Metoda B) plus podkreślenie tekstu. Stan aktywny
  to `aria-current="page"` z `NavLink`, akcent 2 px i waga semibold
  (TYPO-20 „stan wybrany”). Fokus klawiatury zawsze widoczny (BORDER-06).
  Etap SAM 3 nie jest linkiem ani przyciskiem — jest pozycją listy, więc nie
  ma stanu hover udającego klikalność. Mutacje w F1 nie występują, ale
  wzorzec FE-06 jest przypięty testem: `Button` już realizuje
  `loading` → natywny `disabled` + spinner + `aria-busy`, więc żaden nowy
  komponent przycisku nie powstaje.
- [x] **Komponenty (sekcje 4–5 `new-component.md`)** — katalog sprawdzony
  przed kodowaniem. `Button` istnieje i wystarcza dla akcji; `UiStates`
  istnieje i pokrywa loading/empty/inline error/fatal error/progress, więc
  pięć tras używa `Empty` zamiast własnego markupu. Brakowało komponentu
  linku nawigacyjnego i odznaki stanu — powstają `NavItem` i `StatusBadge`
  w `components/common/`, a katalog i definicje w `new-component.md` §4–§5
  zostają uzupełnione po ich stworzeniu.

### Copy i terminologia

Teksty po polsku, w `Sentence case`. Terminy dziedzinowe zostają bez
tłumaczenia: OCR, SAM 3, HUD, COCO, bbox. Nazwy pięciu etapów zgodnie
z FE-001-F1 §Logika.2: Próbkowanie, Regiony HUD, OCR, SAM 3, Weryfikacja.

## Decyzje i interpretacje

### `GET /dashboard` pominięty w kliencie

`docs/TECH_PLAN.md:108` wymienia `GET /dashboard`, ale backend go nie
implementuje — `backend/app/main.py` rejestruje osiem routerów i nie ma
wśród nich dashboardu, a `grep -rn dashboard backend/ --include=*.py` nie
zwraca nic. Zgodnie z `.agent/guidelines/react-coding-standards.md` §3
rozjazd kontraktu jest sygnałem STOP, nie miejscem na ciche dopasowanie.
Zgłoszony agentowi prowadzącemu; decyzja: **pominąć `getDashboard()`
całkowicie, bez spekulatywnego typu**. Zgadnięty kształt zostałby przez
następnego wykonawcę potraktowany jak kontrakt. Kryterium „klient pokrywa
wszystkie endpointy §5” obowiązuje w F1 jako „wszystkie endpointy §5, które
backend implementuje”. `GET /dashboard` musi powstać po stronie backendu
przed FE-001-F2, bo tam mieszka ekran dashboardu.

### Kody błędów spoza koperty HTTP

`export_revision_conflict`, `export_source_missing` i
`export_process_interrupted` nigdy nie są kodami koperty błędu. Są wartością
pola `error_code` w odpowiedzi `GET /exports/{id}`
(`backend/app/managers/workflow/export_use_cases.py:154-156`,
`backend/app/access/store/reconciliation.py:35`). Jeden słownik
`api/messages.ts` obsługuje oba źródła, więc nieudany eksport i odrzucone
żądanie renderują się identycznie.

### `POST /materials` zwraca kody spoza §5

`backend/app/api/materials.py:56-64` mapuje `ffprobe_unavailable` na 503
i `ffprobe_timeout` na 504. §5 wymienia dla tego wiersza tylko 400 i 404.
Kod jest prawdą, dokument jest niepełny; oba kody są w słowniku.

### Próg 1280 px jako stała TS

`--workspace-min-width` żyje w `tokens.css`, ale Vitest nie ładuje CSS do
jsdom, więc odczyt `getComputedStyle` w teście dawałby pustą wartość.
`WORKSPACE_MIN_WIDTH = 1280` jest stałą w `app/viewport.ts` z komentarzem
wskazującym token jako źródło. Jedno miejsce w TS, jedno w CSS, obie
opisane — nie ma trzeciego.

### Guard szerokości czyta `window.innerWidth`, nie `matchMedia`

jsdom dostarcza `matchMedia`, które zawsze zwraca `matches: false` i nie
ewaluuje zapytania, więc test „powyżej 1280 px normalny układ” byłby
fałszywie zielony bez mocka. `useViewportWidth` subskrybuje `resize` przez
`useSyncExternalStore` i czyta `window.innerWidth`; test ustawia szerokość
i emituje `resize`, bez mockowania API przeglądarki.

### `@hookform/resolvers` nie jest instalowany

Ticket wymienia cztery pakiety. Most RHF↔Zod będzie potrzebny dopiero przy
pierwszym formularzu (F2/F3) i tam należy — instalowanie go w F1 rozszerza
listę pakietów ponad zakres ticketu.

### `body { min-width }` przeniesione do powłoki

`global.css` wymuszał `min-width: var(--workspace-min-width)` na `body`. Przy
oknie węższym niż 1280 px komunikat guardu leżałby wtedy w dokumencie o
szerokości 1280 px i wymagał poziomego przewijania, czyli dokładnie tego, czego
FE-07 zakazuje. Minimalna szerokość robocza należy do `.df-shell`, nie do
dokumentu; guard układa się na realnej szerokości viewportu.

### Auto-cleanup Testing Library

Vitest działa bez `globals`, więc Testing Library nie rejestruje własnego
`cleanup` i DOM jednego testu przeciekał do następnego. `src/test/setup.ts`
woła `cleanup()` w `afterEach`. Bez tego zapytania zaczynają raportować
zduplikowane trafienia i testy nawigacji są fałszywie czerwone.

## Wykonanie

Commit: `293acd3`.

### Bramki

| Bramka | Komenda | Wynik |
|---|---|---|
| Testy | `npm run test` | 13 plików, 151 testów, 0 nieudanych |
| Typy | `npm run typecheck` | 0 błędów |
| Build | `npm run build` | zielony, `tsc --noEmit` + `vite build` |
| Audit | `npm audit` | 0 podatności (info/low/moderate/high/critical = 0) |

### Pakiety

| Pakiet | Wersja | Licencja | Dlaczego ta |
|---|---|---|---|
| `react-router` | 8.3.0 | MIT | Bieżąca stabilna; peer `react >= 19.2.7` pasuje do React 19.2.8. Wymaga Node `>= 22.22.0`, więc `engines` w `package.json` podniesione z `>=22.12.0`. |
| `@tanstack/react-query` | 5.101.4 | MIT | Bieżąca stabilna linia v5; peer `^18 \|\| ^19`. |
| `react-hook-form` | 7.84.0 | MIT | Bieżąca stabilna v7; użyta dopiero w F2/F3, instalowana tu zgodnie z zakresem ticketu. |
| `zod` | 4.4.3 | MIT | Bieżąca stabilna v4; w F1 waliduje kopertę błędu, w F2/F3 formularze. |

Wersje przypięte dokładnie (`--save-exact`), bez zakresów. Jedyna nowa
zależność przechodnia to `cookie-es@3.1.1` (MIT) z React Routera oraz
`@tanstack/query-core@5.101.4` (MIT). Zero Zustand, Tailwinda, biblioteki
komponentów i frameworka canvas.

### Testy pokrywające Done Criteria

| Kryterium | Test |
|---|---|
| `details` dociera nienaruszone do UI | `src/api/errorDetails.test.tsx` — `bbox_invalid` z trzema `annotation_ids` przechodzi przez `fetch`, `ApiError`, `describeApiError` i ląduje w DOM; osobny przypadek porównuje cały obiekt `details` z oryginałem |
| Klient pokrywa `§5` | `src/api/coverage.test.ts` — 21 zaimplementowanych endpointów sprawdzonych wobec tekstu `TECH_PLAN.md`; osobny przypadek pilnuje, że `getDashboard` nie istnieje |
| Słownik kodów błędów | `src/api/coverage.test.ts` — 10 wymaganych kodów ma komunikat i akcję |
| Pięć tras z empty state | `src/app/routes.test.tsx` |
| Nawigacja klawiaturą | `src/app/routes.test.tsx` — Tab do skip linka, dalej po destynacjach, Enter nawiguje |
| SAM 3 poza v1 | `src/app/routes.test.tsx` — odznaka obecna, SAM 3 nie jest linkiem |
| Guard szerokości | `src/app/WidthGuard.test.tsx` — 1279 px komunikat, 1280 i 1440 px normalny układ, reakcja na `resize` w obie strony |
| Żaden komponent nie woła `fetch` | `src/test/architecture.test.ts` — jedyne miejsce wywołania to `src/api/client.ts` |
| Żaden komponent nie trzyma statusu runu | `src/test/architecture.test.ts` — literały statusów tylko w `src/api/`, `TERMINAL_RUN_STATUSES` zadeklarowane raz |
| Brak optimistic update | `src/test/architecture.test.ts` — zero `onMutate`, zero `setQueryData` poza warstwą API |
| Mutacja blokuje przycisk i pokazuje spinner | `src/api/errorDetails.test.tsx` — `disabled` + `aria-busy` w locie |
| Tokeny zamiast wartości arbitralnych | `src/test/architecture.test.ts` — żaden CSS poza `tokens.css` nie zawiera literału koloru |
| Kontrast nowych par | `src/styles/contrast.test.ts` — pary tekst/`surface-neutral` i status/`surface-raised` dopisane |

---

# FE-001-F2 — Materiały, uruchomienie runu i dashboard

## Design Plan (przed kodem UI)

Źródła przeczytane przed pisaniem kodu: `frontend/src/styles/tokens.css`
w całości, `.agent/guidelines/new-component.md` w całości (twarde reguły,
procedura §2.2, katalog §4 i definicje §5) oraz następujące moduły
`_agent_oriented_guidelines_final_UI_UX_v3.md` przeczytane od nagłówka modułu
do jego końca:

| Moduł | Zakres ID | Po co w tym tickecie |
|---|---|---|
| Siatka i Odstępy | GRID-00…14, SPACING-01…13 | Siatka paneli, szerokość pól formularza, hit area kontrolek runu, wysokość wierszy list |
| Kolor | COLOR-01…10 | 60/30/10 na ekranie z panelami; tokeny statusu dla zależności systemu i ostrzeżenia OCR |
| Obramowanie | BORDER-01…09 | Obrys pól formularza (`stroke-strong`), dzielniki wierszy (`stroke-weak`), akcent ostrzeżenia |
| Szerokość Obramowania | BWIDTH-01…14 | Wyjątek BWIDTH-03 dla inputów, BWIDTH-11 fokus, BWIDTH-12 stan błędu pola |
| Promień Obramowania | RADIUS-01…05 | RADIUS-05: pola tekstowe maks. `radius-md`; RADIUS-04 dla zagnieżdżeń w panelu |
| Nakładki | OVERLAY-01…07 | Brak modali także w F2; obowiązuje reguła alpha warstwy hover |
| Cienie | SHADOW-01…05 | SHADOW-05: motyw ciemny, wysokość niesie jasność powierzchni, nie cień |
| Typografia | TYPO-01…21, FONTSIZE-02…11, LHEIGHT-01…14, LSPACE-01…09, PARASPACE-01…06, CASING-01…03 | Skala nagłówków paneli, etykiety pól, mikrokopia pomocnicza, `UPPERCASE` tylko w odznace |
| Przezroczystość | OPACITY-01…02 | Hover 0.8 / warstwa 0.06, disabled 0.2 dla kontrolek runu w locie |

### Elementy UI powstające w F2

Ekran **Materiały** (`frontend/src/features/materials/**`):

1. `MaterialImportForm` — panel importu: pole „Ścieżka pliku wideo”
   (`TextField`), przycisk „Zaimportuj materiał” (`Button`), walidacja inline
   Zod, wynik walidacji backendu przez `describeApiError` w `InlineError`.
2. `MaterialList` — panel listy materiałów: nazwa pliku, rozdzielczość, czas,
   rozmiar, odznaka dostępności (`StatusBadge`). Pełny zestaw stanów
   `Loading` / `Empty` / `FatalError` / sukces.
3. `RunLaunchForm` — panel uruchomienia: wybór materiału (`SelectField`),
   wybór profilu (`SelectField`), interwał próbkowania w ms (`TextField`
   `inputMode="numeric"`), przycisk „Utwórz run” (`Button`).

Ekran **Dashboard** (`frontend/src/features/dashboard/**`):

4. `DashboardScreen` — kompozycja paneli, jedno query `GET /dashboard`
   z pełnym zestawem stanów.
5. `ActiveProjectPanel` — projekt i profil jako `DataList`; brak projektu
   i brak profilu to `Empty`, nie błąd.
6. `FrameCountsPanel` — liczby klatek per `review_status` jako `DataList`,
   z jawną adnotacją, że `total` to klatki istniejące, a nie planowane.
7. `SystemStatusPanel` — FFmpeg, Tesseract, katalog roboczy, GPU i baza jako
   wiersze z `StatusBadge` i `detail`; wiersz SAM 3 z odznaką „poza v1”.
8. `RunPanel` — aktywny run: status (`StatusBadge`), bieżący etap, postęp
   klatek (`Progress`), `error_code` przez `describeErrorCode`, oraz kontrolki
   Start / Pauza / Wznów / Anuluj (`Button`). Mieszka w `features/dashboard/`,
   bo dashboard jest właścicielem widoku aktywnego runu (CF-07); ekran
   materiałów go importuje zamiast duplikować.
9. `OcrQualityWarning` — stałe ostrzeżenie (`Notice` tone `warning`) widoczne
   na obu ekranach, gdy aktywny run ma `experimental=true` albo
   `quality_gate != passed`. Nie da się go zamknąć — nie ma kontrolki
   zamykania ani stanu lokalnego, który mógłby je ukryć.

Nowe komponenty wspólne (`frontend/src/components/common/`):

10. `Panel` — tytułowana sekcja treści; kontener wszystkich powyższych bloków.
11. `Notice` — trwały, nieinteraktywny komunikat z tonem (`info`, `warning`,
    `error`). Nośnik ostrzeżenia OCR i komunikatu `409 active_run`.
12. `TextField` — etykieta + `<input>` + opis + komunikat błędu, powiązane
    przez `aria-describedby` / `aria-invalid`.
13. `SelectField` — etykieta + `<select>` + opis + komunikat błędu; jedyny
    dozwolony sposób renderowania listy wyboru.
14. `DataList` — para etykieta/wartość jako `<dl>`; nośnik metadanych projektu,
    profilu, runu i liczb klatek.

### Checklista wymagana przez `new-component.md` §2.2

- [x] **Layout/Siatka (GRID-01/02/05/09/10/11, SPACING-01/02/03/04/06/08/12)** —
  ekran to `display: grid` z `gap: var(--size-lg)` między panelami
  (SPACING-01: odstęp zewnętrzny > paddingu wewnętrznego `--size-md`).
  Pola powiązane w formularzu dzieli `--size-md` (GRID-02), etykieta przylega
  do pola odstępem `--size-xs`, a pod polem jest `--size-sm` (SPACING-03:
  margines nad polem mniejszy niż pod nim). Miejsce na komunikat błędu jest
  zarezerwowane, więc pojawienie się błędu nie przesuwa kolejnych pól
  (SPACING-04). Szerokość pola odpowiada oczekiwanej treści (GRID-10):
  ścieżka pliku `--measure-copy`, interwał `12ch`. Wiersze list zależności
  i materiałów mają `min-height: var(--control-height-lg)` = 48 px
  (GRID-11 „standardowe”), a kontrolki runu `--control-height-md` = 40 px
  > 32 px minimum desktopu (GRID-05). Opisy ograniczone `--measure-copy`
  (GRID-09). Poziomy padding komórek listy `--size-sm` (SPACING-12).
- [x] **Typografia (TYPO-07/08/11/19/21, FONTSIZE-02/08/09/10, LHEIGHT-09/10,
  LSPACE-07, PARASPACE-01/05, CASING-02/03)** — trzy rozmiary na ekran:
  `--font-size-lg` dla tytułu panelu, `--font-size-md` dla wartości
  wyróżnionych, `--font-size-sm` dla treści i etykiet pól, a `--font-size-xs`
  wyłącznie dla odznak i mikrokopii pomocniczej (FONTSIZE-09; nic poniżej
  12 px — FONTSIZE-08). Dwie wagi: `regular` i `semibold` (TYPO-08).
  Etykieta pola i tytuł panelu niosą hierarchię wagą i kolorem, nie rozmiarem
  (TYPO-07, FONTSIZE-10). `--line-height-tight` dla tytułów,
  `--line-height-standard` dla reszty (LHEIGHT-09/10). `UPPERCASE` wyłącznie
  w `StatusBadge` i w eyebrow panelu, zawsze z `--letter-spacing-wide`
  i `semibold` (CASING-02, LSPACE-07). Reszta copy w `Sentence case`,
  `lowercase` nie występuje (CASING-03). Tekst wyrównany do lewej, bez
  justowania (PARASPACE-05/06).
- [x] **Kolory (COLOR-02/07/08/09/10)** — 60 % `--color-background-primary-default`
  (region główny), 30 % `--color-surface-neutral-default` i
  `--color-surface-neutral-raised` (panele, wiersze), 10 %
  `--color-fill-brand-impeccable` (akcje główne, wypełnienie postępu, fokus).
  Zależność niedostępna: `--color-status-error-default`, dostępna:
  `--color-status-success-default`, ostrzeżenie OCR:
  `--color-status-warning-default` — zakresy H zgodne z COLOR-09. „Poza v1”
  przy SAM 3 to `muted`, nie `warning`, bo to zakres, nie status (COLOR-09).
  Nowe pary tekst/tło dopisane do `src/styles/contrast.test.ts` (COLOR-08).
  Wszystkie wartości są tokenami semantycznymi (COLOR-10); żaden literał
  koloru nie trafia do CSS.
- [x] **Obramowania (BORDER-02/03/05/06/08, BWIDTH-03/06/10/11/12/13,
  RADIUS-03/04/05)** — panele oddziela biała przestrzeń, a nie obramowanie
  (BORDER-02); mają jednak ten sam obrys `--color-stroke-weak-default` 1 px
  co istniejący `df-ui-state--panel`, żeby nie wprowadzać drugiego stylu
  panelu. Pola formularza to jedyne elementy z widocznym obramowaniem
  w stanie domyślnym (BWIDTH-03): `--border-width-default` 1 px
  w `--color-stroke-strong-default` (BORDER-03: `stroke-strong`
  ma kontrast ≥ 3:1). Stan błędu pola: `--border-width-emphasis` 2 px
  w `--color-status-error-default` (BWIDTH-12). Fokus: globalna reguła
  `:focus-visible` z `global.css` (BORDER-06). Wszystko rysowane do wewnątrz
  przez globalny `box-sizing: border-box`, a pole rezerwuje 2 px także
  w stanie domyślnym, więc błąd nie przesuwa układu (BWIDTH-13).
  `Notice` niesie jednostronny akcent `border-inline-start` 2 px w kolorze
  tonu (BORDER-08). Promienie: `--radius-md` dla pól (RADIUS-05: pola
  tekstowe maks. 8 px), `--radius-lg` dla paneli, `--radius-pill` dla odznak.
  Wiersz listy wewnątrz panelu ma `--radius-md`, bo
  `promień zewnętrzny (16) − padding (24) ≤ 0` dałoby 0, a wiersz nie dotyka
  krawędzi panelu — RADIUS-04 dotyczy elementu przylegającego, nie
  odsuniętego paddingiem.
- [x] **Cienie (SHADOW-05)** — motyw jest ciemny (`L = 10 %` tła), więc cień
  jest matematycznie niewidoczny. Wysokość niesie jaśniejsza powierzchnia:
  wiersz `--color-surface-neutral-raised` (18 %) na panelu
  `--color-surface-neutral-default` (14 %) na tle (10 %). Żaden element F2
  nie ustawia `box-shadow`.
- [x] **Interakcje (COLOR-07, OPACITY-02, BWIDTH-11, GRID-05, FE-06)** —
  kontrolki runu używają `Button`, który już realizuje wzorzec FE-06:
  `loading` → natywny `disabled` + spinner + `aria-busy`. W trakcie mutacji
  wyłączone są wszystkie kontrolki runu, nie tylko kliknięta, bo każda z nich
  wysyła to samo `expected_version` i druga w locie i tak dostałaby
  `409 version_conflict`. Hover pola: obramowanie
  `--color-fill-brand-impeccable` (BWIDTH-11 zmienia kolor semantyczny;
  szerokość zostaje 1 px, bo fokus już rezerwuje 2 px i podwójne pogrubienie
  byłoby szumem). Disabled: `--opacity-disabled` na całym komponencie
  (OPACITY-02). Żadna kontrolka nie jest mniejsza niż 32 × 32 px (GRID-05).
- [x] **Komponenty (sekcje 4–5 `new-component.md`)** — katalog sprawdzony
  przed kodowaniem. Istnieją i są użyte bez zmian: `Button` (każda akcja),
  `UiStates` (`Loading`, `Empty`, `InlineError`, `FatalError`, `Progress`),
  `StatusBadge` (status runu, dostępność zależności, „poza v1”), `NavItem`
  (nie dotyczy F2 — nawigacja należy do powłoki). Brakowało kontenera sekcji,
  trwałego komunikatu z tonem, pola tekstowego, listy wyboru i pary
  etykieta/wartość — powstają `Panel`, `Notice`, `TextField`, `SelectField`
  i `DataList` w `components/common/`, a katalog §4 i definicje §5
  `new-component.md` zostają uzupełnione po ich stworzeniu.

### Copy i terminologia

Teksty po polsku, w `Sentence case`. Terminy dziedzinowe bez tłumaczenia: OCR,
SAM 3, HUD, GPU, FFmpeg, ffprobe, Tesseract, run. Komunikaty błędów pochodzą
wyłącznie z `api/messages.ts` — żaden ekran nie pisze własnej wersji tekstu
dla kodu backendu.

## Decyzje i interpretacje

### `GET /dashboard` dopisany do klienta — dług F1 spłacony

FE-001-F1 świadomie pominął `getDashboard()`, bo backend nie miał routera.
TK-008 dodał `backend/app/api/dashboard.py`, więc typ `Dashboard` powstał
z tego routera, nie z prozy §5. Test `src/api/coverage.test.ts` przestał
pilnować nieobecności jednej funkcji i zamiast tego wyciąga z §5 wszystkie
wiersze tabeli i sprawdza, że każdy ma pokrycie — od teraz to nowy endpoint
w dokumencie zapala czerwone światło, a nie brak aktualizacji listy w teście.

### Dwie różne definicje „aktywnego runu” — polling nie idzie za dashboardem

Backend nazywa run aktywnym, dopóki ma jakiekolwiek przejście w
`RUN_TRANSITIONS`, czyli terminalny jest wyłącznie `completed`; `failed`
i `cancelled` to niedokończona praca, którą dashboard pokazuje razem
z `error_code`. Frontendowy `TERMINAL_RUN_STATUSES` odpowiada na węższe
pytanie — czy status zmieni się bez akcji użytkownika — i to on rządzi
pollingiem. `dashboardPollInterval` używa wyłącznie tego drugiego, a test
`dashboardPolling.test.tsx` przypina obie definicje osobno, żeby nikt ich
nie „ujednolicił”.

Dodatkowo: bez aktywnego runu polling w ogóle nie startuje. `runPollInterval`
zwraca 2 s dla `undefined`, bo tam `undefined` znaczy „status jeszcze
nieznany”; na dashboardzie `run === null` znaczy „nie ma czego obserwować”
i to inna sytuacja, więc predykat rozróżnia je jawnie zamiast dziedziczyć
zachowanie.

### `frame_counts.total` i `run.total_frames` nigdy obok siebie jako to samo

Pierwsza liczy wiersze `frames`, które istnieją; druga to liczba klatek
zaplanowanych dla runu. Panel klatek pokazuje „Razem istniejących” z jawną
adnotacją, a panel runu „Klatki ukończone wobec zaplanowanych”. Test sprawdza
też negatywnie: liczba planowanych nie pojawia się w panelu liczb klatek.

### `availableRunActions` w `src/api/runStatus.ts`, nie w komponencie

Gate 3 zabrania komponentom implementowania maszyny stanów, a test
architektury trzyma literały statusów poza komponentami — tabela sterowana
statusem musiała więc trafić do warstwy API. Jest to **podpowiedź afordancji**,
nie maszyna stanów po stronie klienta: backend pozostaje jedynym autorytetem
i nadal odpowiada `409 invalid_transition`, co UI renderuje ze wspólnego
słownika. Tabela odwzorowuje `RUN_TRANSITIONS` oraz zbiory `allowed_from`
z `backend/app/managers/workflow/manager.py`.

### Wybór profilu ograniczony przez kontrakt, nie przez ekran

TECH_PLAN §5 wystawia `GET /profiles/current` i nie ma endpointu listującego
profile. Ekran materiałów ma więc dokładnie jedną pozycję do zaoferowania.
Kontrolka pozostaje `SelectField`, żeby F3 mogła ją poszerzyć bez przebudowy
formularza. To ograniczenie kontraktu, nie decyzja UI — patrz „Obserwacje
do kontraktu” niżej.

### Tworzenie runu i jego uruchomienie to dwa kroki

`POST /runs` tworzy run w `queued`; dopiero `POST /runs/{id}/start` pobiera
globalną blokadę i może odpowiedzieć `409 active_run` (CF-02.4,
`ActiveRunError` w `manager.py`). Sklejenie ich w jeden przycisk ukryłoby ten
kod za „nie udało się utworzyć runu”. Uruchomienie — nie utworzenie —
przenosi na `/annotations/:runId`, zgodnie z §Logika.2.

### Wszystkie kontrolki runu wyłączone na czas mutacji

Nie tylko kliknięta. Każda z czterech wysyła to samo `expected_version`
odczytane z tego samego runu, więc druga w locie i tak dostałaby
`409 version_conflict`; wyłączenie ich razem jest uczciwsze niż pozwolenie na
kliknięcie, które nie ma szans przejść.

### Ton `error` nie barwi tekstu na `surface-neutral-raised`

`--color-status-error-default` na `--color-surface-neutral-raised` daje
4,16:1, poniżej progu AA 4,5:1 dla małego tekstu (COLOR-08). `Notice --error`
niesie więc ton akcentem 2 px i miękkim tłem, a tytuł zostaje
w `--color-text-strong-default` — tak samo jak istniejący
`df-ui-state--inline-error`. `src/styles/contrast.test.ts` przypina samą tę
nierówność, żeby zabarwienie nie wróciło niezauważone.

### `Field` jako prymityw, a nie dwa komponenty z bliźniaczym CSS

`TextField` i `SelectField` potrzebują identycznego chrome: etykieta, opis,
komunikat błędu i wiązania `aria-describedby` / `aria-invalid`. Zamiast
duplikować ~40 linii CSS w dwóch folderach powstał `Field` z render propem,
a oba pola go komponują. `error` jest jednocześnie flagą niepoprawności, więc
nie da się pokazać czerwonego obramowania bez komunikatu ani komunikatu,
którego kontrolka nie opisuje.

### `@hookform/resolvers` instalowany tutaj

F1 świadomie go pominął, zapisując, że most RHF↔Zod należy do pierwszego
formularza. Wersja `5.7.1` (MIT), przypięta dokładnie, `npm audit` czysty.

### Fake timery w teście pollingu fałszują tylko zegar

`vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval",
"clearInterval", "Date"] })`. Fałszowanie kolejki mikrozadań zatrzymuje odczyt
ciała odpowiedzi ze stubowanego `fetch` i test mierzyłby własne zakleszczenie
zamiast interwału. Dodatkowo TanStack Query powiadamia subskrybentów zegarowym
zerem, którego sinon nie uruchomi bez ruchu zegara — stąd „szturchnięcie”
o 1 ms w helperze `tick`. `waitFor` z Testing Library nie nadaje się tutaj, bo
sam steruje fałszywymi timerami i zakleszcza się z tymi z testu.

## Obserwacje do kontraktu

1. **Brak endpointu listującego profile.** §5 ma `POST /profiles`
   i `GET /profiles/current`, ale nic w rodzaju `GET /profiles`. Ekran
   uruchomienia runu może więc zaoferować dokładnie jeden profil, mimo że
   `POST /runs` przyjmuje dowolne `profile_id`, a schemat trzyma ich wiele.
   To wygląda na lukę w dokumencie, nie w kodzie — do rozstrzygnięcia przed
   F3, która tworzy profile.
2. **`POST /runs` nie zwraca `409 active_run`.** Ticket mówi o „drugim runie”,
   ale `ActiveRunError` powstaje w `activate`/`reserve_resume`, czyli przy
   `start` i `resume`. Utworzenie drugiego runu przechodzi i zostaje on
   w `queued`. Kod jest spójny z §5; warte odnotowania, bo intuicja z ticketu
   sugeruje inaczej.
3. **`review_ready` nie ma operacji sterującej w §5.** Jedyne przejście
   z `review_ready` to `completed`, a żaden endpoint §5 go nie wykonuje. Panel
   runu pokazuje wtedy jawny komunikat o braku operacji. Domykanie runu należy
   prawdopodobnie do F4/F5 — do potwierdzenia.

## Wykonanie

Commity: `d2882be` (Design Plan), `3a4d3db` (warstwa API), `60cfc2c`
(komponenty wspólne), `27cf4bb` (ekrany), `a30596e` (testy).

### Bramki

| Bramka | Komenda | Wynik |
|---|---|---|
| Testy | `npm run test` | 22 pliki, 251 testów, 0 nieudanych |
| Typy | `npm run typecheck` | 0 błędów |
| Build | `npm run build` | zielony, `tsc --noEmit` + `vite build` |
| Audit | `npm audit` | info/low/moderate/high/critical = 0 (175 zależności) |
| Architektura | `src/test/architecture.test.ts` | 66 testów, 0 nieudanych |

Wzrost wobec F1: 13 → 22 plików testowych, 151 → 251 testów.

### Pakiety

| Pakiet | Wersja | Licencja | Dlaczego ta |
|---|---|---|---|
| `@hookform/resolvers` | 5.7.1 | MIT | Bieżąca stabilna; most RHF↔Zod dla dwóch formularzy F2. Peer `react-hook-form ^7.55` pasuje do 7.84.0. |

Zero nowych zależności produkcyjnych poza tą jedną.

### Testy pokrywające Done Criteria

| Kryterium | Test |
|---|---|
| Design Plan dla każdego elementu UI | sekcja „Design Plan” wyżej; katalog `new-component.md` §4–§5 uzupełniony o `Panel`, `Notice`, `Field`, `TextField`, `SelectField`, `DataList` |
| Import materiału, utworzenie runu, start | `src/features/materials/materialsFlow.test.tsx` — pełna ścieżka aż do nagłówka „Anotacje”, z asercją ciał żądań |
| Polling nonterminal → terminalny i zatrzymanie | `src/features/dashboard/dashboardPolling.test.tsx` — 4 odpytania, potem 10 interwałów ciszy |
| Polling nie startuje bez runu | `dashboardPolling.test.tsx` |
| `409 active_run` jako komunikat | `src/features/dashboard/runControl.test.tsx` |
| Konflikt `expected_version` na pause/resume/cancel | `runControl.test.tsx` — osobny przypadek na każdą z trzech operacji plus asercja wysłanej wersji |
| Ostrzeżenie OCR na obu ekranach | `src/features/dashboard/ocrWarning.test.tsx` — 14 przypadków: `experimental`, `quality_gate != passed`, provenance Tesseractu, brak kontrolki zamykania, copy nie sugeruje poprawności, cisza gdy bramka przeszła |
| Loading / empty / error / success | `src/features/dashboard/DashboardScreen.test.tsx`, `materialsFlow.test.tsx` |
| Mutacja blokuje przycisk i pokazuje spinner | `materialsFlow.test.tsx` (import), `runControl.test.tsx` (wszystkie cztery kontrolki runu) |
| Walidacja inline przed żądaniem | `materialsFlow.test.tsx` — ścieżka względna nie wychodzi z przeglądarki |
| Kod backendu bez reinterpretacji | `materialsFlow.test.tsx` — `503 ffprobe_unavailable` z copy i widocznym kodem |
| `frame_counts.total` ≠ `run.total_frames` | `DashboardScreen.test.tsx` |
| Stan systemu i SAM 3 poza v1 | `DashboardScreen.test.tsx` |
| Dostępność pól formularza | `src/components/common/Field/Field.test.tsx` |
| `Notice` nie da się zamknąć | `src/components/common/Notice/Notice.test.tsx` |
| Predykat ostrzeżenia OCR | `src/api/ocrQuality.test.ts` |
| Kontrast nowych par | `src/styles/contrast.test.ts` |

# FE-001-F3 — Profil gry i rysowanie regionów HUD

## Design Plan (przed kodem UI)

Źródła przeczytane przed pisaniem kodu: `frontend/src/styles/tokens.css`
w całości, `.agent/guidelines/new-component.md` w całości (twarde reguły,
procedura §2.2, katalog §4 i definicje §5) oraz następujące moduły
`_agent_oriented_guidelines_final_UI_UX_v3.md` przeczytane od nagłówka modułu
do jego końca:

| Moduł | Zakres ID | Po co w tym tickecie |
|---|---|---|
| Siatka i Odstępy | GRID-00…14, SPACING-01…13 | Siatka paneli formularza, szerokość pól, hit area regionu na overlayu (GRID-05), wysokość wierszy listy regionów, biała przestrzeń wokół obrazu (SPACING-11) |
| Kolor | COLOR-01…10 | Obrys i wypełnienie regionu, stan zaznaczenia, odróżnienie regionu zapisanego od rysowanego |
| Obramowanie | BORDER-01…09 | Obrys regionu jako jedyne obramowanie niosące znaczenie geometryczne; obrys pól formularza |
| Szerokość Obramowania | BWIDTH-01…14 | BWIDTH-11 fokus regionu, BWIDTH-12 błąd pola, stała grubość obrysu niezależna od skali SVG |
| Promień Obramowania | RADIUS-01…05 | RADIUS-05 dla pól; jawne `--radius-none` dla prostokąta regionu |
| Nakładki | OVERLAY-01…07 | OVERLAY-06 (niewidoczny element a `pointer-events`) rządzi warstwą hit-targetu; brak modali także w F3 |
| Cienie | SHADOW-01…05 | SHADOW-05: motyw ciemny, żaden element F3 nie ustawia `box-shadow` |
| Typografia | TYPO-01…21, FONTSIZE-02…11, LHEIGHT-01…14, LSPACE-01…09, PARASPACE-01…06, CASING-01…03 | Etykiety pól, nazwy regionów, współrzędne monospace, `UPPERCASE` tylko w odznace i eyebrow |
| Przezroczystość | OPACITY-01…02 | Wypełnienie regionu jako warstwa alpha, `--opacity-disabled` dla overlaya w trakcie mutacji |

### Elementy UI powstające w F3

Ekran **Nowy profil gry** (`frontend/src/features/profiles/**`):

1. `ProfileCreateScreen` — kompozycja paneli, jedno query `GET /profiles/current`
   (pełny zestaw `Loading` / `Empty` / `FatalError` / sukces) i jedna mutacja
   `POST /profiles`. Sukces przekierowuje do importu materiału (CF-01.6).
2. `ProfileIdentityPanel` — nazwa profilu (`TextField`) i bezwzględna ścieżka
   obrazu referencyjnego (`TextField`, `--measure-copy`). Nie ma uploadu —
   backend czyta plik w miejscu i sam kopiuje go do katalogu roboczego.
3. `ReferencePreview` — `<img>` z `referenceAssetUrl(assetId)`; wymiary
   naturalne odczytane z `naturalWidth`/`naturalHeight` po `load`. Stan
   ładowania obrazu, stan błędu (`onError`) i stan „brak obrazu” są rozłączne.
4. `RegionEditor` — `RegionOverlay` + pole nazwy regionu (`TextField`)
   + `RegionList`. Rysowanie działa wyłącznie podczas tworzenia profilu.
5. `RegionList` — wiersz na region: nazwa, współrzędne źródłowe, `Button`
   „Zaznacz” i `Button` „Usuń”. To jest droga klawiaturowa, która nie wymaga
   precyzyjnego trafienia w prostokąt (FE-08, Gate 3 UI).
6. `CategoryEditor` — klasy bazowe jako zamknięty alfabet `-/0-9A-Z`
   (`kind: "character"`) oraz klasy per gra jako tekst swobodny
   (`kind: "game"`), obie z listą wybranych i usuwaniem.

Nowy komponent wspólny (`frontend/src/components/common/`):

7. `RegionOverlay` — prymityw overlaya SVG nad `<img>`: jeden `viewBox`
   wyprowadzony z wymiarów naturalnych, prostokąty jako elementy DOM, wzorzec
   ARIA `listbox`/`option` z roving tabindex, rysowanie prostokąta wskaźnikiem.
   Powstaje w `common/`, bo FE-001-F4 buduje na nim overlay weryfikacji.

### Checklista wymagana przez `new-component.md` §2.2

- [x] **Layout/Siatka (GRID-01/02/05/08/09/10/11, SPACING-01/03/04/06/11/12)** —
  ekran to `display: grid` z `gap: var(--size-lg)` między panelami, `--size-md`
  między powiązanymi polami (GRID-02). Pole ścieżki ma `--measure-copy`,
  a pole nazwy regionu `12ch` (GRID-10). Wiersz listy regionów ma
  `min-height: var(--control-height-lg)` = 48 px (GRID-11 „standardowe”)
  i `--size-sm` poziomego paddingu (SPACING-12). Obraz referencyjny dostaje
  `--size-md` białej przestrzeni dookoła (SPACING-11) i nie jest rozciągany
  ponad swoją szerokość naturalną (GRID-08). Hit target regionu: przezroczysta
  obwódka o grubości `--region-hit-width`, liczonej tak, żeby pas trafienia
  miał realną szerokość na ekranie niezależnie od skali `viewBox` — dlatego
  `vector-effect: non-scaling-stroke`, a nie stała wartość w jednostkach
  źródłowych, która przy obrazie 1920 px dałaby ułamek piksela CSS. Kontrolki
  wiersza to `Button` `sm` = `--control-height-sm` = 32 px, czyli minimum
  desktopu (GRID-05).
- [x] **Typografia (TYPO-07/08, FONTSIZE-02/08/09/10, LHEIGHT-09/10, LSPACE-07,
  CASING-02/03)** — trzy rozmiary: `--font-size-lg` tytuł panelu,
  `--font-size-sm` etykiety, nazwy regionów i treść, `--font-size-xs` wyłącznie
  odznaki, eyebrow i współrzędne. Współrzędne regionu w `--font-family-mono`,
  bo to liczby czytane kolumnowo, a nie proza. Hierarchię nazwa/współrzędne
  niesie waga i kolor, nie rozmiar (TYPO-07). `UPPERCASE` tylko w `StatusBadge`
  i eyebrow, zawsze z `--letter-spacing-wide` (CASING-02, LSPACE-07).
- [x] **Kolory (COLOR-02/07/08/09/10)** — obrys regionu
  `--color-fill-brand-impeccable`; region zaznaczony dostaje wypełnienie
  `--color-fill-brand-impeccable-soft` (alpha 0.12), niezaznaczony
  `--color-surface-transparent`. Prostokąt rysowany w locie ma obrys
  `--color-stroke-strong-default` i kreskowanie, więc „szkic” i „zapisany
  region” różnią się kształtem linii, nie samym kolorem (COLOR-09: znaczenie
  nie może zależeć wyłącznie od koloru). Wszystko z tokenów semantycznych
  (COLOR-10); nowe pary tekst/tło dopisane do `src/styles/contrast.test.ts`
  (COLOR-08).
- [x] **Obramowania (BORDER-02/03/06/08, BWIDTH-03/06/11/12/13, RADIUS-01/05)** —
  obrys regionu to `--border-width-emphasis` 2 px z
  `vector-effect: non-scaling-stroke`, żeby grubość była 2 px CSS przy każdym
  rozmiarze okna. Prostokąt regionu ma jawnie `--radius-none`: zaokrąglony róg
  sugerowałby, że crop jest zaokrąglony, a nie jest — region to dokładny
  prostokąt pikseli przekazywany do OpenCV. Pola formularza jak w F2:
  1 px `--color-stroke-strong-default`, błąd 2 px
  `--color-status-error-default` (BWIDTH-12), fokus przez globalną regułę
  `:focus-visible` (BORDER-06), a na elemencie SVG dodatkowo własny
  `stroke-dasharray`, bo `outline` na `<rect>` nie rysuje się przewidywalnie
  we wszystkich silnikach.
- [x] **Cienie (SHADOW-05)** — motyw ciemny, cień matematycznie niewidoczny.
  Wysokość niesie jaśniejsza powierzchnia panelu. Żaden element F3 nie ustawia
  `box-shadow`.
- [x] **Interakcje (COLOR-07, OPACITY-02, OVERLAY-06, BWIDTH-11, GRID-05,
  FE-06)** — region reaguje na hover, zaznaczenie i `:focus-visible`. Warstwa
  hit-targetu jest niewidoczna, ale celowo interaktywna: OVERLAY-06 zabrania
  niewidocznego *blokowania* kliknięć, więc ta warstwa ma
  `pointer-events: stroke` (łapie tylko pas przy krawędzi), a tło SVG zostaje
  wolne dla rysowania nowego regionu. W trakcie mutacji cały overlay dostaje
  `--opacity-disabled` i przestaje przyjmować rysowanie, a przycisk zapisu ma
  `loading` (FE-06: natywny `disabled` + spinner + `aria-busy`). Brak
  optimistic update — profil pojawia się dopiero po potwierdzeniu przez
  backend.
- [x] **Komponenty (sekcje 4–5 `new-component.md`)** — katalog sprawdzony przed
  kodowaniem. Użyte bez zmian: `Panel` (każdy blok ekranu), `TextField`
  (nazwa profilu, ścieżka, nazwa regionu, nazwa klasy per gra), `SelectField`
  (rodzaj klasy per gra), `Button` (każda akcja, w tym „Zaznacz”, „Usuń”,
  „Dodaj”, „Utwórz profil”), `UiStates` (`Loading`, `Empty`, `InlineError`,
  `FatalError`), `Notice` (trwałe ostrzeżenie o luce kontraktu), `StatusBadge`
  (rodzaj klasy), `DataList` (metadane obrazu referencyjnego). Brakowało
  powierzchni rysowania prostokątów nad obrazem — powstaje `RegionOverlay`
  w `components/common/`, a katalog §4 i definicje §5 `new-component.md`
  zostają uzupełnione po jego stworzeniu.

### Copy i terminologia

Teksty po polsku, w `Sentence case`. Terminy dziedzinowe bez tłumaczenia: HUD,
OCR, region, profil, run. Komunikaty błędów backendu pochodzą wyłącznie
z `api/messages.ts`; F3 dopisuje do tego słownika kody profilowe, których
jeszcze nie było, zamiast pisać własne teksty w feature.

### Korekta Design Planu — kontrakt `reference-preview` (przed zmianą UI)

Po zatwierdzonej korekcie `TECH_PLAN §5/§7` ekran nie czyta już obrazu z
`GET /profiles/current`. Pole ścieżki dostaje sąsiadującą akcję `Button`
„Wczytaj podgląd”, która uruchamia `POST /profiles/reference-preview`. To jedyny
nowy element interfejsu; `RegionEditor`, `RegionOverlay`, `DataList`, pola klas
i końcowy `Button` zapisu pozostają bez zmian.

- [x] **Layout/Siatka (GRID-01/02/05, SPACING-01/03/12)** — akcja podglądu leży
  po polu ścieżki w istniejącym przepływie panelu, z odstępem `--size-sm`;
  gotowy `Button md` zachowuje hit area `--control-height-md`.
- [x] **Typografia (TYPO-07/08, FONTSIZE-09, LHEIGHT-09, CASING-02)** — etykieta
  akcji używa istniejącej definicji `Button`, sentence case, bez nowej skali.
- [x] **Kolory, obramowania i cienie (COLOR-07/10, BORDER-06, BWIDTH-11,
  RADIUS-05, SHADOW-05)** — wszystkie stany pochodzą z wariantu `secondary`
  `Button`; bez nowych literałów, obramowań, promieni ani cieni.
- [x] **Interakcje (COLOR-07, OPACITY-01, FE-06)** — mutacja podglądu ustawia
  `loading`, natywny `disabled`, spinner i `aria-busy`; zmiana ścieżki po
  wczytaniu unieważnia podgląd i usuwa regiony, żeby nie zapisać geometrii
  narysowanej na innym obrazie. Brak optimistic update.
- [x] **Stany UI (FE-06)** — przed pierwszym podglądem istniejący `Empty`
  instruuje, jak zacząć; błąd endpointu renderuje istniejący `InlineError` ze
  słownika centralnego; sukces pokazuje istniejące `DataList` i `RegionEditor`.
  Stan oczekiwania niesie spinner samego przycisku, ponieważ nie ma osobnego
  query view ani powierzchni danych przed odpowiedzią.
- [x] **Komponenty (`new-component.md` §4–§5)** — użyte: `TextField`, `Button`,
  `Empty`, `InlineError`, `DataList`, `RegionOverlay` przez `RegionEditor`.
  Usunięte: trwały `Notice` o obrazie innego profilu, bo jego warunek już nie
  istnieje. Nie powstaje nowy komponent wspólny ani wpis w katalogu.

## Decyzje i interpretacje

### Prymityw overlaya: jeden `viewBox`, zero skalowania w JS

`RegionOverlay` renderuje `<svg viewBox="0 0 naturalWidth naturalHeight">`
i `preserveAspectRatio="none"` nad `<img>` rozciągniętym na to samo pudełko.
Skutek: prostokąt ma w DOM dokładnie te współrzędne, które pojadą do API —
`<rect x="480" y="270" width="960" height="270">` — a zmiana rozmiaru okna
zmienia wyłącznie pudełko CSS. Nie ma drugiej ścieżki skalowania, którą
trzeba by trzymać w zgodzie z pierwszą.

`preserveAspectRatio="none"` zamiast domyślnego `xMidYMid meet` jest wyborem
świadomym: przy `meet` przeglądarka może dołożyć letterboxing, którego czysta
funkcja `clientPointToSource` nie zna, więc render i arytmetyka mogłyby się
rozjechać o ułamek piksela. Element i tak jest układany w proporcjach obrazu,
więc `none` niczego nie zniekształca, a czyni odwzorowanie dokładnie liniowym.

Jedyne przejście między układami współrzędnych to `clientPointToSource`
w `geometry.ts` — moduł bez Reacta i bez DOM, testowany wprost. Done Criterion
„prostokąt zachowuje współrzędne po zmianie rozmiaru” jest przypięty dwa razy:
arytmetycznie (`geometry.test.ts` — ten sam punkt przy pięciu szerokościach
wyświetlania) i na DOM (`RegionOverlay.test.tsx` — atrybuty `<rect>` po
przełożeniu pudełka z 1440 px na 640 px).

### Wzorzec ARIA `listbox`, nie `<button>` na prostokąt

Prostokąty to `<g role="option">` w `<svg role="listbox">` z roving tabindex:
zaznaczony element ma `tabIndex=0`, reszta `-1`. Alternatywą było uczynienie
każdego prostokąta osobnym stopem Tab — odrzucona, bo F4 rysuje boksy per znak
i kilkadziesiąt stopów Tab na klatkę zamieniłoby overlay w pułapkę
klawiaturową. `listbox` daje jeden stop wejściowy, strzałki chodzą po zbiorze,
`Home`/`End` skaczą na końce, `Delete`/`Backspace` usuwa.

### Hit target: pas obrysu plus wypełnienie, a nie samo wypełnienie

Region łapie kliknięcie całą powierzchnią oraz przezroczystym pasem
`--size-xs` wokół krawędzi, z `vector-effect: non-scaling-stroke`, więc pas ma
tę samą szerokość w pikselach CSS niezależnie od skali `viewBox`. Bez tego pas
liczony w jednostkach źródłowych miałby przy obrazie 1920 px ułamek piksela na
ekranie. Dla boksów F4 (kilkanaście pikseli) sąsiadujące pasy będą się
nakładać — dlatego droga listy tekstowej z `Button`ami nie jest dodatkiem,
tylko drugą pełnoprawną ścieżką do każdej operacji.

### Rysowanie zaczyna się wyłącznie na gołym tle SVG

`onPointerDown` sprawdza `event.target !== surface` i wtedy nie zaczyna
rysowania. Dzięki temu prostokąty pozostają klikalne, a przeciągnięcie zaczęte
poza istniejącym regionem działa wszędzie. Cena: nowego regionu nie da się
zacząć rysować od punktu leżącego wewnątrz innego regionu — trzeba zacząć obok.
Uznane za akceptowalne, bo regiony HUD rzadko się zagnieżdżają, a alternatywa
(modalne „narzędzie rysowania”) dokłada stan, którego v1 nie potrzebuje.

### Klasy bazowe to zamknięty alfabet, nie pole tekstowe

`DatasetDefinitionEngine._validate_category` odrzuca `kind="character"`
o nazwie spoza `_CHARACTER_CATEGORIES` (`-`, `/`, `0-9`, `A-Z`) kodem
`invalid_character_category`. Pole tekstowe pozwoliłoby wpisać nazwę, którą
backend może wyłącznie odrzucić, więc klasy bazowe są 38 przełącznikami
`Button` z `aria-pressed`. Klasy per gra zostają tekstem swobodnym, bo backend
ogranicza je tylko długością i unikalnością.

### Walidacja granic regionu należy do backendu, nie do Zod

Schemat Zod pilnuje nazwy, ścieżki, liczności, unikalności i dodatniej
geometrii. Nie sprawdza, czy region mieści się w obrazie, bo overlay już
przycina każdy narysowany prostokąt do wymiarów źródłowych — jedyną drogą do
regionu poza obrazem jest rozjazd wymiarów obrazu, który wykrywa backend
i zgłasza jako `region_out_of_bounds`. Funkcja `fitsInSource` istnieje
w `geometry.ts` i jest przetestowana, ale nie jest wpięta w schemat: to
odpowiednik reguły backendu dla F4, nie druga, cichsza wersja kontraktu.

### Słownik błędów uzupełniony o kody profilowe

`api/messages.ts` miał `profile_name_exists`, `regions_required`,
`categories_required`, `region_out_of_bounds` i `unsupported_reference_image`.
`POST /profiles` potrafi zwrócić jeszcze czternaście innych kodów
(`reference_path_not_absolute`, `invalid_reference_image`,
`reference_image_unreadable`, `invalid_source_dimensions`,
`profile_name_required`, `profile_name_too_long`, `invalid_region_name`,
`invalid_region_bbox`, `duplicate_region_name`, `invalid_category_name`,
`invalid_category_kind`, `invalid_character_category`,
`duplicate_category_name`, `reference_asset_copy_failed`,
`profile_persistence_failed`). Każdy nazywa inną naprawę, więc wpadanie
w generyczny fallback ukrywałoby, co użytkownik ma zrobić. Dopisane do
istniejącego słownika, a nie do feature — zasada „żaden ekran nie pisze
własnej wersji tekstu dla kodu backendu” zostaje nienaruszona.

### Przechwytywanie wskaźnika jako ulepszenie, nie wymóg

`setPointerCapture` trzyma przeciągnięcie przy życiu poza powierzchnią, ale
nie każdy silnik i nie każdy wskaźnik je udźwignie (jsdom w testach też nie).
Wywołanie jest opakowane w `try`/`catch`: odrzucone przechwycenie nie jest
awarią, bo prostokąt i tak powstaje z tych zdarzeń, które dotarły.

## Obserwacje do kontraktu

1. **CF-01 zakłada etap, którego §5 nie ma — i to blokuje pierwszy profil.**
   CF-01 sekwencjonuje: krok 2 „API waliduje obraz i kopiuje go do katalogu
   projektu”, krok 3 „UI pobiera obraz przez opaque asset URL i pozwala
   narysować regiony”, krok 5 „backend zapisuje profil”. To wymaga endpointu,
   który zestage'uje obraz i odda `asset_id` **przed** zapisem profilu.
   TECH_PLAN §5 takiego endpointu nie ma, a implementacja jest z §5 spójna:
   `POST /profiles` jest atomowy i wymaga `regions` z `min_length=1` już
   w żądaniu (`CreateProfileRequest`), stage'uje obraz wewnętrznie i wyrzuca go
   przez `staged_asset.discard()`, jeśli zapis się nie powiedzie.

   Wynika z tego zamknięte koło: żeby narysować regiony, trzeba widzieć obraz;
   żeby zobaczyć obraz, trzeba mieć `asset_id`; żeby mieć `asset_id`, trzeba
   zapisać profil; żeby zapisać profil, trzeba mieć regiony. Dla **pierwszego**
   profilu w instalacji koła nie da się przerwać z poziomu UI.

   To wygląda na lukę w dokumencie, nie w kodzie. Najmniejsza naprawa: endpoint
   w rodzaju `POST /profiles/reference {reference_image_path}` →
   `{asset_id, width, height}`, który robi dokładnie to, co dzisiaj robią
   wewnętrznie `ReferenceAssetStore.stage` i `ReferenceImageProbe.inspect`,
   a `POST /profiles` przyjmowałby wtedy `asset_id` zamiast ścieżki.
   Do rozstrzygnięcia przed domknięciem Gate 3 — bez tego CF-01 nie przechodzi
   end-to-end.

2. **Podgląd w F3 rysuje na obrazie bieżącego profilu i mówi o tym wprost.**
   Konsekwencja punktu 1. Jedynym źródłem `asset_id` w kontrakcie jest
   `GET /profiles/current` (wymieniony w sekcji Kontrakt ticketu), więc ekran
   ładuje ten obraz i pokazuje trwały `Notice`, że podgląd pochodzi z profilu
   „X” o wymiarach W × H, a nie z pliku wpisanego w polu ścieżki. Gdy
   `GET /profiles/current` zwraca `null`, panel regionów pokazuje `Empty`
   nazywający brak, zamiast udawać działające płótno. To działa dla realnego
   przepływu v1 „popraw profil = utwórz nowy” (edycja profilu to F02, poza v1)
   i nie działa dla pierwszego profilu — patrz punkt 1.

3. **`region_out_of_bounds` jest jedynym sygnałem rozjazdu rozdzielczości
   przy tworzeniu profilu.** Jeśli plik z pola ścieżki ma inne wymiary niż
   obraz, na którym rysowano, backend odrzuci regiony dopiero przy zapisie.
   Nie ma odpowiednika `profile_resolution_mismatch` (ten dotyczy materiału
   wobec profilu). Ekran ostrzega o tym w `Notice` z góry, ale werdykt i tak
   należy do backendu.

4. **`_CHARACTER_CATEGORIES` nie jest udokumentowany w §5 ani w CONTEXT.**
   Zamknięty alfabet klas bazowych żyje wyłącznie w
   `backend/app/engines/definition/engine.py`. UI musi go znać, żeby nie
   oferować wyboru, który backend odrzuci, więc `schemas.ts` trzyma jego kopię
   z testem przypinającym zawartość. Warto go podnieść do TECH_PLAN §4 obok
   `CategoryKind`.

## Wykonanie

Commity: `df8831d` (Design Plan), `92f80c1` (`RegionOverlay` + katalog),
`ca0ed56` (ekran profilu), `0d16fa6` (testy przepływu), `f22bc85` (testy
schematu) i ten commit (log).

### Bramki

| Bramka | Komenda | Wynik |
|---|---|---|
| Testy | `npm run test` | 26 plików, 339 testów, 0 nieudanych |
| Typy | `npm run typecheck` | 0 błędów |
| Build | `npm run build` | zielony, `tsc --noEmit` + `vite build` |
| Audit | `npm audit` | info/low/moderate/high/critical = 0 (175 zależności) |
| Architektura | `src/test/architecture.test.ts` | 77 testów, 0 nieudanych |

Wzrost wobec F2: 22 → 26 plików testowych, 251 → 339 testów, 66 → 77 testów
architektury (nowe pliki produkcyjne dochodzą do reguł `it.each`).

### Pakiety

Zero nowych zależności. `RegionOverlay` jest zbudowany na natywnym SVG —
FE-001 §Pakiety zabrania frameworka canvasowego bez udowodnionej potrzeby,
a prostokąty w jednym `viewBox` takiej potrzeby nie tworzą.

### Testy pokrywające Done Criteria

| Kryterium | Test |
|---|---|
| Design Plan dla każdego elementu UI | sekcja „Design Plan” wyżej; katalog `new-component.md` §4–§5 uzupełniony o `RegionOverlay` |
| Transformacja współrzędnych przy zmianie rozmiaru | `RegionOverlay/geometry.test.ts` — ten sam punkt przy pięciu szerokościach wyświetlania; `RegionOverlay/RegionOverlay.test.tsx` — atrybuty `<rect>` niezmienione po przełożeniu pudełka 1440 → 640 px oraz identyczny wynik tego samego gestu na dwóch powierzchniach o różnych rozmiarach i różnych offsetach |
| `viewBox` z wymiarów naturalnych, nie wyświetlanych | `geometry.test.ts`, `RegionOverlay.test.tsx`, `profileFlow.test.tsx` |
| Hit target: wskazanie i usunięcie klawiaturą | `RegionOverlay.test.tsx` — Tab, strzałki, `Home`/`End`, `Enter`, `Delete`, `Backspace`, jeden stop tabulacji przy wielu prostokątach; `profileFlow.test.tsx` — ta sama operacja przez listę tekstową |
| Overlay to elementy DOM | wszystkie testy operują na `role="option"`, żaden nie porównuje pikseli |
| `409 profile_name_exists` jako komunikat | `profileFlow.test.tsx` |
| `404 source_missing` jako komunikat | `profileFlow.test.tsx` |
| `400 region_out_of_bounds` bez reinterpretacji | `profileFlow.test.tsx` |
| Loading / empty / error / success dla query | `profileFlow.test.tsx` — cztery osobne przypadki na `GET /profiles/current` |
| Mutacja blokuje kontrolkę i pokazuje spinner | `profileFlow.test.tsx` — żądanie trzymane otwarte, `aria-busy` + `disabled`, zwolnienie kontrolki po odpowiedzi |
| Brak optimistic update | `src/test/architecture.test.ts` (`onMutate`, `setQueryData`) |
| Walidacja inline przed żądaniem | `profileFlow.test.tsx` — pusty formularz i ścieżka względna nie wychodzą z przeglądarki |
| Schemat mirroruje regułę backendu | `features/profiles/schemas.test.ts` — nazwa, ścieżka, liczności, unikalność bez względu na wielkość liter, dodatnia geometria, alfabet OCR |
| Obraz wyłącznie przez opaque asset URL | `profileFlow.test.tsx` — `src` to `/api/v1/assets/references/asset-1`; żaden test nie zna ścieżki pliku |
| Ciało żądania w pikselach źródłowych | `profileFlow.test.tsx` — pełna asercja `POST /profiles` |
| Sukces prowadzi do importu materiału (CF-01.6) | `profileFlow.test.tsx` |
| Trasa `/profiles/new` renderuje ekran | `src/app/routes.test.tsx` |
| Kontrast obrysu regionu | `src/styles/contrast.test.ts` |

## Domknięcie luki kontraktu `reference-preview`

Po akceptacji obserwacji nr 1 kontrakt został rozszerzony o
`POST /profiles/reference-preview`. Backend publikuje zweryfikowany obraz bez
rekordu `reference_assets` i rejestruje `asset_id → {relpath, content_type}`
wyłącznie w pamięci procesu. `GET /assets/references/{asset_id}` sprawdza DB,
a po braku rekordu ten rejestr; restart unieważnia podgląd, a istniejący startup
reconciliation usuwa plik jako orphan. `POST /profiles` celowo stage'uje własny
asset i zachowuje dotychczasowy payload — podgląd nie jest trwałym składnikiem
profilu.

Frontend nie czyta już `GET /profiles/current` w ekranie tworzenia. Przepływ
dla świeżej instalacji to: ścieżka absolutna → podgląd po opaque UUID → obraz
i `viewBox` z wymiarów naturalnych → regiony → `POST /profiles` z tą samą
ścieżką i geometrią źródłową. Usunięto obejście z `Notice` o obrazie innego
profilu. Zmiana ścieżki unieważnia podgląd i regiony, więc geometria nie może
zostać przypadkiem zapisana względem innego pliku.

Commity domykające: `291ae65` (backend + kontrakt) i `f3e62ed` (frontend,
testy przepływu i aktualizacja pośredniego `nanoid` 3.3.16 → 3.3.18 w dozwolonym
zakresie lockfile, po nowym advisory npm).

### Finalne bramki po domknięciu

| Bramka | Komenda | Wynik |
|---|---|---|
| Backend testy | `python -m pytest --basetemp .tmp/pytest-fe001-f3-full-20260824 -q` | 273 testy, 0 nieudanych, 27:36 |
| Backend lint | `python -m ruff check .` | 0 uwag |
| Backend typy strict | `python -m mypy` | 93 pliki, 0 błędów |
| Frontend testy | `npm run test` | 26 plików, 340 testów, 0 nieudanych |
| Frontend typy | `npm run typecheck` | 0 błędów |
| Frontend build | `npm run build` | zielony, `tsc --noEmit` + `vite build` |
| Frontend audit | `npm audit` | 0 podatności |
| Architektura | `src/test/architecture.test.ts` | 77 testów, 0 nieudanych |

Nowe testy backendu pokrywają sukces z realnymi wymiarami, `400
reference_path_not_absolute`, `404 source_missing`, odczyt zwróconego UUID przez
endpoint assetu oraz usunięcie porzuconego podglądu po restarcie bez profilu i
bez trwałego rekordu assetu. Test frontendowy wykonuje realne dwa kroki,
sprawdza użycie `preview.asset_id` przez `<img>` oraz identyczną ścieżkę i
geometrię źródłową w późniejszym `POST /profiles`; zgodnie z kontraktem nie
oczekuje identycznego trwałego `asset_id`.

---

# FE-001-F4 — Ekran weryfikacji anotacji

## Design Plan (przed kodem UI)

Źródła przeczytane przed pisaniem kodu: `frontend/src/styles/tokens.css`
w całości, `.agent/guidelines/new-component.md` w całości (procedura §2.2,
katalog §4 i definicje §5) oraz następujące moduły
`_agent_oriented_guidelines_final_UI_UX_v3.md` od nagłówka modułu do końca:

| Moduł | Zakres ID | Po co w tym tickecie |
|---|---|---|
| Siatka i Odstępy | GRID-00…14, SPACING-01…13 | Trzykolumnowy układ lista klatek → obraz → lista anotacji, 8-punktowe odstępy, wiersze i hit area kontrolek, biała przestrzeń wokół obrazu, minimalna szerokość edytora 1280 px |
| Kolor | COLOR-01…10 | Stany zaznaczenia, zamrożenia i błędu, semantyczny error dla `bbox_invalid`, odróżnienie interakcji bez polegania wyłącznie na kolorze |
| Obramowanie | BORDER-01…09 | Obrys obrazu i bbox, fokus klawiatury, jednostronny akcent wybranego wiersza |
| Szerokość Obramowania | BWIDTH-01…14 | Stały obrys SVG przy resize, 1 px struktury, 2 px zaznaczenia/fokusu/błędu bez przesunięcia układu |
| Promień Obramowania | RADIUS-01…05 | `--radius-none` dla precyzyjnych bbox, `--radius-md` dla kontrolek i wierszy, `--radius-lg` dla paneli, `--radius-pill` dla odznak |
| Nakładki | OVERLAY-01…07 | OVERLAY-06 dla przezroczystego hit-targetu bbox; brak modali, tooltipów i tekstu nakładanego na obraz |
| Cienie | SHADOW-01…05 | SHADOW-05: ciemny motyw, więc hierarchię niosą powierzchnie i spacing, nie `box-shadow` |
| Typografia | TYPO-01…21, FONTSIZE-01…11, LHEIGHT-01…14, LSPACE-01…09, PARASPACE-01…06, CASING-01…03 | Nagłówki paneli, etykiety/statusy, liczby bbox monospace, polskie copy w `Sentence case`, mały `UPPERCASE` wyłącznie w gotowych eyebrow/odznakach |
| Przezroczystość | OPACITY-01…02 | Hover jako warstwa alpha i `--opacity-disabled` dla zamrożonego/busy edytora |

### Wszystkie elementy UI powstające w F4

Ekran **Anotacje** (`/annotations/:runId`, `runId` wyłącznie z URL):

1. `AnnotationReviewScreen` (`frontend/src/features/annotations/**`) — kompozycja
   query listy klatek, wybranej klatki, runu i bieżącego profilu. Każde query ma
   jawny `Loading`, `Empty`, `FatalError` i sukces; React nie wywołuje `fetch`.
2. Pasek filtrowania — `SelectField` „Status weryfikacji” z jawnymi opcjami
   Wszystkie / Oczekujące / Zaakceptowane / Odrzucone. `rejected` jest zawsze
   widoczny i stanowi wejście do akcji `reopen`.
3. `FrameList` w `Panel` — stronicowana lista podsumowań klatek. Każdy wiersz
   pokazuje numer, timestamp, etap (`StatusBadge`), `review_status`
   (`StatusBadge`) i `Button` „Otwórz”; zaznaczenie nie opiera się na kolorze.
4. Paginacja — tekst „Strona X z Y” oraz `Button` „Poprzednia” i „Następna”,
   z natywnym `disabled` na krańcach. Rozmiar strony jest stały i ograniczony
   przez kontrakt API; ekran nie ładuje obrazów listy.
5. `FrameEditor` w `Panel` — metadane wybranej klatki przez `DataList` (indeks,
   czas, wymiary naturalne, etap, wersja) oraz `StatusBadge` decyzji.
6. `RegionOverlay` — jedyny obraz i jedyny overlay: opaque
   `frameImageUrl(frame.id)`, `source={width,height}` z API, aktywne anotacje jako
   jedna kolekcja backendu. `viewBox` pozostaje w naturalnych pikselach klatki.
7. Tryb dodawania — `SelectField` klasy nowego boksu, instrukcja rysowania oraz
   gest `RegionOverlay.onDraw`. Równoległa droga klawiaturowa ma cztery
   `TextField` (`x/y/width/height`) i `Button` „Dodaj bbox z pól”. Obie drogi
   kończą się tym samym `POST /frames/{id}/annotations`; brak lokalnego
   optimistic insertu i brak drugiego przelicznika współrzędnych.
8. Tryb zmiany geometrii na obrazie — `Button` „Narysuj nową geometrię” przy
   anotacji przełącza następny gest `onDraw` w `PATCH` wybranej anotacji zamiast
   tworzenia drugiego overlaya albo drugiego przelicznika współrzędnych.
9. `AnnotationList` obok obrazu — dostępna lista aktywnych anotacji. Każdy
   wiersz pokazuje klasę, bbox `x/y/w/h` w monospace, `source=OCR|manual`
   (`StatusBadge`) i confidence tylko dla OCR; zaznaczenie synchronizuje się
   z overlayem.
10. Operacje wiersza anotacji — `SelectField` zmiany klasy i `Button` „Zapisz
    klasę” (kontrolka mutacji ze spinnerem); cztery `TextField` liczby `x`, `y`,
    `width`, `height` i `Button` „Zapisz geometrię”; `Button`
    „Narysuj nową geometrię”; `Button` „Zaznacz”; `Button` „Usuń”. To pełna
    droga klawiaturowa v1 bez trafiania w mały bbox.
11. Akcje decyzji — dla `pending`: `Button` primary „Zaakceptuj klatkę” oraz
    secondary „Odrzuć klatkę”; dla `rejected`: tylko `Button` „Otwórz ponownie”;
    dla `accepted`: brak mutacji i jawny `Notice` o terminalnym zamrożeniu.
12. Stany mutacji — kliknięta kontrolka ma `loading` (spinner, `aria-busy`,
    natywny `disabled`), pozostałe kontrolki edycji są blokowane, aby nie
    wysłać równoległej mutacji ze starą wersją. Po sukcesie centralna invalidacja
    i refetch; zero `setQueryData`, `onMutate` i lokalnego podmieniania datasetu.
13. Błędy mutacji — `InlineError` pokazuje polskie copy i jawny kod ze
    wspólnego `describeApiError`. `409 version_conflict` dodatkowo invaliduje
    i przeładowuje klatkę; `frame_not_reviewable`, `review_locked` i
    `no_annotations` pozostają semantycznymi komunikatami słownika.
14. `bbox_invalid` — `details.annotation_ids` ustawia zbiór konkretnych ID:
    tylko te bbox dostają ogólny `tone="error"` w `RegionOverlay` i klasę błędu
    w liście z tekstem „Boks poza granicami klatki”. Wyróżnienie ma kolor,
    grubszy obrys, tekst i `aria-invalid`, więc nie zależy od samej czerwieni.
15. Stan obrazu — błąd opaque image URL jest osobnym `InlineError`; ekran nie
    próbuje odczytać ani pokazać `image_relpath`.
16. Guard szerokości — istniejący `WidthGuard` poniżej 1280 px zastępuje cały
    workspace komunikatem o niewspieranym edytorze. CSS F4 przy szerokości
    `>=1280px` nie ma poziomego overflow i nie ściska obrazu do wersji mobilnej.

Rozszerzenie komponentu wspólnego:

17. `RegionOverlay.OverlayShape.tone="error"` — ogólna semantyczna odmiana
    prostokąta niepoprawnego. Nie powstaje drugi overlay ani nowa transformacja;
    katalog `new-component.md` §5 dostanie wyłącznie nowy wiersz odmiany error.

### Checklista wymagana przez `new-component.md` §2.2

- [x] **Layout/Siatka (GRID-01/02/05/08/09/10/11, SPACING-01/02/06/11/12)** —
  workspace to grid `minmax(192px, 24%) minmax(0, 1fr) minmax(320px, 32%)`
  z `gap: var(--size-md)`; liczby te są ograniczeniami proporcji, nie arbitralnym
  spacingiem. Panele i grupy dzieli `--size-lg`, elementy powiązane `--size-sm`
  lub `--size-xs`. Obraz ma `max-width: 100%`, nigdy nie jest powiększany ponad
  naturalny rozmiar (GRID-08), a jego otoczenie ma `--size-md` (SPACING-11).
  Wiersze list mają minimum `--control-height-lg` i padding `--size-sm`; każdy
  `Button sm` zachowuje 32 px minimum desktopowego hit area (GRID-05).
- [x] **Typografia (TYPO-07/08, FONTSIZE-02/08/09/10, LHEIGHT-09/10,
  LSPACE-02/07, CASING-02/03)** — maksymalnie cztery rozmiary na ekran:
  `--font-size-xl` nagłówek trasy z powłoki, `--font-size-lg` tytuły paneli,
  `--font-size-sm` treść i kontrolki, `--font-size-xs` wyłącznie metadane,
  odznaki i bbox. Dwie wagi: regular/semibold. Bbox używa
  `--font-family-mono`; copy jest `Sentence case`, a gotowe odznaki/eyebrow
  zachowują `UPPERCASE` + `--letter-spacing-wide`.
- [x] **Kolory (COLOR-02/07/08/09/10)** — tło/powierzchnie/akcent zachowują
  paletę 60/30/10. Wybrane elementy używają brand soft + `aria-selected` albo
  tekstu „Wybrana”. Zamrożenie jest komunikatem i `disabled`, nie szarym
  kolorem bez opisu. `bbox_invalid` używa tokenów status error oraz tekstu
  błędu; nowe pary trafią do `contrast.test.ts` tylko jeśli nie są już
  pokryte. Brak surowych literałów koloru.
- [x] **Obramowania (BORDER-02/03/05/06/07/08, BWIDTH-03/06/10/11/12/13,
  RADIUS-01/02/03/05)** — panele grupuje spacing; `stroke-weak` oddziela
  wiersze i chroni krawędź obrazu (BORDER-07). Interaktywne kontrolki używają
  `stroke-strong`; fokus 2 px, błąd 2 px i wszystkie zmiany rysują się do
  wewnątrz. Bbox ma `--radius-none`; pola/listy `--radius-md`; panel
  `--radius-lg`; odznaka `--radius-pill`.
- [x] **Cienie (SHADOW-05)** — brak `box-shadow`; ciemny motyw komunikuje
  hierarchię jaśniejszą powierzchnią panelu i spacingiem.
- [x] **Interakcje (COLOR-07, OPACITY-02, OVERLAY-06, BORDER-06, GRID-05,
  FE-06/07/08)** — hover pochodzi z tokenu alpha, fokus jest widoczny,
  hit-target overlaya zachowuje 8 px CSS przez `non-scaling-stroke`. Overlay ma
  roving tabindex, a lista daje każdą operację v1 klawiaturą. Busy blokuje
  kontrolki i pokazuje spinner na kontrolce sprawczej. Frozen blokuje edycję.
  Przy <1280 px istniejący guard zastępuje edytor komunikatem.
- [x] **Komponenty (katalog §4–§5 `new-component.md`)** — użyte bez zmian:
  `Button` (wszystkie akcje), `UiStates` (Loading/Empty/InlineError/FatalError),
  `StatusBadge` (status klatki, etap, source), `Panel` (lista, edytor, anotacje),
  `Notice` (zamrożenie/instrukcja), `TextField` (liczbowa geometria),
  `SelectField` (filtr i klasy), `DataList` (metadane) oraz `RegionOverlay`
  (jedyna powierzchnia obrazu/geometrii). Nie powstaje nowy komponent common;
  `RegionOverlay` dostaje wyłącznie ogólny `error` tone wymagany do wskazania
  konkretnych ID z kontraktu.

### Copy, dane i kontrakt

Teksty są polskie i w `Sentence case`; OCR, HUD, bbox, manual i run pozostają
terminami technicznymi. Odpowiedź anotacji ma płaskie `x/y/width/height`,
natomiast `POST`/`PATCH` wysyłają zagnieżdżone `bbox`. Widok filtruje jedyną
listę `annotations` do `status !== "deleted"`; nie tworzy osobnych kolekcji OCR
i manual. Mutacje klatki (`create`, decyzje) wysyłają bieżący `frame.version`,
a `PATCH`/`DELETE` bieżący `annotation.version`, zgodnie z rzeczywistymi guardami
TK-007. Kategorie pochodzą z typowanego `GET /profiles/current`; ekran jawnie
zatrzymuje edycję, jeśli `run.profile_id` i bieżący profil nie są zgodne.

## FE-001-F4 — wykonanie i weryfikacja (2026-08-24)

### Zrealizowany kształt

- `/annotations/:runId` renderuje `AnnotationReviewScreen`; `runId` pochodzi
  wyłącznie z `useParams` i pozostaje widoczny w panelu filtra.
- Lista klatek wysyła jawny parametr `review_status`, ma paginację i wszystkie
  stany query. Filtr `Odrzucone` jest jedyną drogą do operacji `reopen`.
- `FrameEditor` pobiera jedną klatkę i jeden opaque URL obrazu. Płaską geometrię
  odpowiedzi przekazuje do jednego `RegionOverlay`, którego `viewBox` jest
  naturalnym rozmiarem obrazu. Dodawanie i zmiana geometrii korzystają z tego
  samego `onDraw`; pola liczbowe zapewniają równoległą drogę klawiaturową.
- Wszystkie siedem operacji (`create`, `update-class`, `update-geometry`,
  `delete`, `accept`, `reject`, `reopen`) przechodzi przez typowany klient,
  wysyła bieżący `expected_version`, nie ma `onMutate`/`setQueryData`, a po
  sukcesie używa centralnej invalidacji i refetchu.
- `version_conflict` jawnie przeładowuje klatkę i listę. `bbox_invalid`
  mapuje `details.annotation_ids` dokładnie na czerwony/dashed bbox oraz
  `aria-invalid` i tekst w liście. Pozostałe kody domenowe korzystają ze
  wspólnego polskiego słownika i zachowują jawny kod backendu.
- `accepted` i `rejected` są zamrożone; `accepted` jest terminalny, a
  `rejected` udostępnia wyłącznie `reopen`. Akceptacja bez aktywnej anotacji
  jest zablokowana i ma komunikat `no_annotations`.

### RegionOverlay

Wspólny prymityw dostał wyłącznie ogólne `OverlayShape.tone="error"`.
Transformacje, hit-target, roving tabindex, gest rysowania i pojedyncza
warstwa SVG pozostały bez duplikacji. Odcień error ma semantyczny token statusu,
grubszy dashed stroke i test zachowania geometrii. Do katalogu komponentu
dopisano tylko dozwolony wiersz odmiany w §5.

### Testy i bramki

| Bramka | Wynik |
| --- | --- |
| `npm run test` | 29/29 plików, 372/372 testów |
| `npm run test -- src/test/architecture.test.ts` | 1/1 plik, 85/85 testów |
| `npm run typecheck` | 0 błędów |
| `npm run build` | 288 modułów; JS 492.04 kB (gzip 150.78 kB), CSS 33.95 kB (gzip 4.98 kB) |
| `npm audit` | 0 podatności |

Pokrycie F4 obejmuje siedem parametryzowanych mutacji z `expected_version` i
409, filtr/reopen, query loading/empty/error/success, resize/hit-target
`RegionOverlay`, komplet operacji listy z klawiatury, dokładne wyróżnienia
`bbox_invalid`, `frame_not_reviewable`, spinnery/disabled oraz brak optimistic
update. Istniejące testy F3 `RegionOverlay` pozostały zielone.

### QA wizualne i ograniczenia środowiska

Repo zawiera uruchamialny design harness komponentów i fixture Vitest, ale nie
zawiera runtime fixture/mock servera z runem, obrazem i anotacjami dla ekranu
F4 ani zależności do browser E2E. Dlatego nie wygenerowano mylącego screenshota
bez danych produktu. Automatyczne QA potwierdza: 1440 px przepuszcza istniejący
`WidthGuard`, <1280 px zastępuje cały shell komunikatem o niewspieranej
szerokości, `RegionOverlay` zachowuje transformację i stały hit-target przy
resize, a trzy kolumny używają `minmax(0, 1fr)`/`min-width: 0`. Ręczny pomiar
`scrollWidth` na rzeczywistym fixture pozostaje do wykonania, gdy repo otrzyma
uruchamialne dane przeglądarkowe.

### Odchylenia i sygnały planu

- Brak zmian backendu, kontraktów dokumentacyjnych i zależności npm.
- Rzeczywisty guard TK-007 wymaga `frame.version` dla create/decyzji, lecz
  `annotation.version` dla PATCH/DELETE; implementacja i testy odzwierciedlają
  ten podział zamiast upraszczać wszystkie operacje do wersji klatki.
- API v1 nie udostępnia pobrania profilu po `run.profile_id`; dostępne jest
  tylko `GET /profiles/current`. To ograniczenie planu dla historycznego runu,
  nie sprzeczność naprawialna w FE-001-F4. Ekran nie zgaduje kategorii: przy
  niezgodności ID zatrzymuje edycję z jawnym błędem.
- Nie wykryto sprzeczności wymagającej zmiany kontraktu ani funkcji oznaczonej
  jako „później”.

## FE-001-F4-FIX1 — Design Plan addendum (2026-08-24)

FIX1 zachowuje układ, paletę, hierarchię i wszystkie elementy bazowego Design
Planu F4. Zmienia wyłącznie stany i zachowanie poniższych istniejących elementów:

1. `RegionOverlay` otrzymuje jawny `interactionMode="select"|"draw"`. Tryb
   `select` zachowuje interakcje F3. Tryb `draw` pozwala rozpocząć gest także
   wewnątrz istniejącego bbox i nadal używa jednego `viewBox`, jednego
   przelicznika oraz jednej warstwy SVG.
2. `Notice` trybu redraw nazywa rzeczywisty target klasą i ID anotacji.
   Zmiana selection anuluje redraw, więc opis i przyszły PATCH pozostają
   jednoznaczne; UI nie utrzymuje dwóch niezależnych targetów.
3. `Button` „Spróbuj ponownie załadować obraz” pojawia się obok
   `InlineError` obrazu. Ma wariant secondary, rozmiar sm, remountuje obraz i
   znika po `onSourceResolved`; nie zmienia geometrii ani wybranego bbox.
4. Podczas dowolnej mutacji runu istniejące `SelectField` filtra, `Button`
   paginacji, wiersze/`Button` wyboru klatki oraz wszystkie kontrolki edytora
   są disabled. Spinner pozostaje na kontrolce sprawczej, a globalny stan busy
   przetrwa zmianę selection dzięki mutacji podniesionej do ekranu.
5. Empty dalszej strony nie zastępuje paginacji bez drogi powrotu: efekt clamp
   zmienia tylko numer strony, po czym lista renderuje istniejącą stronę.
6. Profile loading/error/success korzystają z tych samych `Loading`,
   `FatalError` i paneli co F4, lecz query jest kluczowane po `run.profile_id`.
   `profile_not_found` zachowuje centralne polskie copy i retry.

### Checklista UI/UX FIX1

- [x] **Layout/Siatka — GRID-01/02/05/08/09/10/11,
  SPACING-01/02/03/04/06/07/08/10/11/13:** bez nowych wymiarów i bez zmian
  trzykolumnowego gridu. Retry używa gotowego `Button sm` (minimum 32 px), a
  komunikat trybu/retry pozostaje w istniejącej grupie z `gap` opartym o
  `--size-xs`/`--size-sm`. Brak arbitralnych pikseli.
- [x] **Typografia — TYPO-02/07/08, FONTSIZE-02/08/09/10,
  LHEIGHT-09/10, LSPACE-02/07/09, CASING-02/03:** nowe copy jest polskim
  Sentence case; nazwa targetu używa istniejącego body/metadata, bez nowego
  rozmiaru lub wagi. Eyebrow/odznaki zachowują istniejący uppercase + wide.
- [x] **Kolory — COLOR-02/07/08/09/10, OPACITY-02:** żadnych nowych kolorów.
  Busy/disabled używa `--opacity-disabled`; image error istniejących tokenów
  status error; akcja retry używa neutralnego secondary i nie udaje sukcesu.
- [x] **Obramowania — BORDER-02/03/05/06/07, BWIDTH-03/06/10/11/12/13,
  RADIUS-01/02/03/05:** nowe zachowanie nie zmienia chrome. Retry ma gotowy
  stroke/focus/radius `Button`, overlay nadal ma ostre bbox i non-scaling
  stroke. Fokus i błędy pozostają rysowane do wewnątrz.
- [x] **Nakładki — OVERLAY-06:** w trybie draw shape nie staje się niewidzialną
  przeszkodą; pointerdown deleguje rysowanie jawnie. W select hit-target i
  roving tabindex działają jak F3.
- [x] **Cienie — SHADOW-05:** brak cieni i nowych poziomów elevation.
- [x] **Interakcje — GRID-05, COLOR-07, BORDER-06, OPACITY-02, OVERLAY-06,
  FE-06/07/08:** globalne disabled blokuje filtr, stronę i selection; aktywna
  kontrolka zachowuje spinner/`aria-busy`. Retry jest widoczną akcją i faktycznie
  remountuje image. Draw/redraw dopuszcza start na nakładającym się bbox.
- [x] **Komponenty — katalog `new-component.md` §4–§5:** użyte istniejące
  `Button`, `UiStates`, `Notice`, `SelectField`, `Panel` i `RegionOverlay`.
  Nie powstaje nowy common component. Definicja `RegionOverlay` §5 zostanie
  rozszerzona wyłącznie o ogólny prop trybu interakcji po implementacji.

## FE-001-F4-FIX1 — wykonanie i weryfikacja (2026-08-24)

### Rozwiązania findings F1–F8

1. **F1 — jednoznaczny redraw:** stan redraw zawiera wyłącznie docelowe
   `annotationId`, a komunikat podaje klasę i ID targetu. Zmiana zaznaczenia
   jawnie anuluje redraw. Test A → zaznaczenie B → gest potwierdza, że A nie
   dostaje PATCH, a gest tworzy nową anotację manual.
2. **F2 — trwałe `bbox_invalid`:** submit nie czyści zbioru. Kolejne
   `bbox_invalid` atomowo zastępuje ID; geometry/delete success usuwa tylko ID
   zmienionej anotacji; unrelated success i 409 zachowują pozostałe; review
   success albo zmiana klatki czyści całość. Test z dwoma ID obejmuje success
   jednego targetu i późniejszy 409.
3. **F3 — profil historyczny:** backend udostępnia
   `GET /profiles/{profile_id}` po statycznym `GET /profiles/current`, zwraca ten
   sam pełny `GameProfile` i stabilne `404 profile_not_found`, bez migracji.
   Repozytorium i use case pobierają dokładne ID. Frontend ma typowane
   `getProfile(id)`, `queryKeys.profile(id)` i uruchamia query dopiero po
   rozwiązaniu `run.profile_id`; usunięto normalną ścieżkę current/mismatch.
   Testy dwóch profili potwierdzają starszy profil po ID, nadal poprawny current
   oraz missing 404.
4. **F4 — clamp paginacji:** gdy dalsza strona staje się pusta przy `total > 0`,
   numer strony jest cofany do ostatniej istniejącej strony i lista jest
   pobierana ponownie. Test wykonuje rzeczywisty review ostatniej pozycji strony
   2 i potwierdza powrót do działającej strony.
5. **F5 — serializacja write:** wszystkie mutacje runu dzielą centralny
   `mutationKey`; `useIsMutating` blokuje filtr, paginację, wybór klatki i
   kontrolki edytora, a lokalna kontrolka zachowuje spinner. Test A → B → A
   potwierdza brak drugiej mutacji i zachowanie wyniku pierwszej. Cache nie jest
   aktualizowany optymistycznie.
6. **F6 — jawny tryb overlaya:** `RegionOverlay` otrzymał ogólny
   `interactionMode="select"|"draw"`. Domyślne `select` zachowuje F3, natomiast
   `draw` pozwala rozpocząć drag wewnątrz istniejącego bbox. Testy obejmują oba
   tryby i nakładający się gest; nie powstał drugi overlay ani przelicznik.
7. **F7 — retry obrazu:** widoczny przycisk zwiększa próbę w opaque URL i przez
   `key` faktycznie remountuje/re-requestuje obraz. `onSourceResolved` usuwa błąd
   po udanym load; naturalny `viewBox` i geometria pozostają bez zmian.
8. **F8 — kolejne DTO po refetchu:** testy success → refetch potwierdzają użycie
   `annotation.version + 1` w następnym PATCH/DELETE, `frame.version + 1` w
   create → accept/reject oraz reject → filtr rejected → reopen. Fixture tylko
   zwraca jawnie kolejne DTO; osobne testy prawdziwego 409 pozostały.

### Kontrakty i rozszerzenie wspólnego prymitywu

- Nowy endpoint profilu historycznego nie zmienia schematu bazy ani kształtu
  `GameProfile`. Literalne `/profiles/current` pozostaje rozwiązywane przez
  statyczny handler przed trasą dynamiczną.
- Jedynym rozszerzeniem `RegionOverlay` w FIX1 jest ogólny tryb interakcji.
  Wspólny `viewBox`, resize transform, hit-target, roving tabindex i warstwa SVG
  pozostały bez zmian; katalog §5 zawiera wyłącznie dozwolone dopisanie wariantu.
- Brak nowych zależności, optimistic update, migracji i backendowej logiki w
  fixture frontendowym.

### Pełne bramki końcowe

| Bramka | Wynik |
| --- | --- |
| `uv run ruff check .` | bez błędów |
| `uv run mypy` | 93 pliki źródłowe, bez błędów |
| `uv run pytest --basetemp D:\\my\\Projects\\DatasetFactory\\tmp\\pytest-fe001-f4-fix1-full-final` | 276/276 testów; 1608.07 s (26:48) |
| `npm run test` | 30/30 plików, 387/387 testów |
| `npm run test -- src/test/architecture.test.ts` | 1/1 plik, 85/85 testów |
| `npm run typecheck` | 0 błędów |
| `npm run build` | 288 modułów; JS 493.77 kB (gzip 151.27 kB), CSS 34.02 kB (gzip 4.99 kB) |
| `npm audit` | 0 podatności |
| `git diff --check` | bez błędów |

Pierwsza próba izolowanego pytest użyła niewłaściwego basetemp na dysku `C:`;
po przeniesieniu katalogu na `D:` dwie zbyt krótkie limity procesu (10 i 15
minut) przerwały bramkę bez błędu testu. Końcowy pojedynczy proces z realistycznym
limitem zakończył wszystkie 276 testów zielono w 26:48.

### QA, odchylenia i sygnały planu

Repo nadal nie ma uczciwego runtime browser fixture/mock servera z runem,
opaque obrazem i anotacjami. Nie wykonano więc pozornego success screenshotu;
runtime screenshot oraz ręczny pomiar overflow przy 1440 px pozostają jawną
niewykonaną częścią parent Gate 3. Automatyczne testy potwierdzają resize,
hit-target, retry/remount oraz guard <1280 px.

Rozstrzygnięcie produktu o historycznych runach ujawniło rzeczywistą lukę
kontraktu F4: samo `GET /profiles/current` nie mogło bezpiecznie zweryfikować
starszego runu. FIX1 zamyka ją read-only `GET /profiles/{profile_id}`. Nie
wykryto dalszej sprzeczności kontraktu ani potrzeby rozszerzenia zakresu.

## FE-001-F4-FIX2 — Design Plan addendum (2026-08-24)

FIX2 nie dodaje widocznego elementu ani nie zmienia układu. Jedynym elementem
interfejsu w zakresie jest istniejący `RegionOverlay`: powierzchnia
`<svg role="listbox">`, bbox `<g role="option">`, jego przezroczysty hit-target
oraz szkic prostokąta podczas drag. W `interactionMode="draw"` pointerdown na
shape zapamięta origin shape: niedrawable pointerup wybiera go dokładnie raz,
a drawable pointerup nadal tworzy nakładający bbox. Domyślny tryb `select`,
klawiatura, roving tabindex i wizualne stany pozostają bez zmian.

### Checklista UI/UX FIX2

- [x] **Layout/Siatka — moduł Siatka i Odstępy, GRID-01/02/05:** brak zmian
  wymiarów i CSS. Istniejący hit-target zachowuje minimum desktopowe oraz token
  `--size-xs`; nie powstaje arbitralna wartość ani nowe pole układu.
- [x] **Typografia — moduł Typografia:** brak nowego tekstu, copy, rozmiaru,
  wysokości linii, wagi lub kerningu; istniejące `label` i nazwy shape pozostają
  bez zmian, więc FIX2 nie wprowadza nowego ID typograficznego.
- [x] **Kolory — moduł Stylizacja Elementów/UI & Visuals, COLOR-07/09,
  OPACITY-02:** brak nowych kolorów. Istniejące
  `--color-fill-brand-impeccable-soft`, `--color-surface-neutral-hover` i
  `--opacity-disabled` zachowują znaczenie; logika pointer capture nie zmienia
  stanu wizualnego.
- [x] **Obramowania — moduł UI & Visuals, BORDER-05/06,
  BWIDTH-08/10/11/13, RADIUS-02:** istniejący bbox nadal używa
  `--border-width-emphasis`, `--focus-ring-width`,
  `--color-stroke-strong-default`, `vector-effect: non-scaling-stroke` i
  `--radius-none`. Brak zmian obrysu lub geometrii.
- [x] **Nakładki — moduł UI & Visuals, OVERLAY-06:** niewidoczny hit-target nie
  blokuje powierzchni w draw mode; origin shape jest ustalany z
  `event.target.closest`, a pointer capture nie może zgubić znaczenia kliknięcia.
- [x] **Cienie — moduł UI & Visuals, SHADOW-05:** ciemny overlay nadal nie używa
  cienia; FIX2 nie dodaje elevation.
- [x] **Interakcje — GRID-05, BORDER-06, COLOR-07, OPACITY-02, OVERLAY-06:**
  click bez ruchu na shape wybiera dokładnie ten shape i nie rysuje; drag
  rozpoczęty na shape rysuje nakładający bbox; select-mode i obsługa klawiatury
  pozostają zgodne z F3. Deduplikacja click chroni przed podwójnym `onSelect`.
- [x] **Komponenty — katalog `new-component.md` §4–§5:** użyty wyłącznie
  istniejący `RegionOverlay`; nie powstaje common component ani nowe API, więc
  katalog nie wymaga kolejnego rozszerzenia.

## FE-001-F4-FIX2 — wynik i weryfikacja (2026-08-24)

### Pointer capture i deduplikacja selection

`RegionOverlay` zapisuje w stanie gestu `originShapeId`, odczytane z rzeczywistego
targetu pointerdown. Przy pointerup drawable rect nadal wywołuje wyłącznie
`onDraw`; niedrawable rect rozpoczęty na shape jawnie wywołuje dokładnie jedno
`onSelect(originShapeId)` i zero `onDraw`. Ponieważ następujący click może po
pointer capture trafić do SVG albo mimo wszystko do `<g>`, jednorazowy marker w
refie jest konsumowany przez `onClickCapture` powierzchni. Kolejny fizyczny
pointerdown resetuje ewentualny marker, jeżeli browser pominął click. Testy obu
targetów click wymagają dokładnie jednego wyboru; overlapping draw i domyślny
select-mode F3 pozostają zielone. Commit implementacji: `ec1eab6`.

### Retry po `409 version_conflict`

Nowy test ekranu podaje jawne DTO anotacji v3, pierwszy PATCH z
`expected_version: 3`, odpowiedź `409 version_conflict`, a następnie DTO v4 z
centralnego refetchu. Kod 409 pozostaje widoczny. Użytkownik ponownie wybiera
klasę i wysyła drugi realny PATCH z `expected_version: 4`; kolejna odpowiedź v5
kończy mutację. Fixture jest wyłącznie kolejką odpowiedzi/DTO i nie implementuje
reguł backendu. Dotychczasowe success sequences i osobne przypadki 409 pozostały.

### Próby i bramki

Pierwszy targeted run miał 45/46 testów: nowy test błędnie oczekiwał aktywnego
przycisku zapisu natychmiast po refetchu, choć remount wiersza poprawnie resetuje
draft do DTO v4 i wyłącza przycisk do czasu ponownej zmiany. Oczekiwanie zmieniono
na odblokowane pole klasy, po czym test wykonuje rzeczywistą ponowną akcję
użytkownika. Kod produkcyjny nie wymagał korekty z powodu tej próby.

| Bramka | Wynik |
| --- | --- |
| Targeted `RegionOverlay.test.tsx` + oba review suites | 3/3 plików, 46/46 testów |
| `npm run test` | 30/30 plików, 390/390 testów |
| `npm run test -- src/test/architecture.test.ts` | 1/1 plik, 85/85 testów |
| `npm run typecheck` | 0 błędów |
| `npm run build` | 288 modułów; JS 494.17 kB (gzip 151.42 kB), CSS 34.02 kB (gzip 4.99 kB) |
| `npm audit` | 0 podatności |
| `git diff --check` | bez błędów |

Backend, kontrakt API i zależności nie zmieniły się, dlatego zgodnie z FIX2 nie
powtarzano pełnego backendowego pytest. Nie wykryto nowej luki kontraktu ani
odchylenia od zamkniętego zakresu.

---

# FE-001-F5 — Eksport COCO i Gate 3 UI

## Design Plan (przed kodem UI)

Źródła przeczytane przed pisaniem kodu: `frontend/src/styles/tokens.css`
w całości, `.agent/guidelines/new-component.md` w całości (procedura §2.2,
katalog §4 i definicje §5) oraz następujące pełne moduły
`_agent_oriented_guidelines_final_UI_UX_v3.md`:

| Moduł | Zakres ID | Po co w tym tickecie |
|---|---|---|
| Siatka i Odstępy | GRID-00…14, SPACING-01…13 | Dwukolumnowy układ stanu runu i eksportu, 8-punktowe odstępy paneli, wiersze manifestu, hit area akcji i ograniczenie szerokości copy |
| Kolor | COLOR-01…10 | Status eksportu, sukces i błąd, 60/30/10, kontrast tekstu oraz rozróżnienie akcji bez opierania znaczenia wyłącznie na kolorze |
| Obramowanie | BORDER-01…09 | Słabe dzielniki metadanych, mocny fokus, jednostronne akcenty komunikatów i brak dekoracyjnego obramowywania każdej grupy |
| Szerokość Obramowania | BWIDTH-01…14 | 1 px struktury, 2 px fokusu/akcentu/błędu, bez przesunięcia układu |
| Promień Obramowania | RADIUS-01…05 | `radius-lg` paneli, `radius-md` grup metadanych i `radius-pill` istniejących odznak |
| Nakładki | OVERLAY-01…07 | Brak modali i tekstu na obrazie; hover wyłącznie istniejącą warstwą alpha |
| Cienie | SHADOW-01…05 | Ciemny motyw: hierarchię niosą powierzchnie i spacing, nie `box-shadow` |
| Typografia | TYPO-01…21, FONTSIZE-01…11, LHEIGHT-01…14, LSPACE-01…09, PARASPACE-01…06, CASING-01…03 | Nagłówki paneli, wartości manifestu, ścieżka monospace, polskie copy w `Sentence case`, mały `UPPERCASE` tylko w gotowych eyebrow/odznakach |
| Przezroczystość | OPACITY-01…02 | Istniejące hover/pressed `0.8` i disabled `0.2` dla mutacji |

### Wszystkie elementy UI F5

Ekran **Eksporty** (`/exports`, `frontend/src/features/exports/**`):

1. `ExportsScreen` — kompozycja query `GET /dashboard`, opcjonalnego
   `GET /exports/{id}` i `GET /runs/{id}` po rozpoczęciu pracy. Ekran ma jawne,
   rozłączne stany `Loading`, `Empty`, `FatalError` i sukces. Aktywny run
   pochodzi z backendu; nie ma pola do wpisania `run_id`, identyfikatora eksportu
   ani ścieżki filesystemu.
2. `ExportRunPanel` — `Panel` z metadanymi runu jako `DataList`: ID, status,
   wersja CAS, rewizja weryfikacji i liczba ukończonych/zaplanowanych klatek.
   `StatusBadge` opisuje status, a copy wyjaśnia, że eksport obejmuje wyłącznie
   zaakceptowane klatki.
3. Akcja `Button` primary „Uruchom eksport COCO” — wysyła `POST /exports`
   z `run_id` aktywnego runu. W locie ma `loading`, spinner, `aria-busy` i
   natywny `disabled`; nie ma optimistic update. `400 no_accepted_frames` i
   `409 export_running` trafiają do `InlineError` przez centralny słownik.
4. Stan eksportu w `Panel` — `StatusBadge`, ID eksportu, `input_revision` i
   komunikat pollingu. `GET /exports/{id}` jest odpytywany co 2 s wyłącznie dla
   statusu nonterminal; `completed` i `failed` zatrzymują polling.
5. `ExportManifestPanel` — po `completed` pokazuje `schema`, `run_id`,
   `profile_id`, `exported_at`, `input_revision`, relatywne położenie
   `annotations.json` i katalogu obrazów. Dane są semantycznym `DataList`, nie
   surowym JSON-em.
6. Sekcja „Pochodzenie anotacji” — dwa liczniki `OCR` i `manual` z
   `manifest.annotation_sources`. Stałe copy: „To licznik pochodzenia boksów,
   nie ocena trafności OCR.” Nie powstaje procent jakości ani confidence.
7. Ścieżka wyniku — wyłącznie `output_relpath` z API, wyrenderowana jako wartość
   monospace z etykietą „Ścieżka względem workspace”. Nie ma kontrolki edycji,
   kopiowania ścieżki absolutnej ani pola wejściowego.
8. `Notice` immutable snapshot — po `completed` mówi, że wynik jest migawką
   `input_revision`; późniejsze ponowne otwarcie/zmiana klatki nie modyfikuje
   istniejącego eksportu i wymaga jawnego uruchomienia nowego eksportu.
9. Błąd terminalny eksportu — `Notice`/`InlineError` pokazuje `error_code`
   niezależnie od błędu HTTP. Stabilne kody `export_revision_conflict`,
   `export_source_missing`, `export_process_interrupted` korzystają z tego
   samego centralnego polskiego copy; ekran nie utożsamia ich z odpowiedzią
   `POST`.
10. Akcja `Button` secondary „Uruchom nowy eksport” — dostępna jawnie po
    `completed` albo `failed`; tworzy nowe `export_id`, nie nadpisuje istniejącej
    prezentacji ani nie sugeruje eksportu przyrostowego.
11. Akcja `Button` primary „Zamknij run” — pojawia się dopiero dla ukończonego
    eksportu i runu, który backend pozwala zamknąć. Wysyła
    `POST /runs/{id}/complete` z bieżącym `expected_version`; w locie ma własny
    spinner/disabled. Sukces pochodzi z odpowiedzi backendu, po czym centralna
    invalidacja/refetch odświeża run i dashboard. To decyzja użytkownika, nigdy
    automatyczny efekt ukończenia eksportu.
12. Stan zamknięty — `StatusBadge success` i `Notice` potwierdzają terminalny
    `completed`; nie ma dalszej akcji mutującej run.
13. Błędy zamknięcia — `409 version_conflict` i `409 invalid_transition`
    renderują centralne copy z jawnym kodem; zero lokalnego podstawienia statusu.
14. QA/test-only harness — nie dodaje produkcyjnego elementu UI. Playwright
    przechwytuje prawdziwe wywołania jednego typowanego klienta i zwraca jawne,
    wersjonowane fixture DTO dla profilu → materiału → runu → OCR/review →
    eksportu → zamknięcia. Fixture nie implementuje walidacji ani maszyny
    backendu; jest kolejką odpowiedzi i obrazem z repo.

### Checklista wymagana przez `new-component.md` §2.2

- [x] **Layout/Siatka (GRID-01/02/05/08/09/10/11,
  SPACING-01/02/06/09/10/12/13)** — ekran to `grid` z dwoma kolumnami
  `minmax(0, 1fr)` i `gap: var(--size-lg)`; przy 1280 px nie ma poziomego
  overflow. Panele dzieli `--size-lg`, grupy wewnątrz `--size-md`, pary
  etykieta/wartość `--size-sm`/`--size-xs`. Copy ma `--measure-copy`.
  Wszystkie akcje używają gotowego `Button md` (40 px, ponad minimum GRID-05),
  a listy metadanych istniejącego `DataList` z wysokością i paddingiem opartym
  na tokenach.
- [x] **Typografia (TYPO-02/07/08/11, FONTSIZE-02/08/09/10,
  LHEIGHT-09/10/11, LSPACE-02/07/09, PARASPACE-01/02/05/06,
  CASING-02/03)** — maksymalnie cztery rozmiary: `xl` nagłówka trasy z shell,
  `lg` tytułów paneli, `sm` treści/akcji, `xs` metadanych/odznak. Dwie wagi:
  regular/semibold. Relatywna ścieżka i ID używają istniejącego stosu mono,
  nie mniejszego niż 12 px. Copy jest polskim `Sentence case`; gotowe eyebrow
  i `StatusBadge` zachowują jedyne krótkie `UPPERCASE` + `letter-spacing-wide`.
- [x] **Kolory (COLOR-02/07/08/09/10)** — tło/powierzchnie/akcent zachowują
  60/30/10. Running używa tonu brand, completed success, failed error; znaczenie
  zawsze niesie też tekst/status i semantyka, nie sama barwa. Brak surowych
  literałów koloru; nowe pary kontrastu zostaną przypięte testem tylko, jeśli
  nie pokrywają ich istniejące komponenty.
- [x] **Obramowania (BORDER-02/03/05/06/08,
  BWIDTH-02/03/06/10/11/12/13, RADIUS-02/03/05)** — panele i grupy rozdziela
  przestrzeń; istniejący słaby obrys panelu i dzielniki `DataList` zostają bez
  nowego stylu. Fokus i błąd pochodzą z gotowych common components, są rysowane
  do wewnątrz. `radius-lg` panelu, `radius-md` grupy i `radius-pill` odznaki.
- [x] **Cienie (SHADOW-05)** — brak `box-shadow`; w ciemnym motywie poziomy
  powierzchni i spacing komunikują hierarchię.
- [x] **Interakcje (COLOR-07, OPACITY-02, BORDER-06, GRID-05,
  FE-06/07/08)** — każda mutacja ma własny `Button` ze spinnerem,
  `aria-busy`, natywnym disabled i widocznym fokusem; eksport i zamknięcie nie
  mogą wystartować równolegle. Zero optimistic update. Polling kończy się na
  statusie terminalnym. Błędy są `role=alert`; loading `role=status`; panele są
  nazwanymi `<section>`. Przy <1280 px istniejący `WidthGuard` zastępuje shell.
- [x] **Komponenty (katalog §4–§5 `new-component.md`)** — użyte bez zmian:
  `Button` (wszystkie akcje), `UiStates` (`Loading`, `Empty`, `InlineError`,
  `FatalError`), `StatusBadge` (run/eksport), `Panel` (każda sekcja), `Notice`
  (immutable snapshot i pochodzenie), `DataList` (run/manifest/output).
  `TextField`, `SelectField`, `RegionOverlay` i `NavItem` nie są potrzebne na
  ekranie eksportu. Nie powstaje nowy common component, więc katalog pozostaje
  aktualny bez dopisywania definicji.

### Copy, zakres i kontrakt

Teksty są polskie; OCR, COCO, JSON, manifest, manual, run i workspace pozostają
terminami technicznymi. Ekran nie wspomina train/val, YOLO, eksportu
przyrostowego ani automatycznej trafności OCR. `annotation_sources` opisuje
wyłącznie pochodzenie anotacji. Ukończony eksport jest niezmienną migawką;
każdy późniejszy stan wymaga nowego `POST /exports`. Ścieżka jest prezentowana
wyłącznie jako wartość relatywna z backendu. Zamknięcie runu jest osobnym,
jawnym `POST /runs/{id}/complete` z CAS i nigdy nie jest wywoływane przez efekt
ukończenia eksportu.

## FE-001-F5 — wynik i weryfikacja (2026-08-24)

### Dostarczone zachowanie

- `/exports` jest piątą realną trasą produktu. Rozdziela stany dashboardu,
  odczytu eksportu, terminalnego `export.error_code` i mutacji; eksport polling
  działa wyłącznie dla `running` i zatrzymuje się na `completed`/`failed`.
- `POST /exports` i `POST /runs/{id}/complete` przechodzą przez jeden typowany
  klient API oraz centralne query keys/invalidation. Obie mutacje pozostają
  disabled ze spinnerem do odpowiedzi backendu i nie zapisują danych
  optymistycznie. Zamknięcie runu jest wyłącznie jawnym kliknięciem i wysyła
  bieżący `expected_version`.
- Manifest pokazuje wyłącznie bezpieczne ścieżki relatywne; guard blokuje
  ścieżki Windows/UNC/Unix, drive-relative oraz segment `..` także w polach
  `annotations` i `images`. Nie istnieje pole wejściowe ścieżki eksportu.
- `annotation_sources` jest opisane jako pochodzenie OCR/manual, nigdy jako
  trafność. Ukończony wynik ma jawne copy niezmiennego snapshotu i wymaga nowego
  eksportu po późniejszej zmianie. UI nie obiecuje train/val, YOLO ani eksportu
  przyrostowego.
- Stabilne kody `no_accepted_frames`, `export_running`,
  `export_revision_conflict`, `export_source_missing` i
  `export_process_interrupted` mają centralne polskie copy i testy rozdzielające
  błąd koperty HTTP od terminalnego `Export.error_code`.

Commit implementacji: `aa38b04`. Backend i kontrakt TK-009 nie były zmieniane;
zaakceptowane commity `ddc2565` i `d02d379` pozostały bez modyfikacji.

### Playwright i screenshot QA

Test-only harness przechwytuje prawdziwe żądania `/api/v1`, serwuje jawne DTO i
repozytoryjny `backend/tests/fixtures/video/synthetic-frame.png`. Nie duplikuje
walidacji ani implementacji backendu. Pionowy test wykonuje w przeglądarce:
profil i region HUD → import ścieżki fixture video → create/start run → odczyt
OCR stub i akceptację klatki → start/poll eksportu → jawny CAS complete. Na końcu
porównuje request bodies, w tym `expected_version: 1`, review
`expected_version: 7` i complete `expected_version: 4`.

Zrzuty mają viewport 1440 px i są realnym wynikiem tego samego Vite UI oraz
interceptowanego kontraktu:

| Trasa/stan | Artefakt |
| --- | --- |
| Dashboard | `docs/tickets/FE-001/screenshots/dashboard-1440.png` |
| Profil gry | `docs/tickets/FE-001/screenshots/profile-1440.png` |
| Materiały | `docs/tickets/FE-001/screenshots/materials-1440.png` |
| Anotacje | `docs/tickets/FE-001/screenshots/annotations-1440.png` |
| Eksporty, ukończony manifest | `docs/tickets/FE-001/screenshots/exports-1440.png` |
| Loading | `docs/tickets/FE-001/screenshots/loading-1440.png` |
| Empty | `docs/tickets/FE-001/screenshots/empty-1440.png` |
| Error | `docs/tickets/FE-001/screenshots/error-1440.png` |

Wszystkie osiem zrzutów przejrzano wizualnie: nie ma uciętego copy, nakładania,
fałszywych danych ani poziomego overflow. Test przeglądarkowy dodatkowo sprawdza
każdy widok przy 1440 i 1280 px, komplet deklaracji dla użytych `var(--*)`, brak
zewnętrznych requestów fontów oraz widoczny focus po wejściu klawiaturą.
Semantyczne landmarki i akcje klawiaturowe mają osobne asercje Vitest; kontrast
korzysta wyłącznie z istniejących, przypiętych tokenów/common components.

### Done Criteria — Gate 3

| Bramka | Wynik |
| --- | --- |
| Targeted `src/features/exports` | 2/2 pliki, 20/20 testów |
| Pełny `npm test` | 32/32 pliki, 420/420 testów |
| `src/test/architecture.test.ts` | 1/1 plik, 92/92 testy |
| `npm run typecheck` | 0 błędów (wykonane samodzielnie i ponownie w buildzie) |
| `npm run build` | 295 modułów; main JS 495.32 kB gzip 151.82 kB; osobny chunk exports 7.28 kB gzip 2.82 kB; bez warningu rozmiaru |
| `npm audit --audit-level=low` | 0 podatności |
| Playwright `npm run e2e` | 2/2 testy; pionowy flow + 5 tras i loading/empty/error |
| Screenshot/overflow/CSS/font/focus QA | 8/8 widoków, 1440/1280 px, zielone |
| `git diff --check` | bez błędów |

Nowa zależność `@playwright/test@1.62.1` pochodzi z oficjalnego npm, ma licencję
Apache-2.0 i jest przypięta dokładnie w lockfile. Cache npm oraz binarki Chromium,
FFmpeg i Winldd są na `D:\DatasetFactory\cache`; raporty/traces Playwright także
trafiają na `D:` i nie zanieczyszczają repo. Katalog common components nie
wymagał zmiany, bo ekran składa się wyłącznie z istniejących elementów.

### Odchylenia i ryzyka

Nie ma odchylenia produktowego ani rozszerzenia backendu. Pełnego pytest backendu
nie powtarzano zgodnie z zakresem: produkcyjny backend nie został dotknięty, a
TK-009 miał już 289/289 na bazowym HEAD. Jedynym pozostającym ryzykiem środowiska
jest pierwsze pobranie binariów Playwright; przypięta wersja i ścieżka cache na
`D:` ograniczają jego wpływ do stanowiska developerskiego.

---

# FE-001-F5-FIX1 — Design Plan addendum (przed kodem UI)

Cold review: `artifacts/fe-001-f5-tk-009-cold-review/index.md`, verdict
`REVISE`. FIX1 nie tworzy historii eksportów ani nowego wspólnego komponentu.
Zmienia mechanizm trwałego wskazania istniejącego eksportu i dowody browser QA;
zachowuje wygląd, copy, immutability i jawny CAS complete zaakceptowane w F5.

## Elementy UI i zachowanie

1. **Kontrolowany locator w URL:** `/exports?export_id=<id>` jest źródłem
   identyfikatora śledzonego eksportu. Nie powstaje widoczne pole, lista historii
   ani dodatkowa nawigacja. Po `POST /exports` URL zmienia się dopiero po
   odpowiedzi backendu; usunięcie/zmiana query uruchamia nową hydratację.
2. **Hydratacja deep-link/reload:** przy query ekran najpierw pokazuje istniejący
   `Loading`, następnie pobiera `GET /exports/{id}` i dopiero z jego `run_id`
   autorytatywny `GET /runs/{id}`. Running wraca do pollingu; completed/failed
   pozostają terminalne. Obcy/niepoprawny ID daje istniejący named
   `FatalError` z retry, bez fallbacku do dashboard runu i bez POST.
3. **Recovery bez query:** ekran pobiera dashboard run, a potem read-only
   `GET /exports/latest?run_id=…`. `null` prowadzi do istniejącego panelu „Nowy
   eksport COCO”; znaleziony running/completed/failed ustawia kontrolowany query
   i renderuje ten sam status/manifest. Lookup nigdy nie tworzy eksportu.
4. **Istniejące stany i sekcje:** `Loading`, `Empty`, `FatalError`, `RunSummary`,
   panel startu, `ExportStatusPanel`, terminalny `Notice`,
   `ExportManifestPanel`, provenance OCR/manual i immutable snapshot pozostają
   jedynymi elementami ekranu. Query recovery nie dodaje równoległego wariantu
   UI ani lokalnej kopii DTO.
5. **Istniejące akcje:** `Button` „Uruchom eksport COCO”/„Uruchom nowy eksport”
   nadal wykonuje jawny POST bez optimistic update; „Zamknij run” nadal pojawia
   się wyłącznie po completed export i wysyła bieżący CAS. Mutacje zachowują
   spinner, `aria-busy`, natywny disabled i centralne invalidacje.
6. **Ścieżki manifestu:** `safeWorkspaceRelativePath` odrzuci URI schemes
   `http:`, `https:`, `file:`, `data:` i każdy ciąg zgodny z
   `^[A-Za-z][A-Za-z0-9+.-]*:` przed normalizacją. Poprawne relatywne nazwy z
   `..` wewnątrz segmentu (np. `frame..backup`) pozostają dozwolone; osobny
   segment `..` pozostaje blokowany.
7. **Browser focus QA — konkretne checkpointy tras:** Dashboard — przycisk
   „Uruchom” w queued run; Profil — pole „Nazwa profilu”; Materiały — pole
   „Ścieżka pliku wideo”; Anotacje — select „Status weryfikacji”; Eksporty —
   przycisk „Zamknij run” w completed manifest. Każdy target dostaje focus,
   jest `document.activeElement` i ma widoczny focus ring; wspólny skip-link nie
   jest dowodem trasowym.
8. **Screenshot QA:** pięć tras oraz loading/empty/error pozostaje przy 1440 px.
   Eksportowy capture bezpośrednio przed `page.screenshot` ponownie asercyjnie
   sprawdza heading „Wynik eksportu COCO”, status „Ukończony”, relatywną ścieżkę,
   provenance i immutable snapshot. Resize/focus nie może przeładować ani
   zgubić `export_id`.
9. **Test-only runtime:** pionowy Playwright używa produkcyjnych ekranów i HTTP,
   prawdziwego FastAPI/composition root, SQLite/workspace i fixture
   `synthetic-hud.mkv`; jedyny stub to backendowy deterministic `OcrEngine`.
   Lekki route harness pozostaje wyłącznie dla visual/query-state QA i nie jest
   nazywany pionowym E2E.

## Moduły UI/UX, tokeny i ID

| Moduł | ID i zastosowanie FIX1 |
| --- | --- |
| Siatka i odstępy | GRID-00–14, SPACING-01–13: istniejący desktop canvas 1280/1440, `minmax(0,1fr)`, tokenowe gap/padding, brak overflow i stabilny layout przy hydratacji/resize |
| Kolor | COLOR-01–10: istniejące semantic status tones, 60/30/10, kontrast i brak nowej pary kolorów |
| Obramowanie / szerokość | BORDER-01–09, BWIDTH-01–14: istniejące weak structure i strong route-specific focus ring bez layout shift |
| Promień | RADIUS-01–05: bez zmian — istniejące `radius-lg/md/pill`, żadnej arbitralnej geometrii |
| Nakładki | OVERLAY-01–07: brak modala/overlay; fixture obrazów nadal używa istniejącego `RegionOverlay` bez niewidzialnej blokady |
| Cienie | SHADOW-01–05: brak nowego elevation w ciemnym shellu |
| Typografia | TYPO-01–21, FONTSIZE-01–11, LHEIGHT-01–14, LSPACE-01–09, PARASPACE-01–06, CASING-01–03: istniejące polskie Sentence case, mono tylko dla ID/relpath, UPPERCASE tylko gotowych eyebrow/badge |
| Przezroczystość | OPACITY-01–02: istniejące hover/pressed 0.8 i disabled 0.2; żadnej nowej wartości |
| Architektura frontend | FE-02/03/04/06/07/08/10: stan serwera nie jest kopiowany lokalnie; deep-link żyje w URL; jawne query states; desktop ≥1280; semantyka/klawiatura/focus; krytyczny real-backend E2E |
| NFR | NFR-08/10: testowy bootstrap tylko przez konfigurację; jedna plain komenda E2E; browser/report/cache automatycznie na `D:` lub `DATASETFACTORY_CACHE_ROOT` |

## Checklista `new-component.md` §2.2

- [x] **Layout/Siatka:** bez nowych wartości CSS. URL hydration używa tych
  samych `Panel` i `DataList`, więc zachowuje GRID-01/02/08/09/10/11 oraz
  SPACING-01/02/06/09/10/12/13.
- [x] **Typografia:** brak nowego widocznego copy poza istniejącymi stanami;
  pozostają tokeny sans/ui/mono, `xs/sm/lg/xl`, tight/standard i Sentence case.
- [x] **Kolory:** brak nowego koloru; running/completed/failed nadal brand /
  success / error z tekstem i semantyką, nie tylko barwą.
- [x] **Obramowania:** route-specific QA przypina istniejący strong 2 px
  `focus-visible`; panele/dzielniki zachowują weak 1 px i border-box.
- [x] **Cienie:** brak zmian i brak nowego cienia.
- [x] **Interakcje:** URL zmienia się dopiero po backend success; recovery nie
  wysyła POST; retry/refetch, polling terminal stop, disabled+spinner i brak
  optimistic update pozostają jawne.
- [x] **Komponenty/common catalog:** użyte bez zmian `Button`, `UiStates`,
  `NavItem`, `StatusBadge`, `Panel`, `Notice`, `DataList`; `TextField`,
  `SelectField` i `RegionOverlay` występują tylko jako istniejące checkpointy
  pozostałych tras. Nie powstaje common component, więc katalog pozostaje
  aktualny.

## FE-001-F5-FIX1 — wynik i Gate 3 (2026-08-24)

Ta sekcja zastępuje opis dowodów z pierwotnego F5 w zakresie trwałego locatora
i pionowego E2E. Izolowany `ApiHarness` pozostał wyłącznie narzędziem visual QA;
nie jest dowodem pionowego przepływu.

### Zamknięte findings

- **F1 — durable recovery:** `/exports?export_id=` jest kontrolowanym źródłem
  identyfikatora. Deep-link najpierw pobiera `GET /exports/{id}`, następnie run
  z `Export.run_id`; dashboard nie jest wtedy odpytywany. Bez query ekran używa
  dashboard runu i `GET /exports/latest?run_id=`, gdzie repozytorium wybiera
  `created_at DESC, id DESC`. Znaleziony rekord utrwala się w URL, `null`
  pozostawia jawny start state. Recovery nigdy nie wysyła `POST /exports`.
- **F2 — real vertical E2E:** `backend/tests/e2e_server.py` buduje rzeczywisty
  composition root, migracje/SQLite i workspace na `D:`, realny ffprobe/FFmpeg
  znaleziony na `PATH` oraz jedyny backendowy stub na granicy `OcrEngine`.
  `vertical-flow.spec.ts` nie interceptuje tras. Przechodzi ekranami profil →
  repo `synthetic-hud.mkv` → create/start → frontendowy polling runu i odświeżenie
  szczegółu klatki po terminalnym statusie → review → export polling → fizyczny
  `manifest.json` → jawny CAS complete. Obserwacja request body jest dodatkową
  asercją, nie źródłem stanu.
- **F3 — confinement i reprodukowalność:** ścieżki odrzucają każdy URI scheme
  zgodny z `^[A-Za-z][A-Za-z0-9+.-]*:` przed zamianą separatorów, w tym `http`,
  `https`, `file` i `data`; osobny segment `..` pozostaje blokowany. Repozytoryjny
  launcher Node ustawia `PLAYWRIGHT_BROWSERS_PATH`, runtime, raport i traces na
  `D:\DatasetFactory\cache` (albo kontrolowany `DATASETFACTORY_CACHE_ROOT`) dla
  zwykłych `npm run e2e` i `npm run e2e:install`, bez nowej zależności.

### Gate 3 UI i screenshot QA

Osiem PNG 1440 zostało zregenerowanych przez finalny plain `npm run e2e` i
obejrzanych wizualnie. Nie ma ucięć, nakładania, poziomego overflow ani fałszywego
stanu eksportu. `exports-1440.png` bezpośrednio przed capture potwierdza URL
`export_id`, completed manifest, `exports/export-1` oraz region provenance.

Route-specific focus checkpointy wykonane przez Tab do konkretnego targetu:

| Trasa | Kontrolka |
| --- | --- |
| Dashboard | `Uruchom` w queued run |
| Profil | `Nazwa profilu` |
| Materiały | `Ścieżka pliku wideo` |
| Anotacje | `Status weryfikacji` |
| Eksporty | `Zamknij run` po completed manifest |

Każdy target jest `document.activeElement` i ma widoczny outline/box-shadow.
Ten sam test sprawdza 1440 i 1280 px, komplet deklaracji użytych `var(--*)` oraz
brak zewnętrznych requestów fontów. Loading/empty/error mają osobne capture.
Common catalog pozostaje aktualny: użyto istniejących komponentów i nie dodano
nowego common component. `TECH_DEBT.md` ma konkretne `Gdzie` dla TD-007
(`DashboardScreen.tsx`), TD-010 (`tokens.css`) i TD-013 (common a11y,
`RegionOverlay`, anotacje oraz `ExportsScreen`).

### Końcowe bramki

| Bramka | Wynik |
| --- | --- |
| Backend full pytest | **290/290 passed**, 1825.15 s |
| Backend Ruff | bez uwag |
| Backend mypy strict | bez uwag, 95 plików |
| Frontend full Vitest | **32/32 pliki, 432/432 testy** |
| Architecture test | **92/92** |
| TypeScript | `tsc --noEmit`, 0 błędów |
| Build | 295 modułów; exports JS 8.37 kB / gzip 3.12 kB; main JS 496.48 kB / gzip 152.23 kB |
| Audit | `npm audit --audit-level=low`: 0 podatności |
| Plain Playwright | **2/2**: real vertical + visual QA |
| Screenshot/CSS/font/overflow/focus | **8/8**, 1440/1280, zielone i obejrzane |

Targeted regresje dodatkowo przypinają: route ordering/latest tie-break i `null`,
reload running/completed, latest/no-latest/invalid/foreign ID, brak recovery POST,
terminal stop pollingu, HTTP error kontra `Export.error_code`, brak optimistic
update, URI schemes, CAS complete i dostępność akcji.

### Odchylenia i ryzyka

Brak odchylenia produktowego: nie dodano historii eksportów, train/val, YOLO,
eksportu przyrostowego ani automatycznego complete. Testowy bootstrap nie trafia
do runtime aplikacji. Realny E2E wymaga `ffmpeg` i `ffprobe` na `PATH`; launcher
kończy się jawnym błędem, jeśli narzędzi brakuje. Browser binaria muszą być raz
zainstalowane przez `npm run e2e:install`, ale cache i wszystkie ciężkie artefakty
pozostają na `D:`.

---

# FE-001-F5-FIX2 — Design Plan addendum (przed kodem UI)

Źródła: `docs/tickets/FE-001/FE-001-F5-FIX2.md` oraz
`artifacts/fe-001-f5-fix1-independent-rereview/index.md` (`REVISE`). FIX2 nie
zmienia durable locatora, COCO, product copy ani wyglądu ekranu. Naprawia
zachowanie istniejącego edytora przy zmianie statusu runu oraz wiarygodność i
bezpieczeństwo testowego Gate 3.

## Elementy UI, stan i interakcje

1. **Ekran weryfikacji:** istniejące `SelectField` filtra, `FrameList` oraz
   `FrameEditor` zachowują obecny layout. Polling query runu nadal działa co 2 s
   wyłącznie dla statusów aktywnych i zatrzymuje się terminalnie.
2. **Autorytatywne odświeżenie:** tylko faktyczne przejście z non-terminalnego
   statusu (`running`) do terminalnego (`review_ready`/`completed`/`failed`/
   `cancelled`) wywołuje po jednym refetchu listy klatek i aktywnego query
   szczegółu zaznaczonej klatki. Wejście od razu na status terminalny oraz kolejne
   rendery tego samego statusu nie wywołują dodatkowego refetchu ani pętli.
3. **Stan lokalny `FrameEditor`:** identyfikator wybranej anotacji, tryb redraw,
   szkic nowego bbox (`Nowy x/y/width/height`), wybrana klasa, błędy formularza i
   stan obrazu pozostają zamontowane przy zmianie statusu runu. `FrameEditor` jest
   kluczowany wyłącznie tożsamością aktywnej klatki.
4. **Dirty draft istniejącej anotacji:** `AnnotationList` i pola `Klasa`, `x`,
   `y`, `width`, `height` zachowują niezapisane wartości przy autorytatywnym
   refetchu. Stabilna tożsamość wiersza opiera się na `annotation.id`, nie wersji;
   dane serwera (nagłówek geometrii, wersje CAS, nowe anotacje i status klatki)
   nadal pochodzą z aktualnego DTO. FIX2 nie wprowadza optimistic update.
5. **Selection i redraw:** `RegionOverlay` nadal niesie `aria-selected`, a tekstowa
   lista nadal daje pełną obsługę klawiatury. Wybrany bbox i jawny tryb
   „Narysuj nową geometrię” nie są resetowane przez polling/refetch; zmienia je
   dopiero akcja użytkownika albo istniejący sukces mutacji.
6. **Query states i mutacje:** istniejące `Loading`, `Empty`, `FatalError`,
   `InlineError`, `Notice`, disabled+spinner oraz centralne invalidacje pozostają
   bez zmian. Refetch terminalny jest read-only i nie wykonuje POST/PATCH.
7. **Screenshot QA:** osiem istniejących widoków (pięć tras oraz
   loading/empty/error) pozostaje w 1440 px. Przed każdym capture Playwright
   wyłącza animacje CSS, transition i caret, więc faza spinnera nie wpływa na PNG;
   dwa kolejne przebiegi muszą mieć identyczne SHA-256 wszystkich ośmiu plików.
8. **Test-only runtime:** launcher tworzy unikalny leaf pod zweryfikowanym
   `<DATASETFACTORY_CACHE_ROOT>/playwright/`, zapisuje marker własności i dopiero
   ten leaf przekazuje backendowi. Bootstrap akceptuje wyłącznie istniejący,
   bezpośredni, markerowany leaf i sam niczego rekurencyjnie nie usuwa. Cleanup
   launchera dotyka wyłącznie utworzonego przez niego leaf. Jawny custom cache
   może leżeć na innym wolumenie; domyślna ścieżka pozostaje na `D:`.
9. **Granica backendu E2E:** realne pozostają composition root, health/resource
   probe, FastAPI, migracje, SQLite/workspace, FFmpeg/ffprobe i COCO. Jedynym
   stubem jest deterministyczny backendowy `OcrEngine`.

## Moduły UI/UX, tokeny i ID

| Moduł | ID i zastosowanie FIX2 |
| --- | --- |
| Siatka i odstępy | GRID-00–14, SPACING-01–13: brak zmian layoutu; istniejący desktop 1280/1440, tokenowe gap/padding, hit areas i brak overflow pozostają wymaganiem screenshot QA |
| Kolor i interakcje | COLOR-01–10, OPACITY-01/02: brak nowej pary kolorów; istniejące semantyczne statusy, disabled i focus zachowują kontrast; zamrożenie animacji jest wyłącznie testowe |
| Obramowania i focus | BORDER-01–09, BWIDTH-01–14: istniejące strong focus ring i weak structure bez layout shift; refetch nie zmienia fokusu ani struktury DOM aktywnej klatki |
| Promień i warstwy | RADIUS-01–05, OVERLAY-01–07: bez zmian geometrii; istniejący `RegionOverlay` zachowuje stabilny DOM, selection i redraw, bez niewidzialnej blokady |
| Cienie | SHADOW-01–05: brak nowego elevation; screenshoty zamrażają ruch, nie zmieniają runtime tokenów |
| Typografia | TYPO-01–21, FONTSIZE-01–11, LHEIGHT-01–14, LSPACE-01–09, PARASPACE-01–06, CASING-01–03: brak nowego copy i typografii; zachowany polski Sentence case oraz aktualna hierarchia pól/statusów |
| Architektura frontend | FE-02/03/06/08/10: dirty draft pozostaje lokalny, DTO pozostaje server state w TanStack Query, jawne stany UI, klawiatura/focus i regresja krytycznego polling flow |
| NFR i E2E | NFR-08/10, FE-10: testowy bootstrap konfigurowalny i ograniczony markerem; zwykłe `npm run e2e` uruchamia realny vertical flow oraz deterministyczny visual QA |

## Checklista `new-component.md` §2.2

- [x] **Layout/Siatka:** bez zmian CSS i arbitralnych wartości; istniejący
  workspace `Panel` + lista + edytor zachowuje GRID-01/02/08/12 oraz
  SPACING-01/02/06/11.
- [x] **Typografia:** brak nowego tekstu użytkowego; pozostają tokeny
  `xs/sm/md/lg`, regular/semibold oraz tight/standard.
- [x] **Kolory:** brak nowego koloru; statusy i błędy nadal mają semantyczne
  tokeny oraz opis tekstowy, nie tylko barwę.
- [x] **Obramowania:** brak zmian; focus-visible i zaznaczenie pozostają widoczne
  po refetchu bez remountu.
- [x] **Cienie:** brak zmian runtime i brak nowego cienia.
- [x] **Interakcje:** jednorazowy terminalny refetch listy + aktywnej klatki;
  dirty draft, selection i redraw pozostają; brak optimistic update i refetch
  storm.
- [x] **Komponenty/common catalog:** bez zmian użyte są `Panel`, `SelectField`,
  `RegionOverlay`, `TextField`, `Button`, `StatusBadge`, `Notice`, `DataList` i
  `UiStates`; feature components to `FrameList`, `FrameEditor` i
  `AnnotationList`. Nie powstaje common component, więc katalog pozostaje
  aktualny.

## FE-001-F5-FIX2 — wynik i Gate 3 (2026-08-25)

Ta sekcja zastępuje dowody FIX1 wyłącznie w zakresie terminalnego odświeżenia
anotacji, confinement runtime E2E i deterministyczności PNG. Durable locator,
COCO, TK-009 oraz product copy nie zostały zmienione.

### Zamknięte findings

- **F1 — dirty state bez remountu:** `FrameEditor` jest kluczowany wyłącznie ID
  aktywnej klatki, a `AnnotationRow` wyłącznie ID anotacji. Przejście
  non-terminal → terminal wykonuje jeden autorytatywny refetch listy oraz jeden
  refetch aktywnego query klatki przez TanStack Query. Wejście od razu na status
  terminalny i kolejny refetch tego samego statusu nie uruchamiają dodatkowej
  pary requestów. Regresja `running → review_ready` potwierdza jednocześnie nowe
  dane/nową anotację z serwera i zachowanie dirty `x`, szkicu `Nowy x`, selection
  oraz redraw mode; nie ma optimistic update ani refetch storm.
- **F2 — markerowany runtime leaf:** `playwright.mjs` zawsze tworzy przez
  `mkdtemp` unikalny `runtime-*` bezpośrednio pod
  `<DATASETFACTORY_CACHE_ROOT>/playwright`, zapisuje nieprzewidywalny marker i
  przekazuje token backendowi. Bootstrap akceptuje tylko istniejący, niesymlinkowy
  leaf z pasującym markerem i nie wykonuje `rmtree`. `finally` launchera usuwa
  wyłącznie leaf, którego marker nadal dowodzi jego własności; obcy katalog bez
  markera pozostaje nietknięty. `D:\playwright` jest odrzucany, a custom cache na
  innym wolumenie jest akceptowany. Domyślna ścieżka nadal jest na D:.
- **F2 — jedna granica testowa:** usunięto `AvailableE2eResourceProbe`.
  Composition root używa prawdziwego `SystemResourceProbe`; FastAPI, health,
  migracje, SQLite/workspace, FFmpeg/ffprobe, worker, repozytoria, COCO i CAS są
  realne. Jedynym stubem backendowym pozostaje `DeterministicE2eOcrEngine`.
- **F3 — deterministyczny capture:** test ustawia reduced motion, wyłącza CSS
  animation/transition/caret/smooth scroll, a po prawdziwej asercji
  `activeElement` i focus-visible przypina do targetu te same tokeny focus ring.
  Chromium działa z wyłączonym GPU/LCD text/hinting. Minimalny normalizer PNG
  dekoduje piksele Chromium, zapisuje stały filtr scanline i stałe parametry zlib;
  nie zmienia pikseli i nie wymaga nowej zależności.
- **F3 — EOF/diff:** blank EOF FIX1 został usunięty w pierwszym commicie FIX2;
  `git diff --check 178bd68..HEAD` jest zielony.

### Deterministyczne screenshoty

Dwa kolejne plain `npm run e2e -- visual-qa.spec.ts`, bez zmiany kodu pomiędzy
nimi, przeszły 1/1 i pozostawiły pusty `git status`. Osiem SHA-256 było identyczne
w obu przebiegach:

| PNG | SHA-256 |
| --- | --- |
| `annotations-1440.png` | `973CC93CBF0C3726EB9D030E4F17062615F307E72284708F22FD5C20D7BB95E6` |
| `dashboard-1440.png` | `429B9999EC458EF52DEF19837413CB05B9153DEC93427DE67CE13DF1E1009392` |
| `empty-1440.png` | `8F1672303579D1AF489A5E069206985195E33804F6E437713157AACE5EB36DA5` |
| `error-1440.png` | `885273365102EEB2E87DEFC71119FB3F2491844D90FCF701858C6C1B2B5A4835` |
| `exports-1440.png` | `8B884A9FA5341021D9E99DB054B6E4379A4C2F96EEC581EEF65D0964243AAFB6` |
| `loading-1440.png` | `A0A06CC068568015BA85E1688C8180883E11935B0C2A295AD0CB656D98039728` |
| `materials-1440.png` | `0A1B50320376BC128A3CB9866828844FE730AB114AC63C2761FFF22A0F3E0A84` |
| `profile-1440.png` | `A9CC0A5D169FBE548A152F86875220C06D356C829C0FD77F4C7074A71042EB74` |

---

# FE-001-F5-FIX4 — Design Plan addendum (przed kodem UI)

Źródła: `docs/tickets/FE-001/FE-001-F5-FIX4.md` oraz
`artifacts/fe-001-f5-fix3-independent-rereview/index.md` (`REVISE`). FIX4 nie
zmienia produktu, copy ani produkcyjnych stylów. Domyka wyłącznie wiarygodność
dowodu focus-visible w harnessie screenshotowym oraz prawdziwość istniejącego
alarmu geometrii po synchronizacji formularza z serwerem.

## Elementy UI, layout i polskie copy

1. **Osiem checkpointów screenshot QA:** dashboard (`Button` „Uruchom”), profil
   (`TextField` „Nazwa profilu”), materiały (`TextField` „Ścieżka pliku wideo”),
   anotacje (`SelectField` „Status weryfikacji”), eksport (`Button` „Zamknij
   run”), loading/empty (aktywny `NavItem` „Dashboard”) oraz error (`Button`
   „Spróbuj ponownie”). Trasy, ich layout 1440 px, query states i zawartość PNG
   pozostają bez zmian.
2. **Focus evidence:** testowy arkusz motion-free przypina tokenowy ring regułą
   CSS opartą na stabilnym selektorze ID/ścieżki DOM checkpointu, a nie atrybutem
   dopisywanym do węzła React. Bezpośrednio po route-specific `beforeScreenshot` i przed zapisem PNG
   harness sprawdza, że dokładnie wskazany checkpoint jest `activeElement` oraz
   ma widoczny, nieprzezroczysty outline. Utrata focusu albo ringu kończy test
   czytelnym błędem; nie powstaje fałszywie zielony screenshot.
3. **Wiersz anotacji:** istniejące cztery `TextField` `x`/`y`/`width`/`height`,
   komunikat `geometryError`, `Button` „Zapisz geometrię”, badge źródła/statusu
   i `RegionOverlay` pozostają w tym samym układzie. Dirty `width=""` zachowuje
   widoczną wartość przy refetchu, czyste `y` przyjmuje baseline serwera, a alarm
   pozostaje, dopóki cały widoczny draft nie przejdzie walidacji względem klatki.
4. **Copy:** brak nowego tekstu produktowego. Istniejące polskie Sentence case i
   komunikaty walidacji pozostają bez zmian; nowe komunikaty są wyłącznie
   diagnostyką testu i nazywają utracony focus lub niewidoczny ring.

## Interakcje i model stanu

1. Klawiatura nadal dociera do każdego route-specific checkpointu przez `Tab`.
   Harness nie przejmuje focusu, nie dodaje atrybutu do kontrolki i nie zmienia
   produkcyjnego `:focus-visible`; jedynie stabilizuje dowód w testowym arkuszu.
2. Re-render pomiędzy pierwszą asercją a screenshotem może odświeżyć kontrolkę,
   ale reguła nadal trafia w jej stabilne ID albo pozycję DOM. Końcowy guard wykonuje się po
   `beforeScreenshot`; dopiero jego sukces zezwala na `page.screenshot`.
3. `syncAnnotationFormState` nadal synchronizuje baseline per pole. Gdy istnieje
   `geometryError`, wynikowy `nextDraft` jest ponownie parsowany względem
   `frameSize`: poprawny draft czyści alarm, a pusty, nieparsowalny, niedodatni
   lub wychodzący poza klatkę draft zachowuje aktualny alarm walidacji.
4. Zapis geometrii nadal wysyła dokładnie wartości widoczne w kontrolkach i
   najnowszy CAS; brak optimistic update, remountu przez `version` i nowych
   requestów.

## Moduły UI/UX, tokeny i ID

| Moduł | ID i zastosowanie FIX4 |
| --- | --- |
| Siatka i odstępy | GRID-00–14, SPACING-01–13: brak zmian CSS/layoutu; desktop ≥1280, istniejące wysokości kontrolek, short fields, gap i brak overflow pozostają bez zmian |
| Kolor i kontrast | COLOR-01–10, OPACITY-01/02: testowy ring korzysta z istniejącego `--color-fill-brand-impeccable`; guard odrzuca brak widocznego/nieprzezroczystego obrysu, bez nowych kolorów i zmian kontrastu produktu |
| Obramowanie i focus | BORDER-01–03/05–09, BWIDTH-01–14: Stroke-Strong, `--focus-ring-width` i `--focus-ring-offset`; reguła stabilnego selektora przeżywa re-render, a stan błędu pozostaje semantyczny i widoczny |
| Promień, overlay, cienie | RADIUS-01–05, OVERLAY-01–07, SHADOW-01–05: brak zmian produkcyjnych; istniejące `radius-md`, `RegionOverlay` i elevation pozostają bez zmian |
| Typografia | TYPO-01–21, FONTSIZE-01–11, LHEIGHT-01–14, LSPACE-01–09, PARASPACE-01–06, CASING-01–03: brak nowego copy/skali; istniejące etykiety i alert zachowują czytelność oraz Sentence case |
| Architektura frontend | FE-02/03/05/06/08/10: lokalny per-field draft, TanStack Query jako server state, walidacja całej geometrii, semantyczny `role="alert"`, klawiatura i regresje Testing Library/Playwright |

## Komponenty i common catalog IDs

- `Button`, `TextField`, `SelectField`, `StatusBadge`, `UiStates`, `Panel`,
  `NavItem` i `RegionOverlay` pozostają jedynymi wspólnymi prymitywami używanymi
  przez opisane ekrany, zgodnie z `new-component.md` §4–5.
- Feature components pozostają `AnnotationReviewScreen`, `FrameEditor`,
  `AnnotationList`/`AnnotationRow` i pięć istniejących ekranów tras.
- Nie powstaje nowy common component, token ani produkcyjny styl; katalog common
  pozostaje aktualny.

## Checklista `new-component.md` §2.2

- [x] **Layout/Siatka:** zero zmian układu i arbitralnych wartości; zachowane
  GRID-01/02/05/08/10/12 oraz SPACING-01/03/04/08/13.
- [x] **Typografia:** zero nowego copy produktu; zachowane istniejące tokeny
  rozmiaru, wagi, wysokości linii i Sentence case.
- [x] **Kolory:** wyłącznie istniejący token marki dla testowego ring evidence;
  produkcyjne pary kolorów i status error bez zmian.
- [x] **Obramowania:** testowy outline korzysta z istniejącej szerokości, offsetu
  i koloru; nie zmienia box modelu ani produkcyjnego focus-visible.
- [x] **Cienie:** brak zmian i brak nowego elevation.
- [x] **Interakcje:** route-specific focus po klawiaturze, końcowa asercja focusu
  i ringu, negatywny test utraty focusu; alarm geometrii znika tylko po realnej
  walidacji całego widocznego draftu.
- [x] **Komponenty/common catalog:** wyłącznie istniejący katalog; brak nowego
  elementu interaktywnego i brak aktualizacji §4–5.

Wszystkie osiem obejrzano po finalnej rasteryzacji. Nie ma ucięć, nakładania,
artefaktów kodowania ani fałszywych stanów. Focus jest widoczny na dokładnych
checkpointach pięciu tras. `exports-1440.png` nadal pokazuje ukończony manifest,
`exports/export-1`, provenance OCR/manual i komunikat niezmiennego snapshotu.
Test nadal sprawdza overflow 1440/1280, unresolved CSS variables i zewnętrzne
font fetches.

### Końcowe bramki

| Bramka | Wynik |
| --- | --- |
| Targeted annotations | **4/4 pliki, 33/33 testy**; nowa regresja terminal refresh **1/1** |
| Node runtime ownership | **2/2** |
| Backend runtime-root safety | **3/3**, 0.51 s |
| Frontend full Vitest | **33/33 pliki, 433/433 testy** |
| Architecture | **92/92** |
| TypeScript | `tsc --noEmit`, 0 błędów |
| Build | 295 modułów; exports JS 8.37 kB / gzip 3.12 kB; main JS 496.67 kB / gzip 152.29 kB |
| Audit | `npm audit --audit-level=low`: 0 podatności |
| Backend Ruff | cały `backend`, bez uwag |
| Backend mypy strict | skonfigurowane `backend/app` + `backend/tests`: **96 plików**, bez uwag |
| Plain vertical Playwright | **1/1**, 22.9 s; real FastAPI/SQLite/FFmpeg/COCO/CAS, migracje 0001→0005 |
| Plain visual Playwright ×2 | **1/1 + 1/1**, identyczne 8/8 SHA-256, pusty status po obu |
| Backend full pytest | odziedziczone **290/290** z FIX1; produkcyjny backend nie został zmieniony |

Pierwsza próba pełnego Vitest wykryła, że Node `*.test.mjs` był zbierany także
przez Vitest mimo poprawnego wykonania przez `node:test`; plik przemianowano na
`*.node.mjs`, po czym pełna bramka przeszła 433/433. Ręczne
`mypy --strict backend` objęło trzy migracje Alembic poza zakresem `files` z
`pyproject.toml` i pokazało ich istniejące braki adnotacji. Właściwa repozytoryjna
bramka `python -m mypy` przeszła 96 plików. Migracji nie zmieniano w ramach FIX2.

### Commity, odchylenia i ryzyka

Commity FIX2: `e2c1cf5` (ticket/status), `fcba45f` (Design Plan), `e90bf88`
(dirty-safe refresh), `18b5e46` (runtime confinement), `7d9f879`, `bc06d4b`,
`4a4dcd0`, `063b160` (deterministyczny visual proof) oraz `83d41f0` (izolacja
Node suite). TK-009 `ddc2565`/`d02d379` i cała historia FIX1 pozostały bez zmian.

Brak odchylenia produktowego i brak nowych zależności. Test-only
`Settings.model_copy` pozwala umieścić markerowany runtime pod jawnym custom
cache na innym wolumenie bez osłabiania produkcyjnego walidatora D:. Ryzyka
środowiskowe pozostają jawne: `ffmpeg` i `ffprobe` muszą być na `PATH`, browser
musi być raz zainstalowany w cache, a realny resource probe może uczciwie
raportować brak opcjonalnego Tesseract/GPU bez blokowania operacyjnego health.

---

# FE-001-F5-FIX3 — Design Plan addendum (przed kodem UI)

Źródła: `docs/tickets/FE-001/FE-001-F5-FIX3.md` oraz
`artifacts/fe-001-f5-fix2-independent-acceptance-review/index.md` (`REVISE`).
FIX3 nie zmienia wyglądu, copy, kontraktu API ani przepływu eksportu. Naprawia
wyłącznie relację między aktualnym server state a lokalnym formularzem anotacji
oraz wiąże detekcję terminalnego przejścia z tożsamością runu.

## Elementy UI, layout i polskie copy

1. **Trasa weryfikacji `/annotations/:runId`:** istniejące `Panel`, filtr
   `SelectField` „Status weryfikacji”, `FrameList`, `FrameEditor`, query states
   `Loading`/`Empty`/`FatalError` i desktopowy układ lista + edytor pozostają bez
   zmian. Zmiana `runId` nie zmienia struktury ekranu ani nie tworzy dodatkowego
   komunikatu.
2. **Wiersz anotacji:** zachowane są nagłówek klasy i geometrii, badge źródła
   OCR/manual, confidence i „Niepoprawny bbox”, `SelectField` „Klasa”, przycisk
   „Zapisz klasę”, cztery `TextField` `x`/`y`/`width`/`height`, komunikat
   `geometryError` oraz akcje „Zaznacz”, „Zapisz geometrię”, „Narysuj nową
   geometrię” i „Usuń”. Klucz React pozostaje `annotation.id`; żadna kontrolka
   ani aktywny fokus nie jest resetowany przez remount zależny od `version`.
3. **Overlay i stan edytora:** `RegionOverlay`, selection, redraw oraz pola
   szkicu nowego bboxa (`Nowy x/y/width/height`) pozostają zamontowane przy
   autorytatywnym refetchu. FIX3 nie zmienia współrzędnych overlay, klawiatury,
   roving tabindex ani hit-targetów.
4. **Copy:** nie powstaje nowy tekst użytkowy. Obowiązuje dotychczasowe polskie
   Sentence case, w tym istniejące komunikaty walidacji i przyciski zapisu.

## Model stanu i interakcje

1. **Baseline per pole:** `x`, `y`, `width`, `height` oraz `categoryId` mają
   niezależny aktualny baseline z DTO serwera. Dirty jest właściwością pola:
   widoczny draft różny od baseline jest dirty; równy baseline jest czysty.
2. **Synchronizacja refetchu:** po nowym DTO każde czyste pole przejmuje nową
   wartość serwera, a każde dirty zachowuje wartość widoczną użytkownikowi.
   Baseline zawsze przesuwa się do najnowszego DTO, dzięki czemu ręczne cofnięcie
   kontrolki do aktualnego baseline natychmiast przywraca jej podążanie za
   kolejnymi refetchami. Dirty `x` nie zamraża `y`, rozmiarów ani klasy.
3. **Payload i CAS:** „Zapisz geometrię” parsuje dokładnie cztery wartości
   widoczne w kontrolkach i przekazuje najnowszy obiekt anotacji jako źródło
   `expected_version`; „Zapisz klasę” wysyła dokładnie widoczny `categoryId`.
   Brak optimistic update i brak ukrytej starej wartości.
4. **Błąd geometrii:** zwykła edycja pola nadal czyści `geometryError`. Gdy
   synchronizacja baseline zmienia przynajmniej jedną widoczną kontrolkę
   geometrii, stary alarm jest czyszczony, aby nie opisywał wartości, której
   użytkownik już nie widzi. Dirty geometria zachowana bez zmiany widoku nie
   traci własnego aktualnego alarmu.
5. **Terminalny refetch per run:** ref poprzedniego statusu przechowuje parę
   `{runId, status}`. Tylko non-terminal → terminal dla tego samego `runId`
   wykonuje po jednym refetchu listy i aktywnej klatki. Pierwszy render
   terminalnego runu oraz przejście z running runu A do zcache'owanego
   terminalnego runu B nie wywołują dodatkowej pary requestów.
6. **Mutacje i dostępność:** istniejące `Button`, `TextField` i `SelectField`
   zachowują natywne disabled, spinner/`aria-busy`, etykiety, komunikaty błędów,
   focus-visible i pełną obsługę klawiatury. Nie powstaje nowa akcja ani stan
   pośredni.

## Moduły UI/UX, tokeny i ID

| Moduł | ID i zastosowanie FIX3 |
| --- | --- |
| Siatka i odstępy | GRID-00–14, SPACING-01–13: brak zmian CSS/layoutu; istniejące tokenowe gap/padding, krótkie pola geometrii, desktop ≥1280 i brak overflow pozostają bez zmian |
| Kolor i interakcje | COLOR-01–10, OPACITY-01/02: brak nowych kolorów; semantyczny error, disabled 0.2, hover/pressed 0.8 i kontrast istniejących kontrolek pozostają bez zmian |
| Obramowania i focus | BORDER-01–09, BWIDTH-01–14: istniejące strong border/focus dla pól i przycisków oraz weak structure; synchronizacja stanu nie może zgubić fokusu ani powodować layout shift |
| Promień i overlay | RADIUS-01–05, OVERLAY-01–07: istniejące `radius-md` pól i `RegionOverlay`; bez remountu, nowych warstw i niewidzialnych blokad |
| Cienie | SHADOW-01–05: brak zmian i brak nowego elevation w ciemnym motywie |
| Typografia | TYPO-01–21, FONTSIZE-01–11, LHEIGHT-01–14, LSPACE-01–09, PARASPACE-01–06, CASING-01–03: brak nowego copy/skali; polski Sentence case, czytelne etykiety i tekst błędu pozostają istniejące |
| Architektura frontend | FE-02/03/05/06/08/10: lokalne drafty wyłącznie dla edycji, TanStack Query jako server state, per-field walidacja i jawne stany, semantyka/klawiatura oraz cztery regresje krytycznej synchronizacji |

## Komponenty i common catalog IDs

- `Panel`, `SelectField`, `TextField`, `Button`, `StatusBadge`, `UiStates` oraz
  `RegionOverlay` są używane bez zmian zgodnie z katalogiem `new-component.md`
  §4–5.
- Feature components pozostają `AnnotationReviewScreen`, `FrameList`,
  `FrameEditor` i `AnnotationList`/`AnnotationRow`.
- Nie powstaje nowy common component ani nowy token; katalog pozostaje aktualny.

## Checklista `new-component.md` §2.2

- [x] **Layout/Siatka:** bez zmian CSS i arbitralnych wartości; obecny workspace,
  pola short oraz grupowanie zachowują GRID-01/02/05/08/10/12 i
  SPACING-01/03/04/08/13.
- [x] **Typografia:** brak nowego copy; zachowane `xs/sm/md`, regular/semibold,
  `line-height-standard` i polski Sentence case.
- [x] **Kolory:** brak nowych par; widoczny błąd używa status-error i treści,
  a dirty/clean nie jest komunikowane samym kolorem.
- [x] **Obramowania:** bez zmian; focus-visible i error border pozostają
  widoczne, a synchronizacja nie remountuje aktywnej kontrolki.
- [x] **Cienie:** brak zmian i brak nowego cienia.
- [x] **Interakcje:** per-field dirty/baseline, dokładny widoczny payload, czyszczenie
  stale `geometryError`, terminalny refetch tylko w obrębie tego samego runu;
  zero optimistic update i zero dodatkowych requestów przy zmianie runu.
- [x] **Komponenty/common catalog:** wyłącznie istniejące `Panel`, `SelectField`,
  `TextField`, `Button`, `StatusBadge`, `UiStates`, `RegionOverlay`; brak nowego
  common component.

## FE-001-F5-FIX3 — wynik i Gate 3 (2026-08-25)

FIX3 zamyka dwa findings acceptance review bez zmian eksportu, backendu,
runtime E2E, normalizera PNG, copy i CSS.

### Zamknięte findings

- **F1 — per-field baseline:** `AnnotationRow` przechowuje jeden atomowy stan
  formularza z baseline i widocznym draftem dla `x`, `y`, `width`, `height` oraz
  klasy. Każde pole jest dirty wyłącznie, gdy jego kontrolka różni się od
  aktualnego baseline. Refetch przesuwa baseline do nowego DTO, synchronizuje
  każde czyste pole osobno i zachowuje każde dirty pole. Ręczne przywrócenie
  wartości baseline powoduje, że następna zmiana serwera znów pojawia się w
  kontrolce.
- **F1 — payload i błąd:** geometria i klasa są zapisywane dokładnie z wartości
  widocznych w kontrolkach, z `expected_version` najnowszej anotacji. Gdy
  synchronizacja baseline zmienia widoczną geometrię, stary `geometryError` jest
  czyszczony. Klucz wiersza nadal jest wyłącznie `annotation.id`; nie wrócił
  remount przez `version`.
- **F2 — status związany z runem:** ref przechowuje `{runId, status}`. Terminalny
  refetch uruchamia się tylko dla non-terminal → terminal tego samego runu.
  Nawigacja z running A do zcache'owanego terminalnego B i pierwszy terminalny
  render nie wykonują dodatkowej pary requestów.

### Cztery nowe regresje

1. Dirty `x=1910` przetrwał refetch, a czyste `y=222`, `width=10` i klasa
   `category-2` przyjęły wartości serwera. Stary błąd granic zniknął, a PATCH
   wysłał dokładnie widoczny bbox `{x:1910,y:222,width:10,height:32}` oraz
   `expected_version:4`.
2. Bez dirty wszystkie cztery pola geometrii oraz klasa zsynchronizowały się z
   nowym DTO.
3. Dirty `x=321` zachował się przy baseline `100→144`; po ręcznym cofnięciu do
   `144` kolejny baseline `188` pojawił się w kontrolce.
4. Po napełnieniu cache terminalnego runu B, przejściu do running A i powrocie
   do B liczniki run/list/detail B pozostały `1/1/1` — bez dodatkowego terminal
   refetchu. Istniejąca regresja tego samego runu nadal potwierdza dokładnie
   jeden refetch list/detail i brak stormu.

### Bramki

| Bramka | Wynik |
| --- | --- |
| Targeted annotations | **4/4 pliki, 37/37 testów**; `annotationTerminalRefresh` **5/5** (istniejąca + 4 nowe) |
| Frontend full Vitest | **33/33 pliki, 437/437 testów** |
| Architecture | **92/92** |
| TypeScript | `tsc --noEmit`, 0 błędów |
| Build | **295 modułów**; exports 8.37 kB / gzip 3.12 kB; main 497.52 kB / gzip 152.57 kB |
| Audit | `npm audit --audit-level=low`: **0 vulnerabilities** |
| Plain Playwright | dwa pełne przebiegi po **2/2**; finalny 33.3 s, real vertical + visual, migracje 0001→0005 |
| Dodatkowy visual | trzy przebiegi po **1/1**; finalne osiem SHA-256 równe HEAD FIX2 |
| Backend full pytest | odziedziczone **290/290** z FIX1; `git diff --stat 9362869..HEAD -- backend/app` jest pusty |

Końcowe hashe screenshotów są dokładnie niezmienione względem FIX2:

| PNG | SHA-256 |
| --- | --- |
| `annotations-1440.png` | `973CC93CBF0C3726EB9D030E4F17062615F307E72284708F22FD5C20D7BB95E6` |
| `dashboard-1440.png` | `429B9999EC458EF52DEF19837413CB05B9153DEC93427DE67CE13DF1E1009392` |
| `empty-1440.png` | `8F1672303579D1AF489A5E069206985195E33804F6E437713157AACE5EB36DA5` |
| `error-1440.png` | `885273365102EEB2E87DEFC71119FB3F2491844D90FCF701858C6C1B2B5A4835` |
| `exports-1440.png` | `8B884A9FA5341021D9E99DB054B6E4379A4C2F96EEC581EEF65D0964243AAFB6` |
| `loading-1440.png` | `A0A06CC068568015BA85E1688C8180883E11935B0C2A295AD0CB656D98039728` |
| `materials-1440.png` | `0A1B50320376BC128A3CB9866828844FE730AB114AC63C2761FFF22A0F3E0A84` |
| `profile-1440.png` | `A9CC0A5D169FBE548A152F86875220C06D356C829C0FD77F4C7074A71042EB74` |

### Odchylenia i ryzyka

Nie ma odchylenia produktowego, nowych zależności ani zmian screenshotów.
Podczas pierwszego pełnego `npm run e2e` po poprawce `empty` i `materials`, a
podczas drugiego pełnego przebiegu samo `empty`, zostały zapisane z alternatywnym
rastrem mimo zielonych asercji. Nie commitowano tych plików i nie zmieniano
zamkniętego w FIX2 harnessa. Każdy następujący izolowany visual capture odtworzył
dokładne hashe FIX2; dwa pierwsze izolowane przebiegi były identyczne, trzeci
ponownie pozostawił baseline i czysty status. To jest jawny drift rasteryzacji
zależny od sekwencji testów, nie zmiana UI FIX3; pozostaje ryzykiem środowiskowym
do obserwacji poza zamkniętym zakresem tego ticketu.

Commity FIX3 przed raportem: `48b5b20` (ticket/status), `e2967e0` (Design Plan)
i `99c3b51` (implementacja + regresje). TK-009, historia FIX1/FIX2, durable
locator, COCO i runtime E2E nie zostały przepisane ani zmienione.

## FE-001-F5-FIX4 — próba focus evidence (2026-08-25)

Pierwsza implementacja zastąpiła imperatywny atrybut ogólną regułą `:focus` i
dodała końcowy guard. Dwa targeted visual runs były zielone, ale PNG dowiodły,
że rozwiązanie nadal ma okno wyścigu wewnątrz `page.screenshot`: dashboard w obu
przebiegach, a empty w drugim utraciły cały brandowy ring już po przejściu
guarda. Nie commitowano zmienionych PNG. Reguła zostaje zawężona do stabilnego
selektora checkpointu wyliczonego bez mutacji węzła React; aktywny element i
widoczność ringu nadal są weryfikowane po `beforeScreenshot`.
