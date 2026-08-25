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

Dwa kolejne `scripts/check.ps1` po stabilizacji byly zielone bez resetu ani
recznej korekty plikow pomiedzy nimi:

| Bramka | Run 1 | Run 2 |
| --- | --- | --- |
| Ruff format | 226 plikow sformatowanych | 226 plikow sformatowanych |
| Ruff lint | 0 bledow | 0 bledow |
| mypy | 96 plikow, 0 problemow | 96 plikow, 0 problemow |
| pytest | 293/293, 29:45 | 293/293, 29:35 |
| frontend typecheck | 0 bledow | 0 bledow |
| Vitest | 33/33 pliki, 439/439 | 33/33 pliki, 439/439 |
| build | 295 modulow; main 497.65 kB/gzip 152.63; exports 8.37 kB/gzip 3.12 | identyczne |
| Playwright | 3/3, 52.9 s | 3/3, 39.1 s |
| E2E root safety | 2/2 | 2/2 |
| Podsumowanie skryptu | PASS 9/9 | PASS 9/9 |
| `git status --porcelain` | `<clean>` | `<clean>` |

Osiem PNG po kazdym przebiegu mialo identyczne SHA-256:

| PNG | Run 1 | Run 2 |
| --- | --- | --- |
| `annotations-1440.png` | `973CC93CBF0C3726EB9D030E4F17062615F307E72284708F22FD5C20D7BB95E6` | `973CC93CBF0C3726EB9D030E4F17062615F307E72284708F22FD5C20D7BB95E6` |
| `dashboard-1440.png` | `429B9999EC458EF52DEF19837413CB05B9153DEC93427DE67CE13DF1E1009392` | `429B9999EC458EF52DEF19837413CB05B9153DEC93427DE67CE13DF1E1009392` |
| `empty-1440.png` | `8F1672303579D1AF489A5E069206985195E33804F6E437713157AACE5EB36DA5` | `8F1672303579D1AF489A5E069206985195E33804F6E437713157AACE5EB36DA5` |
| `error-1440.png` | `885273365102EEB2E87DEFC71119FB3F2491844D90FCF701858C6C1B2B5A4835` | `885273365102EEB2E87DEFC71119FB3F2491844D90FCF701858C6C1B2B5A4835` |
| `exports-1440.png` | `8B884A9FA5341021D9E99DB054B6E4379A4C2F96EEC581EEF65D0964243AAFB6` | `8B884A9FA5341021D9E99DB054B6E4379A4C2F96EEC581EEF65D0964243AAFB6` |
| `loading-1440.png` | `A0A06CC068568015BA85E1688C8180883E11935B0C2A295AD0CB656D98039728` | `A0A06CC068568015BA85E1688C8180883E11935B0C2A295AD0CB656D98039728` |
| `materials-1440.png` | `0A1B50320376BC128A3CB9866828844FE730AB114AC63C2761FFF22A0F3E0A84` | `0A1B50320376BC128A3CB9866828844FE730AB114AC63C2761FFF22A0F3E0A84` |
| `profile-1440.png` | `A9CC0A5D169FBE548A152F86875220C06D356C829C0FD77F4C7074A71042EB74` | `A9CC0A5D169FBE548A152F86875220C06D356C829C0FD77F4C7074A71042EB74` |

### Commity, odchylenia i ryzyka

- `d9bd69b` - izolowane, semantycznie neutralne formatowanie znalezione przez nowa bramke;
- `48b891f` - trzy skrypty PowerShell;
- `4d60305` - README, RUNBOOK i poczatkowy log;
- `9d34ba0` - test-only stabilizacja lazy route wraz z diagnoza i Design Planem.

Brak odchylenia produktowego, nowych zaleznosci i zmian screenshotow. Jedyna
dodatkowa zmiana poza pierwotna lista plikow T1 to autoryzowane formatowanie
jednego pliku Python oraz autoryzowana test-only stabilizacja. Obie powstaly
dlatego, ze pierwsze realne uruchomienie nowej bramki ujawnilo istniejace
problemy na `main`; zadnego nie obchodzono przez ponawianie do zielonego.

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

Flake zaobserwowano w pierwszym pelnym `check.ps1` oraz w jednym z pieciu
pelnych `npm test` wykonawcy (pozostale 4 x 439/439). Obie awarie dotyczyly
wariantu `running` i konczyly sie po 1170-1179 ms. Recenzent nie odtworzyl tej
czestosci: piec pelnych `npm test` na dokladnym commicie `4d60305`, sprzed
poprawki, bylo zielone 5/5. Jest to zatem jednorazowy pomiar wykonawcy, a nie
niezaleznie potwierdzona czestosc. Trzy dodatkowe targetowane przebiegi
wykonawcy byly po 17/17 zielone.

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

## TK-006-T1-FIX1 - plan i audyt przed zmiana

### Plan

1. `Import-DotEnv` zwroci mape kluczy faktycznie odczytanych z `.env`, nadal
   eksportujac je do srodowiska procesu dla polecen potomnych.
2. `Get-RequiredEnvironmentValue` bedzie czytal wymagane wartosci tylko z tej
   mapy i w bledzie nazwie zarowno klucz, jak i plik `.env`.
3. `Assert-Executable` lokalnie ustawi `$ErrorActionPreference = "Continue"`
   tylko na czas wywolania natywnego procesu, stlumi jego strumienie i zapisze
   `$LASTEXITCODE` przed przywroceniem ustawienia. O wyniku zdecyduje wylacznie
   kod wyjscia; stderr procesu z kodem zero nie stanie sie konczacym
   `RemoteException` w Windows PowerShell 5.1.
4. Regresje obejma brak klucza mimo wartosci odziedziczonej po rodzicu, proces
   stderr/exit 0 i proces z kodem niezerowym, a potem pozytywny bootstrap oraz
   jeden pelny `check.ps1`.

### Audyt pozostalych wywolan natywnych exe

- `bootstrap.ps1`: `uv sync`, `npm ci` i `npm run e2e:install` nie przekierowuja
  stderr i sprawdzaja `$LASTEXITCODE`, wiec nie maja pulapki z F2.
- `dev.ps1`: `taskkill.exe` tlumi stderr, ale juz przed wywolaniem lokalnie
  ustawia `$ErrorActionPreference = "Continue"` i przywraca poprzednia wartosc
  w `finally`; uruchomienia aplikacji korzystaja z `Start-Process`.
- `check.ps1`: `Invoke-Gate` nie tlumi stderr, zapisuje `$LASTEXITCODE`, a
  wyjatek i kod niezerowy prowadza do czerwonej bramki. Zimny review potwierdzil
  ten mechanizm negatywnym przebiegiem end-to-end.

Nie znaleziono drugiego miejsca z kombinacja natywnego exe, stlumionego stderr
i globalnego `$ErrorActionPreference = "Stop"`.

### Dowody FIX1

| Scenariusz | Wynik |
| --- | --- |
| `.env` bez `DF_TESSERACT_RUNTIME_SHA256`, hash obecny w srodowisku rodzica | exit 1; komunikat nazwal klucz i pelna sciezke `.env`; `uv sync` nie zostal uruchomiony |
| kontrolowany proces piszacy na stderr, exit 0 | FFmpeg i ffprobe zaakceptowane; skrypt przeszedl do nastepnej walidacji |
| kontrolowany proces piszacy na stderr, exit 23 | exit 1; komunikat zawieral kod 23 i instrukcje instalacji dev-only na `D:`; instalacja nie ruszyla |
| parser Windows PowerShell 5.1 | 0 bledow |
| pozytywny `bootstrap.ps1` po finalnej zmianie | exit 0; oba hashe Tesseract zgodne; 63 pakiety Python i 128 pakietow npm; bez instalacji globalnej i zmian systemowego `PATH` |

Pelny `check.ps1` po poprawce zakonczyl sie `PASS 9/9` w jednym nieprzerwanym
przebiegu:

| Bramka | Dowod |
| --- | --- |
| Ruff format | 227 plikow, 0 wymagajacych formatowania |
| Ruff lint | 0 bledow |
| mypy | 96 plikow, 0 problemow |
| pytest | 293/293 w 29:40; bramka 1788 s |
| frontend typecheck | 0 bledow |
| Vitest | 33/33 pliki, 439/439 testow w 33,34 s |
| build | 295 modulow; main 497,65 kB/gzip 152,63; exports 8,37 kB/gzip 3,12 |
| Playwright | 3/3 w 41,9 s |
| E2E root safety | 2/2 |

Osiem PNG pozostalo deterministycznych i mialo te same SHA-256 co dwa
poprzednie przebiegi wykonawcy i dwa przebiegi zimnego review:

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

Po przebiegu `git status --short` byl pusty, a `git diff --check
62fd954..HEAD` nie zglosil bledow. Poprawka kodu jest w commicie `350cdf6`;
nie zmieniono zachowania `check.ps1`, `dev.ps1`, kodu produkcyjnego ani
konfiguracji bramek.
