# TK-010 - log wykonania

## Zakres i interpretacje

- Zmiana dotyczy wylacznie przygotowania testow w `backend/tests/conftest.py`.
  Kod produkcyjny pozostaje nietkniety.
- Sesyjny fixture tworzy jedna baze wzorcowa przez prawdziwe migracje do `head`.
  Funkcyjny fixture `composition` kopiuje plik do prywatnego workspace testu i
  pomija tylko ponowne wywolanie `upgrade_database` dla tej gotowej kopii.
- Fixture `settings` pozostaje bez zmian i nadal wskazuje pusty, prywatny
  workspace. Dzieki temu `backend/tests/test_migrations.py`, w tym
  `test_initial_migration_up_down_up` oraz
  `test_integrity_migration_backfills_and_round_trips_existing_data`, omija
  szablon i wykonuje prawdziwe lancuchy migracji.
- Ticket nie obejmuje UI, wiec workflow `frontend/src/AGENTS.md` nie ma
  zastosowania.

## Plan pomiaru

1. Zmierzyc reprezentatywny pojedynczy plik przed zmiana.
2. Wprowadzic baze szablonowa bez `pytest-xdist` i powtorzyc identyczny pomiar.
3. Uruchomic dwa wskazane testy migracyjne osobno oraz pelny backendowy suite.
4. Dopiero na podstawie czasu pelnego suite zdecydowac, czy `pytest-xdist` jest
   potrzebny.
5. Uruchomic pelne `scripts/check.ps1`, zaktualizowac realny czas w README i
   RUNBOOK oraz zapisac finalne dowody.

## Baseline

- Pomiar `main` przekazany w tickecie: 293/293, 1791,20 s (29:51), polecenie
  `pytest -q --durations=25 --durations-min=0.5`.
- Lokalny pomiar pojedynczego
  `backend/tests/test_profile_workflow_api.py` przed zmiana: 18/18, 168,44 s
  czasu pytest (178,9 s zegarowo). Wszystkie 18 faz setup trwaly 7,44-11,22 s.

## Wynik po bazie szablonowej

| Pomiar | Wynik | Czas pytest | Czas zegarowy |
| --- | --- | --- | --- |
| Pojedynczy `test_profile_workflow_api.py` | 18/18 | 15,89 s | 18,6 s |
| Dwa wymagane testy migracyjne | 2/2 | 32,40 s | 35,0 s |
| Pelny backendowy suite | 293/293 | 277,18 s (4:37) | 283,1 s |

W pojedynczym pliku jednorazowe utworzenie szablonu zajelo 8,09 s. Kolejne
fazy setup, obejmujace osobna kopie bazy i osobny workspace, zajmowaly
0,12-0,22 s. Ten sam plik byl zielony samodzielnie (18/18) i jako czesc pelnego
suite (293/293).

Dwa testy migracyjne uruchomione osobno mialy setup 0,02 s, a ich koszt pozostal
w fazie `call`: 19,58 s dla `test_initial_migration_up_down_up` i 12,68 s dla
`test_integrity_migration_backfills_and_round_trips_existing_data`. Brak
jednorazowego setupu szablonu w tym przebiegu oraz uzycie niezmienionego fixture
`settings` dowodza, ze oba nadal przechodza prawdziwe migracje na pustej bazie.

Pelny suite spadl z przekazanych 1791,20 s do 277,18 s, czyli o 84,5% i 6,46x.
Poniewaz wynik 4:37 jest ponizej progu 8 minut, krok z `pytest-xdist` zostal
swiadomie pominiety. Nie dodano zaleznosci, nie zmieniono `pyproject.toml` ani
lockfile; procedura audytu i licencji dla nowego pakietu nie zostala uruchomiona,
bo pakiet nie jest potrzebny.

## Izolacja

- `settings` nadal jest funkcyjny i oparty o `tmp_path`, wiec kazdy test dostaje
  osobny `workspace_dir` oraz `cache_dir`.
- `composition` kopiuje niezmienny plik wzorcowy do `settings.database_path`,
  czyli do prywatnego `workspace/project.db` konkretnego testu.
- Szablon jest tylko zrodlem kopiowania; testy nie otwieraja go jako swojej bazy.
- Testy korzystajace bezposrednio z `settings`, w szczegolnosci caly modul
  migracji, dostaja pusty workspace i nie uruchamiaja fixture szablonu.

## Pelna bramka

Pierwsze `scripts/check.ps1` w nowym worktree zatrzymalo sie przed bramkami z
powodu braku ignorowanego `.env`. Po utworzeniu tymczasowej kopii
`.env.example` drugi przebieg potwierdzil backend, ale zatrzymal sie na
frontendowym typechecku, poniewaz checkout nie mial `frontend/node_modules`.
`npm ci` zainstalowalo 128 pakietow zgodnie z lockfile; audit 129 pakietow
zglosil 0 podatnosci. Tymczasowy `.env` zostal usuniety po weryfikacji.

Finalne `scripts/check.ps1` zakonczylo sie `PASS 9/9`:

| Bramka | Dowod |
| --- | --- |
| Ruff format | 231 plikow, bez zmian formatowania |
| Ruff lint | 0 bledow |
| mypy | 96 plikow, 0 problemow |
| pytest | 293 zebrane, 293 zielone w 278,29 s; gate 284,8 s |
| Frontend typecheck | 0 bledow |
| Vitest | 33/33 pliki, 439/439 testow |
| Build | 295 modulow; main 497,65 kB/gzip 152,63; exports 8,37 kB/gzip 3,12 |
| Playwright | 4/4 w 1,3 min |
| E2E root safety | 2/2 |

Wczesniejszy pelny backendowy przebieg po zmianie byl rowniez zielony 293/293
w 277,18 s. Dwa niezalezne pelne pomiary po optymalizacji roznia sie o 1,11 s,
co potwierdza powtarzalnosc wyniku.
