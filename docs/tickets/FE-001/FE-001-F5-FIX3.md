# FE-001-F5-FIX3 — świeże dane serwera w nietkniętych polach anotacji

Status: WYKONANY (2026-08-25) — DOMKNIĘTY PRZEZ FIX4

## Powód

Niezależny acceptance review FIX2 potwierdził bezpieczny runtime E2E, deterministyczne
screenshoty i brak remountu edytora, ale wykrył regresję wprowadzoną razem ze
stabilizacją klucza wiersza anotacji.

`AnnotationRow` inicjalizuje `draft` i `categoryId` wyłącznie przy mount. Po zmianie
klucza z `${annotation.id}:${annotation.version}` na `annotation.id` wiersz nie jest
już remountowany, więc pola, których użytkownik nie dotknął, nigdy nie przyjmują
świeżych wartości serwera. Nagłówek pokazuje nowe `x/y/width/height`, a kontrolki
stare. Callback zapisu dostaje aktualny obiekt `annotation` z nową wersją, więc CAS
przechodzi bez konfliktu i cicho cofa zmianę serwera.

To jest utrata danych, nie kosmetyka: wystarczy jeden autorytatywny refetch po
przejściu runu do stanu terminalnego i kliknięcie `Zapisz geometrię` albo
`Zapisz klasę`.

Review: `artifacts/fe-001-f5-fix2-independent-acceptance-review/index.md`.

## Zakres

### F1 — synchronizacja baseline przy zachowaniu dirty draftów

1. `AnnotationRow` ma trzymać baseline wartości serwera obok lokalnego draftu.
   Kiedy przychodzi nowa wersja anotacji, każde pole nietknięte przez użytkownika
   przyjmuje wartość serwera; pole z niezapisaną zmianą pozostaje nietknięte.
2. Dirty liczy się per pole, nie per wiersz: `x`, `y`, `width`, `height` i klasa
   są niezależne. Zmiana samego `x` nie może zamrozić `y` na starej wartości.
3. Pole wraca do stanu czystego, gdy jego draft znów jest równy baseline —
   ręczne cofnięcie edycji przywraca podążanie za serwerem.
4. Zapis wysyła to, co widać w kontrolce. Nie wolno wysyłać wartości, której
   użytkownik nie widzi.
5. Bez remountu wiersza: klucz zostaje `annotation.id`. Selection, tryb redraw
   i szkic nowego bboxa nadal przeżywają przyjście świeżych danych.
6. `geometryError` po synchronizacji baseline nie może zostać jako fałszywy alarm
   dotyczący wartości, której już nie ma w polu.

### F2 — powiązanie detekcji przejścia z runem

1. `previousRunStatus` w `AnnotationReviewScreen` ma być związany z `runId`
   (para `{runId, status}` albo reset przy zmianie runu). Powrót z runu `running`
   do zcache'owanego terminalnego runu nie może być czytany jako przejście.
2. Pierwszy render runu, który jest już terminalny, nadal nie robi refetchu.

### F3 — regresje

1. Test: serwer zmienia `y` i klasę anotacji, użytkownik ma dirty `x`.
   Po refetchu widoczne są nowe `y` i nowa klasa, `x` zostaje przy wartości
   użytkownika, a `Zapisz geometrię` wysyła nowe `y` razem z lokalnym `x`.
2. Test: żadnego dirty pola, serwer zmienia geometrię — wszystkie cztery pola
   i klasa podążają za serwerem.
3. Test: ręczne cofnięcie edycji do wartości baseline przywraca podążanie
   za kolejną zmianą serwera.
4. Test: nawigacja `running` → terminalny run nie generuje dodatkowej pary
   refetchów.
5. Istniejąca regresja `annotationTerminalRefresh` zostaje i nadal dowodzi
   braku refetch stormu.

## Poza zakresem

- optimistic update, kolejkowanie zapisów, rozwiązywanie konfliktów CAS w UI;
- resetowanie dirty draftów po zapisie innego pola;
- zmiany durable export locator, COCO, TK-009, product copy;
- runtime E2E, normalizer PNG i screenshoty — FIX2 domknięty, nie ruszaj;
- nowy common component ani zmiana tokenów.

## Done Criteria

- Addendum FIX3 w `docs/tickets/FE-001/log.md` powstaje przed kodem.
- Targeted testy annotations, w tym cztery nowe regresje, są zielone.
- Pełny frontend Vitest + architecture, typecheck, build i audit są zielone.
- Plain `npm run e2e` przechodzi; osiem PNG ma niezmienione hashe względem HEAD
  FIX2 albo zmiana jest jawnie uzasadniona w logu.
- Backend nietknięty; pełne 290/290 dziedziczone, o ile `backend/app` bez zmian.
- `git diff --check 178bd68..HEAD` i końcowy `git status` czyste; bez push/merge.
