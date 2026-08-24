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
