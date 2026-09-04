# FE-008-FIX1 — jawny wybór klasy i izolacja stanu anotacji

Status: GOTOWY

## Powód

Niezależny cold review FE-008 zakończył się `CHANGES REQUESTED` z dwoma
findingami P1. Pełny zapis znajduje się w artefakcie
`artifacts/fe-008-independent-cold-review/index.md`.

Oba findingi naruszają tę samą gwarancję produktu: do datasetu nie może trafić
klasa lub geometria, której użytkownik jawnie nie wybrał dla zapisywanego boxa.

### P1-A — pusty Enter obchodzi jawny wybór

Filtr w `GroupedOptionList` dostaje fokus po utworzeniu nowego boxa. Mimo że
filtr jest pusty, nic nie jest wybrane, a przycisk `Zapisz klasę` jest
nieaktywny, `Enter` aktywuje pierwszy wewnętrznie aktywny wiersz i od razu
wywołuje zapis. Recenzent odtworzył przejście: pusty filtr → `Enter` → wybrana
klasa `Score` → `POST`.

### P1-B — brudny formularz przechodzi na inną anotację

Przy zmianie `annotation.id` ten sam egzemplarz `AnnotationPopover` zachowuje
lokalny `FormState`. Niezapisana klasa albo geometria anotacji A może więc
zostać wyświetlona i zapisana do anotacji B. Recenzent odtworzył: niezapisane
`Health` na `ann-1` → przełączenie na `ann-2` → zapis `Health` do `ann-2`.

## Zakres

### F1 — pusty Enter nie wybiera i nie zapisuje

1. `Enter` w pustym, auto-focusowanym filtrze bez jawnie wskazanego wiersza nie
   może wywołać ani `onChange`, ani `onConfirm`.
2. Nawigacja klawiaturą pozostaje użyteczna: po jawnym przejściu fokusu do
   wiersza strzałką `Enter`/`Space` nadal wybiera opcję zgodnie z kontraktem.
3. Jeżeli implementacja zachowuje skrót potwierdzania wyniku filtrowania,
   warunek musi być jednoznaczny i widoczny dla użytkownika; nie wolno opierać
   zapisu wyłącznie na ukrytym `activeId` pierwszego wyniku.
4. Świeży box nadal startuje bez klasy, a jedyną drogą do `POST` jest jawny
   wybór klasy oraz świadome potwierdzenie.

### F2 — zmiana annotation.id resetuje cały formularz

1. Przy zmianie `annotation.id` z A na B klasa, geometria, filtr i wszystkie
   dirty flags muszą zostać zainicjalizowane z B.
2. Obecne zachowanie dla refetchu lub zmiany wersji tej samej anotacji zostaje:
   czyste pola mogą się zsynchronizować, a lokalne niezapisane pola tej samej
   anotacji nie powinny być bez powodu tracone.
3. Preferowane najmniejsze rozwiązanie to klucz na całym `AnnotationPopover`
   w call-site (`key={popoverAnnotation.id}`), o ile testy potwierdzą oba
   zachowania. Nie komplikuj `syncFormState`, jeśli remount rozwiązuje granicę
   tożsamości poprawnie.

## Testy regresyjne

1. Świeży box, pusty filtr, disabled `Zapisz klasę`, `Enter`: zero wyboru,
   zero `onConfirm` i zero `POST`.
2. Po przejściu strzałką z filtra na widoczny wiersz `Enter` nadal wybiera
   jawnie fokusowaną klasę; sam fokus nie może jeszcze zapisać boxa, jeśli
   interfejs wymaga osobnego potwierdzenia.
3. Anotacja A z niezapisanymi zmianami klasy i geometrii → przełączenie na B
   bez pointerdown: formularz pokazuje dane B; zapis mutuje B wyłącznie danymi B.
4. Refetch tej samej anotacji nie regresuje istniejącej polityki dirty/clean.
5. Retest outside-dismiss i rozpoczęcia nowego boxa jednym gestem, aby fix nie
   naruszył zaakceptowanej części FE-008.

## Poza zakresem

- dalsze zmiany grupowania, tri-state, filtrowania lub atomowego
  `scope: categories`;
- przywracanie obsługi `Escape`;
- FE-007 i dodawanie semantycznych klas gry;
- backend, poza testami wymaganymi do wykazania braku niezamierzonego `POST`.

## Done Criteria

- Obie sondy z cold review przestają odtwarzać błąd.
- Nowe testy regresyjne czerwienieją po cofnięciu właściwego fixu.
- Wszystkie ukierunkowane testy FE-008 przechodzą.
- Pełny `scripts/check.ps1` przechodzi jednym nieprzerwanym przebiegiem; jeśli
  porty 8000/5173 są potrzebne, wykonawca prosi o ich zwolnienie przed bramką.
- Ticket i wynik fixupu są zapisane w dokumentacji, `git status` jest czysty,
  bez push i merge.
