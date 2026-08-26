# TK-006-T2-FIX1 — realny dowód braku duplikatów i szczelny scenariusz negatywny

Status: WYKONANY

## Powód

Niezależny zimny review potwierdził, że restart jest prawdziwy — `SIGKILL`
potomnego procesu, nowy PID, ten sam runtime root, SQLite i workspace, brak
resetu po stronie klienta i brak maszyny lifecycle w TypeScript. Kontroler na
porcie 8001 ma wyłącznie `POST /restart` i nie mockuje FastAPI.

Werdykt `REVISE` dotyczy trzech rzeczy, z czego dwie są krytyczne.

Review: `artifacts/tk-006-t2-independent-cold-review/index.md`.

## Zakres

### F1 — niedeterminizm odtworzony na żywo

Trzeci z trzech wymaganych plain `npm run e2e` padł 3/4. Ślad jest jednoznaczny:
`POST` nowego runu vertical zwrócił `201 queued` z identyfikatorem `1df87099…`,
ale wcześniej rozpoczęty `GET /dashboard` zakończył się później i nadpisał cache
starszym runem `40644128…` w stanie `cancelled`. UI pokazało `Wznów`, a asercja
na `Uruchom` wypadła po timeoucie.

Przyczyną jest cleanup zostawiający anulowane runy we wspólnej bazie
(`negative-flow.spec.ts:49-63,165-172,198-202`, `vertical-flow.spec.ts:121-123`).

1. Test ma poczekać na zakończenie początkowego zapytania dashboardu i
   potwierdzić identyfikator nowo utworzonego runu, zamiast zakładać, że cache
   jest już aktualny. Alternatywnie odizoluj stan między scenariuszami.
2. Nie maskuj tego retry ani dłuższym timeoutem. Wyścig ma zniknąć, nie zostać
   przeczekany.
3. Dowód: trzy kolejne plain `npm run e2e` bez resetu, wszystkie zielone,
   z liczbami po każdym.

### F2 — brak duplikatów nie jest udowodniony

To jest sedno ticketu i dziś przechodzi trywialnie.

Fixture trwa 1,000 s przy interwale 1000 ms, więc powstaje dokładnie jedna
klatka. Marker w `e2e_server.py:46-57` zatrzymuje wewnątrz `detect_characters`,
czyli **przed** manifestem OCR i `commit_ocr`. W chwili zabicia procesu trwały
stan to bezpieczne `cropped`, bez obserwacji i bez anotacji OCR. Poprawna
implementacja i trywialne powtórzenie jedynej niedokończonej klatki dają ten sam
wynik `1 frame / 1 annotation / 0 exports`, więc asercje nie odróżniają
odporności od jej braku.

1. Materiał ma dawać co najmniej dwie klatki — wystarczy zmiana interwału
   próbkowania, nie podmieniaj fixture wideo.
2. Zabicie procesu ma nastąpić na OCR **drugiej** klatki, po trwałym ukończeniu
   pierwszej.
3. Asercje po wznowieniu obejmują: niezmienione identyfikatory i checkpointy
   pierwszej klatki, dokładną liczbę obserwacji i anotacji dla obu klatek oraz
   brak powtórzonego przetworzenia klatki już ukończonej.
4. Mocniejszy wariant, jeśli okaże się osiągalny deterministycznie: okno po
   opublikowaniu manifestu OCR, a przed commitem do bazy. Jeśli go zrobisz,
   opisz w logu, dlaczego jest deterministyczny.

### F3 — drugi test double backendu

`ControllableE2eWorkspace` (`e2e_server.py:63-73,122-125`) prywatnie przepina
`system_status._workspace`, a marker zwraca `False` bez wykonania produkcyjnego
`Workspace.check_writable()`. Reszta composition nadal używa zdrowego workspace,
więc `negative-flow.spec.ts:174-197` sprawdza mapowanie sztucznego statusu na
`503` i copy, a nie realną awarię systemu plików. To łamie kontrakt, w którym
jedynym stubem backendu jest `DeterministicE2eOcrEngine`.

1. Usuń `ControllableE2eWorkspace` i prywatne przepinanie atrybutu.
2. Wywołaj warunek realnie — katalog bez prawa zapisu dla procesu, ścieżka
   nieistniejąca albo inny mechanizm, który faktycznie przewraca
   `check_writable()`. Warunek ma być odwracalny i posprzątany w `finally`.
3. Jeśli na Windowsie bez uprawnień administratora nie da się tego zrobić
   deterministycznie, **nie udawaj** — zgłoś mi to wiadomością i poczekaj na
   decyzję. Wtedy rozważymy wycięcie tego przypadku z zakresu zamiast trzymania
   testu, który sprawdza własną atrapę.

`404 source_missing` i `409 active_run` zostały uznane za wywołane realistycznie,
z asercjami na kod i polskie copy — nie ruszaj ich.

## Poza zakresem

- mechanizm restartu i kontroler 8001 — potwierdzone przez review;
- zmiany w kodzie produkcyjnym, `check.ps1`, `dev.ps1`, normalizerze PNG
  i screenshotach;
- T3 i T4.

## Done Criteria

- Trzy kolejne plain `npm run e2e` bez resetu i bez retry: wszystkie zielone,
  osiem hashy identycznych z `main`, `git status` czysty po każdym.
- Dowód braku duplikatów oparty na co najmniej dwóch klatkach, z zabiciem
  procesu na drugiej i asercjami na identyfikatory, checkpointy oraz dokładne
  liczby obserwacji i anotacji.
- Jedynym stubem backendu jest `DeterministicE2eOcrEngine`; brak prywatnego
  przepinania atrybutów composition.
- Scenariusz `503` opiera się na realnym warunku systemu plików albo został
  jawnie wycięty po mojej decyzji.
- `check.ps1` przechodzi w całości jednym przebiegiem.
- `git diff --check e4aa86b..HEAD` i końcowy `git status` czyste; bez push.
