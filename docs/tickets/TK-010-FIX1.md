# TK-010-FIX1 — przywrócić prawdziwy start aplikacji w testach

Status: GOTOWY

## Powód

Niezależny zimny review potwierdził wynik TK-010 i wszystkie punkty poza jednym:
pełny suite 293/293 w 268,27 s, testy migracyjne nadal przechodzą prawdziwe
`0001→0005` z pełnym downgrade i re-upgrade, izolacja i niezależność od
kolejności potwierdzone, szablon nietykalny, README i RUNBOOK prawdziwe.

Werdykt `REVISE` dotyczy jednej rzeczy: fixture `composition` podmienia
produkcyjne `upgrade_database` na no-op przez `monkeypatch`.

Rozstrzyga pomiar, nie opinia. Na skopiowanej bazie, która jest już na `head`,
prawdziwe `upgrade_database` kosztuje średnio **14,3 ms** (mediana 13,4 ms,
12 prób). Całe `build_composition` to 160,4 ms z prawdziwym wywołaniem wobec
144,5 ms z no-opem — różnica 15,9 ms. Patch obejmuje 163 z 293 zebranych
przypadków, więc oszczędza około **2,6 s** na suicie trwającym 268 s.

Za ten jeden procent 163 testy przestają przechodzić realną ścieżkę
`build_composition → upgrade_database`, w tym
`test_full_composition_root_builds_without_server`. Osobne testy migracyjne tego
nie zastępują, bo sprawdzają migracje, a nie integrację startu aplikacji.

Review: `artifacts/tk-010-faster-backend-gate-cold-review/index.md`.

## Zakres

1. Usuń `monkeypatch.setattr(composition_module, "upgrade_database", ...)`
   oraz funkcję `_database_already_upgraded` z `backend/tests/conftest.py`.
   Zbędne stają się też importy dodane wyłącznie dla tej podmiany.
2. Zachowaj resztę bez zmian: sesyjny `migrated_database_template`,
   `shutil.copy2` do prywatnej ścieżki testu i pominięcie szablonu przez
   `test_migrations.py`. To one dają cały zysk.
3. Zaktualizuj `docs/tickets/TK-010/log.md` o zmierzone liczby z review
   i o powód wycofania podmiany, żeby nikt nie wprowadził jej ponownie
   jako „oczywistej” optymalizacji.

## Poza zakresem

- `pytest-xdist` — pozostaje niewprowadzony, decyzja bez zmian;
- jakakolwiek zmiana kodu produkcyjnego;
- dalsze skracanie bramki.

## Done Criteria

- Fixture `composition` wywołuje prawdziwe `upgrade_database` przez
  `build_composition`.
- Pełny `pytest`: 293 zebrane, 293 zielone; podaj zmierzony czas — oczekiwany
  wzrost rzędu kilku sekund, nie minut.
- `scripts/check.ps1` przechodzi w całości jednym przebiegiem.
- README i RUNBOOK nadal podają realny czas; popraw, jeśli się rozjechał.
- `git status` czysty, bez push i merge.
