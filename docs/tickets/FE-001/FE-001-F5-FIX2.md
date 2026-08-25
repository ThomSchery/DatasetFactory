# FE-001-F5-FIX2 — bezpieczne odświeżanie edytora i deterministyczny E2E

Status: GOTOWY

## Powód

Niezależny re-review FIX1 potwierdził durable recovery i realny vertical flow,
ale wykrył utratę lokalnych draftów przy przejściu runu do `review_ready`,
zbyt szeroki destrukcyjny root bootstrapu E2E oraz dwa mniejsze rozjazdy dowodów.

Review: `artifacts/fe-001-f5-fix1-independent-rereview/index.md`.

## Zakres

### F1 — odświeżenie danych bez remountu edytora

1. Usuń `run.status` z React `key` komponentu `FrameEditor`. Zmiana statusu
   runu nie może kasować selection, redraw, nowego bbox ani draftów pól anotacji.
2. Przy przejściu do stanu terminalnego odśwież autorytatywnie listę klatek oraz
   aktywne query szczegółu zaznaczonej klatki przez query client/refetch, bez
   optimistic update i bez remountu całego edytora.
3. Dodaj regresję: podczas `running` użytkownik zmienia lokalny draft; backend
   przechodzi do `review_ready` i zwraca świeże dane/nową anotację; dane serwera
   pojawiają się, a niezapisany draft, selection i tryb redraw pozostają.
   Potwierdź też brak refetch storm.

### F2 — bezpieczny i przenośny runtime E2E

1. Backend testowy nie może wykonywać `rmtree` dla dowolnej ścieżki z env.
   Launcher tworzy unikalny leaf pod zweryfikowanym
   `<DATASETFACTORY_CACHE_ROOT>/playwright/`, oznacza go markerem i przekazuje
   jako runtime root. Bootstrap akceptuje wyłącznie ten leaf/marker i nie usuwa
   szerokiego katalogu. Cleanup może dotknąć tylko katalogu utworzonego przez
   bieżący launcher.
2. Usuń twardy warunek dysku `D:` dla jawnego override cache. Domyślna ścieżka
   nadal ma być na `D:`, ale poprawnie skonfigurowany cache na innym wolumenie
   ma działać. Testuje się co najmniej odrzucenie `D:\playwright`, brak
   destrukcji obcego katalogu i akceptację unikalnego leaf pod custom cache.
3. Usuń `AvailableE2eResourceProbe`. Jedynym stubem backendowym vertical flow
   pozostaje deterministyczny `OcrEngine`; health/resource probe raportuje
   prawdziwy stan hosta. Skoryguj log tylko tam, gdzie dowód się zmienia.

### F3 — deterministyczne dowody

1. Wyłącz/zamroź animacje przy screenshot capture. Dwa kolejne uruchomienia
   visual QA bez zmiany kodu muszą dać identyczne osiem PNG i czysty worktree.
2. Usuń pustą linię EOF w FIX1 i zapewnij zielone
   `git diff --check 178bd68..HEAD`.
3. Addendum FIX2 i końcowy raport w `docs/tickets/FE-001/log.md` mają dokładnie
   opisać granice realnego E2E oraz bezpieczny cleanup.

## Poza zakresem

- zmiana durable export lookup/URL, COCO, TK-009 lub product copy;
- resetowanie dirty draftów po autorytatywnym refetchu;
- drugi mock backendu lub symulacja lifecycle w TypeScript;
- historia eksportów, train/val, YOLO.

## Done Criteria

- Addendum FIX2 w logu powstaje przed kodem.
- Targeted testy annotations/cache i E2E root safety są zielone.
- Plain vertical E2E przechodzi z realnym backendem i tylko OCR stubem.
- Visual QA przechodzi dwa razy, PNG mają identyczne hashe, worktree czysty.
- Pełny frontend Vitest + architecture, typecheck, build i audit są zielone.
- Backend targeted, ruff i mypy są zielone; wynik pełnego 290/290 z FIX1 może
  zostać odziedziczony, jeśli kod produkcyjnego backendu się nie zmieni.
- `git diff --check 178bd68..HEAD` i końcowy status są czyste; bez push/merge.
