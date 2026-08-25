# FE-001-F5-FIX4 — trwały focus ring w dowodach i uczciwy alarm geometrii

Status: GOTOWY

## Powód

Niezależny re-review FIX3 potwierdził domknięcie per-field baseline sync oraz
`{runId,status}`, ale odtworzył i zdiagnozował drift dowodów zgłoszony przez
wykonawcę.

Drugi combined `npm run e2e` bez resetu dał 2/2 zielone, a mimo to zapisał inny
`materials-1440.png`: 7/8 hashy zgodnych z HEAD i brudny worktree. Dekodowanie
pokazuje 2839 różnych pikseli, z czego 2347 to dokładnie prostokąt focus ringu
pola `Ścieżka pliku wideo` (x333..901, y484..531) zamieniony z brand
`(239,142,77)` na tło `(32,34,39)`. Alternatywny PNG traci cały ring.

To nie jest kompresja ani ogólny drift rasteryzacji. `assertKeyboardFocus`
ustawia `data-visual-qa-focus="true"` bezpośrednio na węźle DOM, a `freezeMotion`
przypina do tego atrybutu outline. Ten atrybut nie jest częścią stanu Reacta,
więc dowolny re-render kontrolki między asercją a `page.screenshot` go usuwa.
Trasa `materials` działa w fazie `review`, więc odświeżenie zapytania w tym oknie
czasowym jest realne — dlatego drift występuje niedeterministycznie i tylko przy
kolejności combined, a isolated visual jest stabilny.

Zielony test zapisujący inny tracked dowód i brudzący worktree blokuje akceptację
F5. Kryterium F3 z FIX2 ma obowiązywać dla komendy, którą realnie się uruchamia.

Review: `artifacts/fe-001-f5-fix3-independent-rereview/index.md`.

## Zakres

### F1 — dowód focusu odporny na re-render

1. Przypięcie widocznego focus ringu nie może zależeć od atrybutu DOM
   ustawianego imperatywnie na węźle zarządzanym przez Reacta. Zastosuj
   mechanizm, który przeżywa re-render kontrolki — na przykład regułę
   w arkuszu celującą w stabilny selektor elementu zamiast mutacji węzła.
2. Bezpośrednio przed `page.screenshot` zweryfikuj ponownie, że element
   checkpointu nadal jest `document.activeElement` i że jego ring jest
   faktycznie widoczny w warstwie prezentacji. Weryfikacja odbywa się po
   `beforeScreenshot`, nie kilka kroków wcześniej.
3. Utrata focusu albo ringu w tym oknie ma zakończyć test błędem z czytelnym
   komunikatem. Nigdy nie wolno cicho zapisać PNG bez ringu.
4. Zmiana dotyczy wyłącznie harnessu dowodowego. Nie wolno zmieniać
   produkcyjnych tokenów, stylów focusu ani `deterministicPng`.

### F2 — alarm geometrii kasowany tylko po realnej naprawie

1. `syncAnnotationFormState` nie może kasować istniejącego `geometryError`
   tylko dlatego, że jakieś czyste pole przyjęło wartość serwera.
2. Gdy alarm istnieje, po synchronizacji przeparsuj wynikowy `nextDraft`
   i wyczyść alarm wyłącznie wtedy, gdy geometria jest już poprawna.
   Jeśli nadal jest błędna, alarm zostaje — także wtedy, gdy przyczyną jest
   zachowane dirty pole puste, nieparsowalne albo poza granicami.
3. Regresja: dirty `width=""` z aktywnym alarmem, serwer zmienia wyłącznie
   czyste `y`. Po synchronizacji `y` jest świeże, `width` nadal puste,
   a alarm nadal widoczny.

## Poza zakresem

- produkcyjne style focusu, tokeny, `deterministicPng`, runtime E2E,
  właścicielstwo leaf i normalizer PNG;
- durable export locator, COCO, TK-009, product copy;
- zmiana treści ośmiu screenshotów — poza `materials`, jeśli poprawka F1
  faktycznie zmienia jego zawartość, co trzeba wtedy jawnie uzasadnić;
- alarm per pole zamiast per wiersz;
- rezygnacja z combined `npm run e2e` na rzecz osobnych komend. Determinizm
  ma dotyczyć komendy, która jest bramką.

## Done Criteria

- Addendum FIX4 w `docs/tickets/FE-001/log.md` powstaje przed kodem.
- Trzy kolejne plain `npm run e2e` bez resetu między nimi: każdy zielony,
  po każdym osiem SHA-256 identycznych i `git status` czysty. Podaj hashe
  po każdym przebiegu, nie tylko po ostatnim.
- Celowy negatywny dowód: przy wymuszonej utracie focusu przed screenshotem
  test failuje zamiast zapisać PNG bez ringu.
- Targeted testy annotations, w tym nowa regresja alarmu, są zielone.
- Pełny frontend Vitest + architecture, typecheck, build i audit są zielone.
- Backend nietknięty; 290/290 dziedziczone przy pustym
  `git diff --stat 9362869..HEAD -- backend/app`.
- `git diff --check 178bd68..HEAD` i końcowy `git status` czyste;
  bez push/merge.
