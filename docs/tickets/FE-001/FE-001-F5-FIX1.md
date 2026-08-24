# FE-001-F5-FIX1 — trwały eksport i rzeczywisty Gate 3 E2E

Status: GOTOWY

## Powód

Niezależny cold review FE-001-F5 zakończył się werdyktem `REVISE`. Główny
ekran i TK-009 są zgodne z produktem, ale trwały eksport staje się
nieodtwarzalny po utracie lokalnego stanu React, a zadeklarowany pionowy test
Playwright symuluje backend zamiast uruchamiać rzeczywisty composition root z
deterministycznym stubem OCR.

Review: `artifacts/fe-001-f5-tk-009-cold-review/index.md`.

## Zakres

### F1 — trwały locator i odzyskiwanie eksportu

1. `export_id` ma żyć w URL `/exports` jako kontrolowany query parameter.
   Utworzenie eksportu aktualizuje URL; reload i bezpośrednie wejście z tym URL
   hydratują stan przez `GET /exports/{id}`, a `run_id` pochodzi z odpowiedzi
   eksportu i uruchamia autorytatywny `GET /runs/{id}`.
2. Dodaj minimalny read-only lookup najnowszego eksportu runu, aby ekran
   `/exports` bez znanego `export_id` mógł odzyskać eksport `running`,
   `completed` albo `failed` zamiast wysyłać zbędny POST. Preferowany kontrakt:
   `GET /exports/latest?run_id={id}` → `200 Export | null`; statyczna trasa musi
   być zadeklarowana przed `/{export_id}`. Wybór innego równoważnego lookupu
   wymaga zapisania technicznego odstępstwa i zachowania tego samego produktu.
3. Lookup nie tworzy historii/listy w UI i nie zmienia immutable snapshotu.
   Kolejność „najnowszy” jest deterministyczna (`created_at`, potem `id`).
4. Pokryj testami: reload podczas `running`, reload po `completed`, wejście bez
   query z odzyskaniem latest, brak eksportu → poprawny empty/start state,
   błędne/obce `export_id`, oraz brak kolejnego POST przy odzyskiwaniu.

### F2 — prawdziwy pionowy Playwright

1. `vertical-flow.spec.ts` ma uruchamiać realny FastAPI/composition root i
   rzeczywiste repozytoria/SQLite/workspace, a frontend ma wysyłać normalne
   żądania HTTP. Nie wolno przechwytywać całego `/api/v1/**` ani implementować
   fazowej maszyny lifecycle w TypeScript.
2. Użyj repozytoryjnego
   `backend/tests/fixtures/video/synthetic-hud.mkv` i deterministycznego,
   test-only `OcrEngine` stub wstrzykniętego po backendowej stronie. Dopuszczony
   jest test-only bootstrap/composition module; nie może zmieniać produkcyjnego
   zachowania ani duplikować reguł biznesowych.
3. Test ma przejść produkcyjnymi ekranami i rzeczywistymi granicami API przez:
   profil/reference preview, import fixture, create/start i polling runu,
   review, eksport/polling, manifest oraz jawny CAS complete. Asercje requestów
   pozostają dodatkowym dowodem, nie zastępują odpowiedzi backendu.
4. Lekki route harness może pozostać wyłącznie dla izolowanych screenshotów i
   wymuszania loading/empty/error, bez nazywania go pionowym E2E.

### F3 — ścieżki, screenshot i reprodukowalny browser cache

1. `safeWorkspaceRelativePath` odrzuca każdy URI scheme pasujący do
   `^[A-Za-z][A-Za-z0-9+.-]*:` przed normalizacją. Dodaj przypadki `http`,
   `https`, `file` i `data`, zachowując segmentową kontrolę `..`.
2. Zwykłe `npm run e2e` i komenda instalacji przeglądarki muszą automatycznie
   używać cache na `D:\DatasetFactory\cache` (lub `DATASETFACTORY_CACHE_ROOT`)
   bez ręcznego ustawiania `PLAYWRIGHT_BROWSERS_PATH`. Użyj repozytoryjnego,
   cross-platform launchera; bez nowych zależności tylko do ustawienia env.
3. `exports-1440.png` ma naprawdę przedstawiać deklarowany ukończony manifest.
   Przypnij asercję tego stanu bezpośrednio przed screenshotem, zregeneruj osiem
   plików i wizualnie sprawdź wynik. Test nie może tracić stanu podczas resize,
   remountu ani zmiany focusu.
4. Browser focus QA ma mieć checkpoint konkretnej kontrolki na każdej z pięciu
   tras (plus widoczny focus), a nie tylko pierwszy wspólny element shell.
   Deklaracje w logu muszą odpowiadać dokładnie temu, co test sprawdza.

## Poza zakresem

- historia/lista wszystkich eksportów, usuwanie lub pobieranie eksportów;
- train/val, YOLO, eksport przyrostowy;
- zmiana semantyki TK-009, automatyczne zamykanie runu;
- produkcyjny mock OCR lub testowa logika w runtime aplikacji.

## Done Criteria

- Design Plan addendum FIX1 trafia do `docs/tickets/FE-001/log.md` przed kodem.
- Targeted testy backendu lookupu i TK-009 są zielone; nowe API jest dopisane
  do `TECH_PLAN §5`, klienta typowanego, coverage i architecture tests.
- Testy frontendu dowodzą URL hydration/latest recovery oraz odrzucenia URI.
- Czyste `npm run e2e -- vertical-flow.spec.ts` uruchamia realny backend i
  przechodzi bez ręcznych env; `visual-qa.spec.ts` także przechodzi.
- Osiem screenshotów 1440 odpowiada scenariuszom; brak overflow przy 1280/1440,
  unresolved CSS variables i zewnętrznych font fetchy.
- Pełny Vitest, architecture test, typecheck, build i audit są zielone.
- Backend: ruff, mypy strict oraz pełny pytest są zielone, ponieważ FIX1 dodaje
  nowy endpoint i testowy composition bootstrap.
- `git diff --check` czysty, worktree czysty; bez push/merge.

