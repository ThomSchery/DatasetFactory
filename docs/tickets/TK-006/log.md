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
