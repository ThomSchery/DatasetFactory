# TK-006 - log wykonania

Log wspolny dla podticketow TK-006-T1 ... TK-006-T4. Kazdy podticket dopisuje
wlasna sekcje; sekcje wczesniejsze pozostaja nietkniete.

---

# TK-006-T1 - skrypty uruchomieniowe, jedna bramka i dokumentacja

## Zakres i interpretacje

- Skrypty jedynie orkiestruja istniejace polecenia; nie zmieniaja kodu
  produkcyjnego, konfiguracji narzedzi ani tresci bramek.
- `bootstrap.ps1` instaluje lokalne zaleznosci Python i frontend oraz przegladarke
  Playwright w cache na `D:`. FFmpeg i Tesseract sa tylko wykrywane i walidowane.
- `check.ps1` jawnie zachowuje osobne `npm run test:e2e-root` po Playwright.
- Ticket nie obejmuje UI, wiec workflow `frontend/src/AGENTS.md` nie ma zastosowania.

## Dowody

### Znalezisko pierwszej bramki

Pierwsze rzeczywiste `uv run --frozen ruff format --check` na bazie `62fd954`
wykrylo, ze `main` nie przechodzi kontraktu: `profiles.py` byl jedynym z 226
plikow wymagajacym formatowania. Bramka figurowala w dokumentacji, lecz jej stan
dowodzi, ze nie byla odpalana jako obowiazkowy gate. Za zgoda koordynatora sam
wynik Ruff dla jednego pliku trafil do osobnego commita `d9bd69b`.

Przed commitem hash znaczacych tokenow Python byl identyczny przed i po:
`BF936D80129279DBAD6D94FEFE5B4D3C44B10BE994F30CE45DB27FF7002D3BCB`.
Diff: 1 insert, 3 delete; jedyna zmiana to zlozenie lancucha
`select(...).where(...).order_by(...)` do jednej linii.

### Bootstrap

| Scenariusz | Wynik |
| --- | --- |
| Istniejacy FFmpeg/ffprobe | wykryte pod skonfigurowanymi sciezkami, bez instalacji |
| Runtime Tesseract | SHA-256 `C66F0F12...3F420` zgodny |
| Model `eng.traineddata` | SHA-256 `7D4322BD...70B2` zgodny |
| Pozytywny bootstrap | exit 0; 63 lockowane pakiety Python, 128 lokalnych pakietow npm, Chromium w cache na `D:` |
| Brak Tesseracta | exit 1; instrukcja dev-only na `D:`, bez tracebacka |
| Bledny runtime SHA-256 | exit 1; oczekiwany i faktyczny hash w komunikacie, bez tracebacka |

### Przerwanie check na pierwszej czerwonej

Kontrolowany `uv.cmd` zwracajacy exit 23 zatrzymal `check.ps1` po `backend
format`. Podsumowanie zawieralo `FAIL backend format (exit 23)`, `SKIP 8
pozostalych bramek` oraz finalny exit 1. Pierwsza wersja testu ujawnila blad
PowerShell (stdout procesu natywnego zanieczyszczal wartosc zwrotna funkcji);
sterowanie zostalo zmienione na jawny stan skryptu, a negatywny dowod powtorzony
z wynikiem oczekiwanym.

### Development

`dev.ps1` podniosl rzeczywisty uvicorn i Vite na 8000/5173. Po sygnale
konsolowym oba porty byly zamkniete. Procesy sa przypisane do Windows Job Object
z `KILL_ON_JOB_CLOSE`, wiec cleanup obejmuje potomkow takze wtedy, gdy host
PowerShell zostanie przerwany zanim wykona `finally`.

### Pelne bramki i determinizm

Do uzupelnienia po dwoch pelnych przebiegach.

## TK-006-T1 - Design Plan stabilizacji testu eksportu (test-only)

Plan zapisany przed zmiana `frontend/src/` zgodnie z lokalnym `AGENTS.md` i
`new-component.md`. Przeczytano caly `frontend/src/styles/tokens.css` oraz
katalog i definicje komponentow z `new-component.md` sekcje 4-5.

### Elementy UI objete dowodem

1. Istniejacy route-level `UiStates.Loading`: „Ladowanie ekranu eksportow...”.
2. Istniejacy `UiStates.Loading` zapytania eksportu: „Ladowanie statusu eksportu...”.
3. Istniejacy `UiStates.Loading` zaleznnego zapytania runu: „Ladowanie runu eksportu...”.
4. Istniejacy `Panel`/region „Biezacy eksport” jako stan koncowy.

Nie powstaje nowy element, komponent common, token, copy, styl ani zachowanie
produktu. Zmiana dotyczy wylacznie kolejnosci oczekiwan w istniejacym tescie.

### Moduly i ID

| Obszar | Zastosowanie |
| --- | --- |
| Architektura frontend | FE-03: dwa zapytania TanStack Query, z czego run jest wlaczany dopiero po `run_id` z eksportu; FE-06: jawne stany Loading; FE-10: test realnej trasy i query clienta |
| Komponenty | `new-component.md` sekcje 4-5: istniejace `UiStates.Loading` i `Panel`; brak nowego common component |
| Layout/Siatka | GRID-01/02, SPACING-01..13: bez zmian DOM/CSS/layoutu i tokenow |
| Typografia | TYPO-01..21, FONTSIZE-01..11, LHEIGHT-01..14, LSPACE-01..09, CASING-01..03: bez nowego copy i bez zmian renderowania |
| Kolor/interakcje | COLOR-01..10, OPACITY-01/02: bez zmian stanow wizualnych lub interaktywnych |
| Obramowania/radius/cienie | BORDER-01..09, BWIDTH-01..14, RADIUS-01..05, SHADOW-01..05: bez zmian wizualnych |

### Checklista `new-component.md` sekcja 2.2

- [x] **Layout/Siatka:** bez zmian; test nie asertuje geometrii.
- [x] **Typografia:** bez zmian; asercje uzywaja istniejacych nazw dostepnosci.
- [x] **Kolory:** bez zmian.
- [x] **Obramowania:** bez zmian.
- [x] **Cienie:** bez zmian.
- [x] **Interakcje:** asercja rozdziela lazy fallback, GET eksportu i zalezne GET runu; nie zmienia zachowania aplikacji.
- [x] **Komponenty:** tylko istniejace `UiStates.Loading` i `Panel`.

### Diagnoza i baseline pre-fix

Testing Library ma `asyncUtilTimeout=1000 ms` w lokalnej wersji; `vite.config.ts`
nie nadpisuje tej wartosci. Jedno koncowe `findByRole` obejmowalo trzy kolejne
przejscia: lazy import trasy, GET `/exports/{id}`, a po uzyskaniu `run_id` GET
`/runs/{id}`. Zapytan produktowych nie mozna zrownoleglic, bo ID runu pochodzi
z odpowiedzi eksportu. Pelny output awarii z `check.ps1` pokazywal nadal
route-level fallback; druga awaria miala identyczny test i czas 1170 ms, ale jej
pelnego DOM nie zachowano. Dowod nie wskazuje na wolne zapytania produktu.

Pelny `npm test` pre-fix: 1/5 czerwonych (pozostale 4 x 439/439); razem z
pierwszym `check.ps1`: 2/6 czerwonych. Obie awarie dotyczyly wariantu `running`
i konczyly sie po 1170-1179 ms. Trzy dodatkowe targetowane przebiegi byly po
17/17 zielone.

### Poprawka i dowod post-fix

Test jawnie czeka teraz na `Ladowanie statusu eksportu...` z lokalnym budzetem
2 s tylko dla przejscia przez lazy route. Nastepnie osobno asertuje
`Ladowanie runu eksportu...` i region `Biezacy eksport`, oba z niezmienionym
domyslnym timeoutem 1 s. Dwa zapytania pozostaja sekwencyjne zgodnie z produktem;
globalny timeout, config Vitest i kod produkcyjny sa nietkniete.

Dowody po zmianie:

- targetowany `exportsFlow.test.tsx`: 10/10 przebiegow po 17/17;
- pelny `npm test`: 5/5 przebiegow po 33/33 pliki i 439/439 testow;
- czasy pieciu pelnych suite: 34.39 s, 28.69 s, 30.53 s, 33.79 s, 30.99 s;
- czestosc czerwonych: 0/5 post-fix wobec 1/5 w bezposredniej probce pre-fix.
