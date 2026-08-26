# TK-006-T1-FIX2 — odróżnić brak startu procesu od natywnego zera

Status: WYKONANY

## Powód

Re-review FIX1 potwierdził domknięcie obu poprzednich findingów, ale odtworzył
przypadek zgłoszony jako otwarte pytanie przy przekazaniu fixu.

`Assert-Executable` (`scripts/bootstrap.ps1:80-85`) inicjalizuje `$exitCode`
na 1, po czym bezwarunkowo nadpisuje go przez `$LASTEXITCODE`. Gdy wskazany
plik istnieje, ale nie uruchamia natywnego procesu, lokalne
`$ErrorActionPreference = "Continue"` tłumi błąd, a `$LASTEXITCODE` zachowuje
wartość z poprzedniej komendy. Jeśli ta zwróciła zero, zepsuta zależność
zostaje zaakceptowana.

Odtworzenie: `cmd.exe /c exit 0`, następnie `DF_FFMPEG_PATH` wskazujący zwykły
plik `.txt`. Bootstrap wypisał `OK: wykryto FFmpeg` i przeszedł do ffprobe.
Ten sam wynik dla pliku bez rozszerzenia i dla no-op `.ps1`. Uszkodzony albo
pusty `.exe` rzuca `ApplicationFailedException` i jest odrzucany poprawnie, ale
dowolny inny `PathType Leaf` daje fałszywe `OK`.

Review: `artifacts/TK-006-T1-FIX1-review/index.md`.

## Zakres

1. `Assert-Executable` ma odróżniać trzy sytuacje: proces wystartował i zwrócił
   zero, proces wystartował i zwrócił kod niezerowy, proces w ogóle nie
   wystartował. Trzecia jest porażką, nie sukcesem.
2. Mechanizm wybierasz sam — `Start-Process -Wait -PassThru`, sentinel
   w `$LASTEXITCODE` przed wywołaniem, sprawdzenie `$?` bezpośrednio po
   wywołaniu albo inny. Uzasadnij wybór w logu, wraz z tym, dlaczego jest
   odporny na tłumienie strumieni w PowerShell 5.1.
3. Rozwiązanie nie może cofnąć FIX1: proces piszący na stderr i zwracający
   zero ma nadal być akceptowany. Tłumienie wyjścia zostaje — bootstrap nie ma
   zalewać konsoli wersjami narzędzi.
4. Sprawdź, czy `dev.ps1` i `check.ps1` nie mają analogicznego założenia, że
   `$LASTEXITCODE` po wywołaniu na pewno pochodzi z tego wywołania.

## Dowody wymagane

Wszystkie na kontrolowanych, sprzątanych po sobie plikach:

| Przypadek | Oczekiwanie |
| --- | --- |
| `.txt` jako ścieżka zależności, poprzednia komenda z exit 0 | odrzucony z instrukcją |
| plik bez rozszerzenia, poprzednia komenda z exit 0 | odrzucony |
| no-op `.ps1` jako ścieżka zależności | odrzucony |
| uszkodzony lub pusty `.exe` | odrzucony |
| proces piszący na stderr, exit 0 | zaakceptowany |
| proces z exit niezerowym | odrzucony z kodem i instrukcją |
| pozytywna ścieżka na tym hoście | przechodzi bez zmian |

## Poza zakresem

- `check.ps1` i `dev.ps1` w zakresie zachowania, poza sprawdzeniem z punktu 4;
- wszystko domknięte w T1 i FIX1;
- T2, T3 i T4.

## Done Criteria

- Siedem przypadków z tabeli udowodnionych, każdy z faktycznym wynikiem.
- Wynik sprawdzenia `dev.ps1` i `check.ps1` zapisany, także jeśli czysto.
- `check.ps1` przechodzi w całości jednym przebiegiem.
- `git diff --check 62fd954..HEAD` i `git status` czyste; bez push i merge.
