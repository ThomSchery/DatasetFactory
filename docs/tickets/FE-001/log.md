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
