# FE-031 — log wykonania

## Diagnoza (2026-11-25)

- Brak jakiejkolwiek ścieżki usuwania runu: `backend/app/api/runs.py` ma tylko create/list/start/pause/resume/cancel/complete/get/frames.
- Wszystko, co pochodzi z runu, wisi na `pipeline_runs` przez `ON DELETE CASCADE`: `frames`, `stage_checkpoints`, `exports`, a przez `frames` — `region_samples` → `ocr_observations` oraz `annotations` (FK `category_id` RESTRICT nie przeszkadza: anotacje schodzą razem z klatkami). Modele nie mają `relationship()`, więc kasuje baza (`PRAGMA foreign_keys=ON` w `database.py`).
- Pliki runu: wyłącznie `runs/<run_id>/` (`frames/`, `regions/`, `checkpoints/`); eksportu: `exports/<export_id>` i staging `.<export_id>-*`.
- Workspace użytkownika (`D:/DatasetFactory/workspace`) przed zmianą: 3 katalogi runów, każdy z wierszem w bazie; brak eksportów — sprzątanie przy starcie nie ma tam nic do usunięcia.
- Lista runów nie znała `version`, a mutacje runu są wersjonowane — `GET /runs` dostaje `version`.

## Decyzje

- Run „w toku” = `status='running'` albo zajęty `workflow_slot` / `resume_token` (rezerwacja wznowienia) → `409 run_in_progress`; dodatkowo zbiór `_processing` w `DatasetWorkflow` (osobny zamek — `_submit` trzyma `_lock`, a executor testowy uruchamia zadanie w miejscu) pokrywa chwilę między commitem `paused`/`cancelled`/`failed` przez workera a powrotem jego zadania.
- `queued` jest usuwalny (bez workera i plików). Eksport `queued`/`running` → `409 export_running` (pisze pliki z klatek runu).
- Pliki po commicie, z ponowieniem (5 × 0,2 s); pozostałości → ostrzeżenie `run_files_left_behind` w logu i sprzątanie przy starcie (tylko nazwy-UUID bez wiersza).

## Design Plan (2026-11-25, przed zmianą `frontend/src/`)

Przeczytane: `AGENTS.md`, `frontend/src/AGENTS.md`, `.agent/guidelines/new-component.md` (2.1, 2.2, 4, 5 — Button, UiStates, Notice), `frontend/src/styles/tokens.css`, `RunListScreen.css`, `Dialog.tsx`/`Dialog.css`, użycia `Dialog` w `ProfileWorkspaceScreen.tsx` (Save as — wzorzec Cancel + akcja z `loading`).

### Elementy interfejsu

1. **Akcje wiersza runu** — `Delete` (`Button variant="secondary"`) przed `Open review` (`primary`), w istniejącym `.df-run-list__actions` (flex, `gap: var(--size-xs)`, do prawej; pod `md` do lewej). Dla `running` przycisk wyłączony (`--opacity-disabled` z `Button`) z podpowiedzią `title`.
2. **Okno potwierdzenia** — `Dialog` „Delete run”: opis z nazwą profilu, id runu i liczbą klatek oraz tym, co zostaje (wideo, profil). Akcje: `Cancel` (`secondary`), `Delete run` (`primary`, `loading`, „Deleting the run…”). Błąd mutacji w treści okna przez `InlineError` (`role=alert`, `describeApiError`). Escape / Cancel zamykają, gdy nic nie jest w toku.

### Checklista

- [x] Layout/Siatka: bez nowych reguł; odstęp akcji `--size-xs` (SPACING-\*), okno z `Dialog.css`.
- [x] Typografia: bez zmian (Button `--font-size-sm` / `--line-height-standard`).
- [x] Kolory: bez nowych; brak wariantu „danger” w `Button` — nie dodaję, destrukcyjność niesie okno potwierdzenia (COLOR-\*).
- [x] Obramowania: `secondary` = `--color-stroke-weak-default` (BORDER-\*), promień z `Button`.
- [x] Cienie: tylko istniejący cień `Dialog`.
- [x] Interakcje: hover/active/focus/disabled/loading z `Button` (COLOR-07, OPACITY-\*).
- [x] Komponenty: `Button`, `Dialog`, `InlineError` — nowych nie ma.
