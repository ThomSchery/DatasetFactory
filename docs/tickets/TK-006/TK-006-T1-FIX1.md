# TK-006-T1-FIX1 — uczciwe czytanie `.env` i wykrywanie zależności

Status: WYKONANY

## Powód

Niezależny zimny review T1 potwierdził, że `check.ps1` jest bramką, której
wynikowi można ufać: dziewięć bramek we właściwej kolejności, brak ścieżki do
zielonego przy pominiętej bramce, dwa pełne przebiegi z identycznymi ośmioma
hashami i czystym `git status`. Werdykt `REVISE` dotyczy wyłącznie dwóch
błędów w `bootstrap.ps1`, oba odtworzone end-to-end.

Review: `artifacts/TK-006-T1-review/index.md`.

## Zakres

### F1 — wymagane klucze pochodzą z `.env`, nie ze środowiska rodzica

`Get-RequiredEnvironmentValue` (`scripts/bootstrap.ps1:39-46`) czyta zmienną
z procesu, a loader `.env` tylko dopisuje do tego samego miejsca. Klucz
nieobecny w `.env`, ale odziedziczony po środowisku rodzica, przechodzi jako
poprawnie skonfigurowany. Recenzent usunął hash runtime'u z `.env`, zostawił go
w środowisku rodzica i bootstrap przeszedł dalej do `uv sync` zamiast dać
instrukcję. Częściowy `.env` może więc cicho użyć starej ścieżki albo starej
sumy kontrolnej.

1. Loader ma zapamiętać zbiór kluczy faktycznie odczytanych z pliku `.env`.
2. Wymagana wartość jest brana wyłącznie z tego zbioru. Klucz obecny tylko
   w środowisku rodzica traktuj jak brakujący — z tą samą instrukcją co dziś.
3. Komunikat ma nazywać konkretny klucz i plik, tak żeby dało się to naprawić
   bez czytania skryptu.
4. Regresja: `.env` bez jednego wymaganego klucza, ta sama zmienna ustawiona
   w środowisku procesu wywołującego — bootstrap kończy się instrukcją, nie
   przechodzi do instalacji.

### F2 — wykrywanie zależności nie może przewracać się na stderr

`Assert-Executable` (`scripts/bootstrap.ps1:73-75`) używa `& $Path @Arguments
*> $null`. W PowerShell 5.1 przy `$ErrorActionPreference = 'Stop'` stderr
natywnego procesu staje się kończącym `RemoteException`, zanim skrypt sprawdzi
`$LASTEXITCODE`. Recenzent odtworzył to zdrowym `cmd.exe`, które wypisało
ostrzeżenie na stderr i zwróciło `0` — funkcja je odrzuciła.

To nie jest teoria: FFmpeg i Tesseract rutynowo piszą na stderr przy
`-version`, więc poprawnie zainstalowana zależność może zostać uznana za
zepsutą.

1. Wykrywanie ma rozstrzygać wyłącznie o kod wyjścia procesu, nie o obecność
   czegokolwiek na stderr.
2. Wybierz mechanizm odporny na tę pułapkę 5.1 — lokalne przywrócenie
   `$ErrorActionPreference`, `Start-Process` z przekierowaniem albo inny —
   i opisz w logu, dlaczego akurat ten.
3. Dwa dowody negatywne, oba wymagane:
   - proces piszący na stderr i zwracający `0` jest zaakceptowany;
   - proces zwracający kod niezerowy jest odrzucony z instrukcją.
4. Sprawdź, czy ta sama pułapka nie występuje w pozostałych miejscach
   `bootstrap.ps1`, `dev.ps1` i `check.ps1`, gdzie wywoływane jest natywne exe.

### F3 — sprostowanie dowodu w logu

Recenzent nie odtworzył raportowanej częstości flake'a: pięć pełnych `npm test`
na dokładnym commicie `4d60305`, sprzed poprawki, było zielone 5/5. Zapis
„1 na 5" w `docs/tickets/TK-006/log.md` jest więc pomiarem jednorazowym,
niepotwierdzonym niezależnie.

Popraw ten wpis tak, by mówił dokładnie tyle, ile wiadomo: flake zaobserwowany
w pierwszym pełnym `check.ps1` i w jednym z pięciu przebiegów wykonawcy,
nieodtworzony w niezależnej próbie recenzenta. Sama poprawka testu zostaje —
czeka na właściwy stan pośredni, a recenzent potwierdził, że sekwencja
`GET export` → `GET run` jest uzasadniona projektowo, bo `run_id` pochodzi
z eksportu.

## Poza zakresem

- `check.ps1` i `dev.ps1` w zakresie zachowania — potwierdzone przez review;
- powrót do `--reload` w uvicornie;
- zmiana testu `exportsFlow.test.tsx` ponad sprostowanie zapisu w logu;
- cokolwiek z T2, T3 i T4.

## Done Criteria

- Obie regresje z F1 i F2 są zielone, wraz z dwoma dowodami negatywnymi.
- Pozostałe wywołania natywnych exe sprawdzone pod kątem tej samej pułapki;
  wynik przeglądu zapisany, także jeśli nic więcej nie znaleziono.
- Pozytywna ścieżka bootstrapu nadal przechodzi na tym hoście.
- `check.ps1` przechodzi w całości; wystarczy jeden pełny przebieg, bo
  idempotentność została już niezależnie potwierdzona dwoma przebiegami.
- Wpis o flake'u w logu odpowiada temu, co faktycznie zmierzono.
- `git diff --check 62fd954..HEAD` i końcowy `git status` czyste; bez push.
