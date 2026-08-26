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

## TK-006-T1-FIX2 - plan i audyt przed zmiana

### Plan

`Assert-Executable` ustawi `$global:LASTEXITCODE = $null` bezposrednio przed
wywolaniem. Uruchomiony proces natywny nadpisuje sentinel liczbowym kodem
wyjscia. Jezeli operator `&` nie uruchomi procesu natywnego, sentinel pozostaje
`$null` i walidator zwraca osobny blad z instrukcja instalacji. Dopiero liczbowy
kod jest rozpatrywany jako zero albo kod niezerowy.

Mechanizm zachowuje lokalne `$ErrorActionPreference = "Continue"` i tlumienie
obu strumieni, wiec stderr procesu z exit 0 nie staje sie konczacym
`RemoteException` w Windows PowerShell 5.1. Sentinel nie zalezy od `$?`, ktore
stderr moze ustawic na falsz mimo poprawnego kodu natywnego procesu.

### Audyt zalozen o `$LASTEXITCODE`

- `check.ps1`: `Invoke-Gate` inicjalizuje kod na 1, ale pracuje z globalnym
  `$ErrorActionPreference = "Stop"` i nie tlumi stderr. Brak startu polecenia
  przechodzi do `catch` przed przypisaniem `$LASTEXITCODE`, zachowuje kod 1 i
  zapisuje szczegol wyjatku; nie ma sciezki do falszywego PASS.
- `dev.ps1`: jedyne bezposrednie wywolanie natywne to best-effort
  `taskkill.exe` w cleanupie. Skrypt nie interpretuje `$LASTEXITCODE` ani nie
  oglasza na jego podstawie sukcesu; ostateczna gwarancja sprzatania pochodzi z
  Windows Job Object `KILL_ON_JOB_CLOSE`. Nie ma zalozenia, ze stary kod
  pochodzi z biezacego wywolania.

Zmiana zachowania `check.ps1` i `dev.ps1` nie jest potrzebna.

### Dowody FIX2

Pierwsza proba z sentinelem lokalnym wykryla istotna wlasciwosc PowerShella:
lokalne przypisanie zaslanialo wartosc aktualizowana przez proces natywny i
odrzucalo takze poprawny `.cmd`. Finalny mechanizm uzywa jawnego zakresu
`$global:LASTEXITCODE`; proces natywny nadpisuje tam sentinel, a plik, ktory nie
uruchamia procesu, pozostawia `$null`. Parser Windows PowerShell 5.1 nie zglosil
bledow.

Siedem wymaganych przypadkow:

| Przypadek | Faktyczny wynik |
| --- | --- |
| `.txt` jako `DF_FFMPEG_PATH`, poprzedni natywny exit 0 | rzeczywisty `bootstrap.ps1` end-to-end: exit 1, osobny blad braku startu i instrukcja `D:\tools\ffmpeg`; brak falszywego `OK` i brak wejscia w `uv sync` |
| plik bez rozszerzenia, poprzedni exit 0 | odrzucony przez dokladna funkcje z AST produkcyjnego skryptu, z instrukcja |
| no-op `.ps1`, poprzedni exit 0 | odrzucony, z instrukcja |
| uszkodzony `.exe`, poprzedni exit 0 | odrzucony, z instrukcja |
| kontrolowany proces stderr, exit 0 po zasianym exit 23 | zaakceptowany; `$ErrorActionPreference` przywrocone do `Stop` |
| kontrolowany proces stderr, exit 23 | odrzucony z kodem 23 i instrukcja |
| pozytywny bootstrap na tym hoscie | exit 0 w 15,7 s; FFmpeg, ffprobe i Tesseract wykryte; oba SHA-256 zgodne; 63 pakiety Python i 128 npm; Playwright w lokalnym cache |

Wszystkie kontrolowane pliki zostaly usuniete, a `.env` przywrocono przed
pozytywnym bootstrapem i pelna bramka.

Pelny, nieprzerwany `check.ps1` zakonczyl sie `PASS 9/9` w 1888,5 s:

| Bramka | Dowod |
| --- | --- |
| Ruff format | 228 plikow, 0 wymagajacych formatowania |
| Ruff lint | 0 bledow |
| mypy | 96 plikow, 0 problemow |
| pytest | 293/293 w 29:51; bramka 1798,9 s |
| frontend typecheck | 0 bledow |
| Vitest | 33/33 pliki, 439/439 testow w 29,30 s |
| build | 295 modulow; main 497,65 kB/gzip 152,63; exports 8,37 kB/gzip 3,12 |
| Playwright | 3/3 w 48,6 s |
| E2E root safety | 2/2 |

Osiem PNG mialo te same SHA-256 co wszystkie piec wczesniejszych pelnych
przebiegow (dwa wykonawcy, dwa zimnego review i jeden po FIX1):

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
62fd954..HEAD` nie zglosil bledow. `TK-006-T1.md` i FIX2 maja status
`WYKONANY`; bez push i merge.

---

# TK-006-T2 - restart, resume i pelna sciezka review w E2E

## Zakres i plan wykonania

1. Testowy launcher backendu zachowa jeden proces nadrzedny Node i udostepni
   wylacznie na loopback kontrolowany restart potomnego procesu Python. Restart
   twardo konczy stary PID, uruchamia nowy PID z tym samym
   `DATASETFACTORY_E2E_ROOT`, baza SQLite i workspace, a odpowiedz wraca dopiero
   po ponownej gotowosci realnego `/api/v1/health`.
2. `DeterministicE2eOcrEngine` dostanie testowy punkt synchronizacji oparty na
   markerach wewnatrz launcher-owned runtime leaf. Pozwala on zatrzymac worker
   w trakcie realnego etapu OCR, zanim test zabije backend, bez zmiany workflow,
   persistence ani kodu produkcyjnego. Osobny marker statusu wymusi negatywny
   odczyt `workspace.available=false`, nadal przez prawdziwy composition root.
3. `vertical-flow.spec.ts` wykona restart w OCR, potwierdzi zmiane PID i status
   `paused`, wznowi run z UI, a nastepnie wykona geometry update, delete, manual
   bbox przez gest rysowania, reject, filtr odrzuconych, reopen, accept, eksport
   i CAS complete. API oraz artefakty posluza do asercji dokladnie jednej klatki,
   jednej propozycji OCR po resume, jednego aktywnego manualnego bbox po review
   i jednego katalogu eksportu.
4. Nowy spec negatywny sprawdzi: `404 source_missing` przy imporcie wraz z copy i
   kodem w UI; `409 active_run` na probie uruchomienia widocznego queued runu,
   gdy drugi worker rzeczywiscie trzyma globalny slot, wraz z copy; oraz
   `503 dependency_unavailable` z `workspace.available=false` wraz z copy
   `Katalog roboczy / Niedostepny` na dashboardzie. Markery i oba runy zostana
   posprzatane w `finally`, a runtime leaf pozostaje pod istniejacym bezpiecznym
   cleanupem F5.
5. Weryfikacja: testy celowane, trzy kolejne plain `npm run e2e` bez resetu z
   hashami osmiu PNG i czystym statusem, a na koniec jeden pelny
   `scripts/check.ps1` bez zmian jego tresci.

## TK-006-T2 - Design Plan (test-only)

Plan zapisany przed zmiana `frontend/` zgodnie z `frontend/src/AGENTS.md` oraz
`new-component.md`. Przeczytano caly `tokens.css`, katalog i definicje
komponentow common oraz cale moduly: Siatka i Odstepy, Stylizacja Elementow i
Typografia z wytycznych UI/UX. Nie powstaje nowy komponent, copy, DOM, CSS ani
token; E2E steruje i asertuje istniejacy interfejs.

### Wszystkie elementy UI objete scenariuszami

1. Profil: `TextField` „Nazwa profilu” i „Sciezka obrazu referencyjnego”,
   `Button` „Wczytaj podglad”/„Utworz profil”, `RegionOverlay` regionow HUD oraz
   przycisk klasy „7”.
2. Material i run: `MaterialImportForm`, `TextField` sciezki, `InlineError` i
   jawny kod bledu, `SelectField` materialu/profilu/interwalu, przyciski
   „Zaimportuj material”/„Utworz run” oraz wspolny `RunPanel` z „Uruchom” i
   „Wznow”.
3. Review: `SelectField` „Status weryfikacji”, `FrameList`, `Panel` „Obraz i
   bbox”, `RegionOverlay` bbox, lista „Aktywne anotacje”, pola geometrii,
   `Button` „Zapisz geometrie”, „Usun”, manualny gest rysowania bbox,
   „Odrzuc klatke”, „Otworz ponownie” i „Zaakceptuj klatke”, wraz z badge liczby
   aktywnych anotacji.
4. Eksport: link nawigacyjny „Eksporty”, przycisk „Uruchom eksport COCO”, panel
   „Wynik eksportu COCO”, panel pochodzenia anotacji oraz „Zamknij run”.
5. Scenariusze bledow: `InlineError` importu `source_missing` wraz z akapitem
   kodu, `InlineError` mutacji `active_run` w `RunPanel`, a takze
   `SystemStatusPanel`, status systemu i wiersz „Katalog roboczy” z errorowym
   `StatusBadge` „Niedostepny”.

### Moduly i ID wytycznych

| Obszar | Zastosowanie w dowodzie E2E |
| --- | --- |
| Architektura frontend | FE-03: realny server state, polling i invalidacje; FE-04: `runId` oraz `export_id` w URL; FE-05: backendowa walidacja pozostaje autorytatywna; FE-06: loading/disabled/inline error i potwierdzony stan po mutacji; FE-08: selektory po rolach/labelach oraz klawiaturowo dostepne operacje; FE-10 wariant C: krytyczna sciezka Playwright przez prawdziwy backend. |
| Komponenty | `new-component.md` sekcje 4-5: wylacznie istniejace `Button`, `UiStates.InlineError`, `NavItem`, `StatusBadge`, `Panel`, `Notice`, `TextField`, `SelectField`, `DataList`, `RegionOverlay`; brak nowego common component. |
| Layout/Siatka | GRID-00..14 i SPACING-01..13: bez zmian DOM/CSS/layoutu; test korzysta z istniejacych hit area, grup formularzy, paneli i powierzchni obrazu. |
| Kolor i status | COLOR-01..10 oraz OPACITY-01/02: bez zmian palety; asercje znaczenia uzywaja tekstu, roli i kodu, a nie samego koloru. `source_missing`, `active_run` i niedostepny workspace pozostaja semantycznymi stanami error. |
| Obramowania i overlay | BORDER-01..03, BORDER-05..09, BWIDTH-01..14, RADIUS-01..05 i OVERLAY-01..07: bez zmian wizualnych; test uzywa istniejacego `RegionOverlay` i kontrolek common. |
| Cienie | SHADOW-01..05: bez zmian; test nie dodaje ani nie asertuje dekoracyjnej glebi. |
| Typografia | TYPO-01..21, FONTSIZE-01..11, LHEIGHT-01..14, LSPACE-01..09, PARASPACE-01..06 i CASING-01..03: bez nowego copy i bez zmian renderowania; asercje odwolują sie do istniejacego polskiego sentence case oraz jawnych kodow technicznych. |

### Checklista `new-component.md` sekcja 2.2

- [x] **Layout/Siatka:** bez zmian; E2E nie wprowadza wartosci ani styli.
- [x] **Typografia:** bez zmian; selektory uzywaja istniejacych nazw dostepnosci i copy.
- [x] **Kolory:** bez zmian; znaczenie stanow jest asertowane tekstem/rola/kodem.
- [x] **Obramowania:** bez zmian.
- [x] **Cienie:** bez zmian.
- [x] **Interakcje:** prawdziwe klikniecia, formularze, drag `RegionOverlay`, filtry i lifecycle; stany bledow sa odpowiedziami realnego API.
- [x] **Komponenty:** tylko istniejace komponenty z katalogu sekcji 4-5; brak nowego UI.

## TK-006-T2 - wykonanie i dowody

### Dostarczone zachowanie

- Launcher E2E pozostaje jednym procesem nadrzednym Node i zarzadza potomnym
  procesem Python. Kontroler tylko na `127.0.0.1:8001` wykonuje twardy restart:
  stary proces jest konczony przez `SIGKILL`, a nowy startuje z tym samym
  `DATASETFACTORY_E2E_ROOT`, baza SQLite i workspace. Odpowiedz restartu zawiera
  oba dodatnie PID-y; spec wymaga, aby byly rozne, i czeka na realny health.
- Jedyny stub OCR dostal punkt synchronizacji wewnatrz markerowanego runtime
  leaf. Spec zatrzymuje prawdziwy worker w OCR, zabija backend, potwierdza stan
  `paused`, usuwa blokade i wznawia run z istniejacego przycisku `Wznow`.
- Po resume API dowodzi: `total_frames=1`, `completed_frames=1`, lista klatek
  `total=1` i ma jeden element, klatka ma dokladnie jedna proponowana anotacje
  OCR, a katalog eksportow ma `0` elementow. Po pelnym review klatka nadal jest
  jedna, ma dwie historyczne anotacje (usunieta OCR oraz aktywna manualna), a
  aktywna kolekcja zawiera tylko manualna. Powstaje dokladnie jeden katalog
  eksportu z `manifest.json`; manifest ma zrodla `{manual: 1, ocr: 0}`.
- Pelna sciezka UI wykonuje: zapis skorygowanej geometrii, usuniecie OCR bbox,
  reczne narysowanie bbox przez `RegionOverlay`, reject, filtr odrzuconych,
  reopen, filtr oczekujacych, accept, eksport oraz jawne zamkniecie runu. Body
  complete jest asertowane jako aktualne `{expected_version: version}` i
  koncowy status runu to `completed`.
- Nowy scenariusz negatywny sprawdza rownoczesnie transport i UI: `404
  source_missing` plus instrukcja przywrocenia pliku i jawny kod; realny `409
  active_run` plus copy o aktywnym runie i instrukcja jego zatrzymania lub
  dokonczenia; `503 dependency_unavailable` z
  `workspace.available=false/critical=true/detail=unavailable` plus panel
  `Stan systemu`, wiersz `Katalog roboczy` i copy `Niedostepny`/`unavailable`.
  Markery i oba runy sa sprzatane w `finally`.

### Weryfikacja celowana i potrojny plain E2E

Test celowany scenariusza negatywnego przeszedl `1/1` w 17,6 s. Nastepnie
wykonano trzy kolejne plain `npm run e2e` bez resetu i bez edycji pomiedzy
przebiegami:

| Przebieg | Wynik | Czas Playwright | Status po przebiegu |
| --- | --- | --- | --- |
| 1 | 4/4 | 44,0 s | czysty |
| 2 | 4/4 | 43,8 s | czysty |
| 3 | 4/4 | 44,9 s | czysty |

We wszystkich trzech przebiegach osiem PNG bylo bitowo identyczne z baseline:

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

### Pelna bramka

Pierwsza proba zatrzymala sie przed bramka 1, poniewaz nowy worktree nie mial
ignorowanego `.env`; druga nie dotarla do skryptu przez zapis backslashy w
posrednim Git Bash. Po utworzeniu lokalnego `.env` z cache/workspace na `D:` i
rzeczywistymi sciezkami zainstalowanego FFmpeg, bramka 1 wykryla formatowanie,
a nastepny fail-fast bramka 2 wykryla kolejnosc importow i zbedne `noqa` w
`e2e_server.py`. Ruff zastosowal tylko te mechaniczne poprawki. Zadne z tych
uruchomien nie weszlo do pozostalych bramek i nie bylo przedstawiane jako
pelny wynik.

Finalny, nieprzerwany `scripts/check.ps1` zakonczyl sie `PASS 9/9`:

| Bramka | Dowod |
| --- | --- |
| Ruff format | 228 plikow, 0 wymagajacych formatowania; 0,1 s |
| Ruff lint | 0 bledow; 0,1 s |
| mypy | 96 plikow, 0 problemow; 51,3 s |
| pytest | 293/293 w 29:32; bramka 1781,5 s |
| frontend typecheck | 0 bledow; 3,2 s |
| Vitest | 33/33 pliki, 439/439 testow w 38,65 s; bramka 40,5 s |
| build | 295 modulow; main 497,65 kB/gzip 152,63; exports 8,37 kB/gzip 3,12; bramka 2,9 s |
| Playwright | 4/4 w 45,1 s; bramka 46,8 s |
| E2E root safety | 2/2; bramka 0,6 s |

Po pelnej bramce osiem PNG nadal ma powyzsze SHA-256. Nie zmieniono kodu
produkcyjnego, `check.ps1`, `dev.ps1`, normalizera PNG ani screenshot QA; nie
dodano zaleznosci. Twardy restart moze wypisac chwilowy `ECONNREFUSED` proxy lub
`ConnectionResetError` zabijanego procesu Windows; test czeka na nowy realny
health i jest to diagnostyka faktycznego kill/restart, nie ukryty retry.

Commity wykonawcze: `06a9b99` (`test(e2e): cover restart resume and negative
paths`) oraz `0b778ad` (`style(e2e): satisfy backend lint`). Bez push i merge.

## TK-006-T2-FIX1 - addendum planu przed zmiana

Cold review potwierdzil mechanizm restartu i otworzyl trzy szczeliny. FIX1 nie
zmienia kontrolera restartu ani kodu produkcyjnego.

1. Wyścig dashboardu zostanie usuniety przez jawna bariere odpowiedzi HTTP:
   test poczeka na poczatkowy `GET /dashboard` po wejściu na Materials przed
   `POST /runs`, przechwyci ID z odpowiedzi create i poczeka na wynik
   invalidacyjnego `GET /dashboard`, ktory zawiera dokladnie to ID. Dopiero
   wtedy użyje `Uruchom`. Nie bedzie retry ani wydluzenia timeoutu.
2. Vertical flow ustawi interwal 500 ms, wiec jedn-sekundowy fixture da dwie
   klatki. Marker `hold-ocr` bedzie zawieral docelowy `frame_index`; jedyny stub
   OCR odczyta indeks z realnego `crop_relpath`, zasygnalizuje wejscie i zatrzyma
   sie tylko dla klatki 1. Wtedy klatka 0 ma juz trwale `review_pending`, trzy
   completed checkpointy, jedna obserwacje i jedna anotacje.
3. Przed `SIGKILL` test zapisze snapshot API klatki 0 oraz read-only snapshot
   prawdziwej SQLite przez wbudowane `node:sqlite`: ID/wersje/statusy obu klatek,
   ID obserwacji i anotacji oraz pelne rekordy checkpointow klatki 0. Po resume
   porowna je bitowo dla klatki 0 i sprawdzi dokladnie: dwa unikalne indeksy i
   ID klatek, po jednej obserwacji i anotacji OCR na klatke, trzy completed
   checkpointy na klatke oraz brak wzrostu attempt checkpointow pierwszej.
4. `ControllableE2eWorkspace` i prywatne przepiecie composition zostana usuniete.
   Scenariusz negatywny nalozy na prawdziwy runtime workspace odwracalny, jawny
   deny ACL `W` dla biezacej tozsamosci Windows przez `icacls`. Lokalna proba na
   jednorazowym katalogu potwierdzila bez administratora, ze tworzenie pliku
   konczy sie `UnauthorizedAccessException`; usuniecie deny przywraca zapis.
   Health wykona niezmienione produkcyjne `Workspace.check_writable()` i jego
   realny `tempfile.mkstemp`. ACL jest usuwany w `finally`, a health po cleanupie
   musi znow byc zielony.
5. Po testach celowanych: trzy kolejne plain `npm run e2e` bez retry i edycji,
   osiem niezmienionych hashy oraz czysty status po kazdym; na koniec jeden
   pelny, nieprzerwany `scripts/check.ps1`.
