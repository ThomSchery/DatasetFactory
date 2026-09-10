# FE-013 — tworzenie klasy z poziomu edytora

## Grounding i decyzje

- Ticket źródłowy: artefakt Traycer `fe-013-create-class-from-editor`; bazą jest
  `main` na `83d60ec`.
- Zakres: pojedyncze dodanie klasy z pickera w edytorze anotacji, bez usuwania
  i masowej edycji klas, bez zmiany kontraktu zapisu anotacji oraz bez zmian
  kanwy, zoomu i trybu ręki.
- Backend nie ma obecnie endpointu dodającego kategorię. Powstanie
  `POST /api/v1/profiles/{profile_id}/categories`, przyjmujący istniejący
  kontrakt `{ name, kind }` i zwracający utworzoną kategorię (`201`).
- `kind` w UI jest wyprowadzany bez pytania operatora:
  1. nazwa jest przycinana z białych znaków;
  2. pojedyncze `a-z` jest kanonizowane do `A-Z`;
  3. jeśli kanoniczna nazwa jest jednym znakiem z
     `-/0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ`, powstaje `character`;
  4. w przeciwnym razie powstaje `game` bez zmiany wielkości liter.

  Uzasadnienie: alfabet domenowy przechowuje znaki OCR wyłącznie w postaci
  wielkich liter. Odrzucenie `a` albo zapisanie go jako `game` przeczyłoby
  intencji filtra oraz pozwalałoby opisać ten sam znak dwiema rodzinami.
  Kanonizacja sprawia też, że istniejące `A` blokuje akcję dla zapytania `a`.
- Porównanie nazw przed pokazaniem akcji i w backendzie przycina brzegi oraz
  stosuje case-folding zgodny z istniejącym kreatorem profilu. Backend pozostaje
  źródłem prawdy dla pełnego Unicode.
- `ordinal` nada repozytorium w jednej transakcji zapisu SQLite:
  `BEGIN IMMEDIATE` → sprawdzenie profilu i duplikatu →
  `coalesce(max(ordinal), -1) + 1` → `INSERT`. Blokada `IMMEDIATE` serializuje
  konkurujące zapisy przed odczytem maksimum, więc dwa równoległe żądania nie
  wybiorą tego samego numeru. `max + 1`, w odróżnieniu od `count`, zachowuje
  kolejność także przy lukach i poprawnie odzyskuje końcowy wolny numer po
  usunięciu ostatniego wiersza.
- Utworzenie klasy i przypisanie jej do anotacji pozostają dwoma kolejnymi
  żądaniami. Błąd pierwszego zachowuje filtr i draft bboxa; żaden `Enter`
  w polu filtra nie uruchamia tworzenia.
- Akcja jest dostępna zarówno przy świeżym drafcie, jak i przy zmianie klasy
  istniejącej anotacji. Operator może odkryć brakującą klasę w obu sytuacjach;
  ograniczenie jej do draftu wymuszałoby usunięcie poprawianej anotacji,
  ponowne rysowanie i utratę jej historii wersji. W obu wariantach ryzyko
  przypadkowego utworzenia ogranicza ten sam jawny przycisk. Istniejąca anotacja
  zachowuje obecną ścieżkę PATCH z `expected_version`.

## Plan implementacji

1. Backend i kontrakt API
   - udostępnić walidację pojedynczej `CategoryDefinition` przez
     `DatasetDefinitionEngine`;
   - dodać repozytoryjne błędy duplikatu i zapisu oraz transakcyjne
     `ProfileRepository.add_category`;
   - zmapować w use case i routerze `404 profile_not_found`,
     `409 category_name_exists`, błędy domenowe `400` oraz błąd zapisu `500`;
   - dodać typy i klienta API frontendu oraz invalidację szczegółu profilu.
2. Interakcja w pickerze
   - rozszerzyć `GroupedOptionList` o obserwację wartości filtra i opcjonalny,
     jawny slot akcji bez zmiany istniejącej semantyki listbox/checkbox;
   - w `AnnotationPopover` pokazać `Utwórz i przypisz klasę „…”` wyłącznie dla
     niepustej, nieistniejącej po normalizacji nazwy;
   - podczas sekwencji obu żądań zablokować kontrolki i pokazać spinner;
     po błędzie utworzenia pokazać `InlineError`, zachować tekst i bbox;
   - po sukcesie odświeżyć profil, a nową klasę umieścić w grupie wynikającej
     z `kind`, po czym wykonać istniejącą mutację przypisania anotacji.
3. Testy
   - backend: ordinal po usunięciu końca, duplikat case/whitespace, ta sama nazwa
     w innym profilu, oba błędy `kind`, brak profilu i równoległe żądania;
   - frontend: widoczność akcji dla nowej nazwy i brak dla istniejącej niezależnie
     od case/whitespace, normalizacja `a → A`, dokładnie dwa żądania, zachowanie
     tekstu i draftu po błędzie, brak efektu pustego `Enter`, zachowanie wyboru
     pojedynczego wyniku `Enterem` i guard `data-shortcut-scope`;
   - regresja: testy geometrii FE-012 oraz kontrakty Space/zoom/pan pozostają
     nietknięte; pełna bramka `scripts/check.ps1` 9/9 bez SKIP;
   - Visual QA w 1440×900: akcja tworzenia widoczna w panelu, zrzut obejrzany
     w pełnej rozdzielczości. Jeśli in-app Browser jest niedostępny, użyć
     repozytoryjnego Playwrighta i nie przypisywać mu dowodu zachowań okna OS.

## Design Plan

Tryb powierzchni: **Operate**. Zachowujemy baseline `Home — Impeccable` i
istniejący dokowany `AnnotationPopover`; nie powstaje nowy świat wizualny ani
nowy komponent wspólny.

### Elementy interfejsu

1. Istniejący `TextField` „Klasa” — nadal autofocus, wartość filtra zachowana po
   błędzie, `maxLength=200`; `Enter` służy wyłącznie potwierdzeniu jednego
   widocznego istniejącego wyniku.
2. Istniejący `GroupedOptionList` — grupy „Znaki” i „Klasy gry”, przewijanie,
   roving tabindex oraz `data-shortcut-scope`; brak wyboru podążającego za
   fokusem.
3. Istniejący `Button`, wariant `secondary`, rozmiar `sm` — jawna akcja
   „Utwórz i przypisz klasę „…””; dostępna przez Tab i aktywowana natywnym
   Enter/Space, nigdy Enterem pola filtra.
4. Stan `Button.loading` i `disabled` — spinner i blokada ponownego wysłania
   podczas obu operacji.
5. Istniejący `InlineError` — błąd utworzenia/przypisania w obrębie popovera,
   bez zasłaniania kanwy i bez kasowania danych wejściowych.
6. Istniejący draft `RegionOverlay` — pozostaje widoczny i niezmieniony po
   błędzie; ten ticket nie zmienia jego geometrii ani gestów.
7. Istniejący `Button` „Zapisz klasę” — nadal zapisuje tylko zaznaczoną,
   istniejącą klasę; nie staje się ukrytym skrótem tworzenia.

### Checklista wytycznych UI/UX

- [x] Layout/Siatka: `--size-xs` dla relacji lista–akcja–błąd,
  `--control-height-sm` dla hit area; moduł „Siatka i Odstępy”,
  **GRID-01/02/05/08/10, SPACING-01/03/04/08/13**.
- [x] Typografia: dziedziczony `--font-family-ui`, przycisk i treść
  `--font-size-sm`, błąd pomocniczy `--font-size-xs`,
  `--font-weight-regular/semibold`, `--line-height-standard`; moduł
  „Typografia”, **TYPO-01/02/06/07/08/11, FONTSIZE-02/06/08/09/10,
  LHEIGHT-10/12, LSPACE-02, CASING-01/02**.
- [x] Kolory: tylko istniejące semantyczne tokeny Button/InlineError i tekstu;
  akcja nie używa koloru statusu; moduł „Stylizacja Elementów”,
  **COLOR-01/07/08/09/10**.
- [x] Obramowania: gotowy `Button` używa `stroke-strong`; lista pozostaje
  istniejącą powierzchnią, bez nowego dekoracyjnego obrysu; promień
  `--radius-sm`/`--radius-md`; moduł „Stylizacja Elementów”,
  **BORDER-02/03/05/06, BWIDTH-03/06/10/11/12/13, RADIUS-02/03/04/05**.
- [x] Cienie: bez nowego cienia — ciemna powierzchnia i akcja pozostają w jednej
  warstwie; moduł „Stylizacja Elementów”, **SHADOW-01/03/05**.
- [x] Interakcje: istniejące stany `hover`, `active`, `focus-visible`,
  `disabled=0.2`, `loading/aria-busy`; moduł „Stylizacja Elementów”,
  **COLOR-07, BORDER-06, OPACITY-01/02**.
- [x] Komponenty: używane gotowe `TextField`, `GroupedOptionList`, `Button`,
  `InlineError` i `RegionOverlay` z katalogu `common`; brak inline `<button>`
  i brak nowego komponentu wymagającego wpisu do katalogu.
- [x] Hardening/accessibility: limit 200 znaków, puste/whitespace bez akcji,
  case-insensitive duplicate guard, długie nazwy zawijane lub skracane bez
  przepełnienia, dynamiczny błąd `role=alert`, akcja w logicznym porządku Tab,
  blokada double-submit i zachowanie danych po błędzie.

## Dziennik wykonania

- 2026-09-10: przeczytano ticket (w tym „Stan zastany”), `docs/CONTEXT.md`,
  `frontend/src/AGENTS.md`, pełne reguły `new-component.md`, tokeny i całe
  właściwe moduły wytycznych UI/UX. Bootstrap zakończony kodem 0.
- 2026-09-10: `rg` nie jest dostępny w środowisku; wyszukiwanie kontynuowane
  przez `Select-String`/`Get-ChildItem`, bez wpływu na zakres ani pliki.
- 2026-09-10: Visual QA wykonane repozytoryjnym Playwrightem
  (`frontend/e2e/fe013-visual-qa.spec.ts`, 1440×900), bo in-app Browser był
  niedostępny. Zrzut `screenshots/create-class-action-1440.png` obejrzany w pełnej
  rozdzielczości: filtr z nazwą spoza profilu, komunikat „Brak takiej klasy
  w profilu. Utwórz ją i przypisz poniżej.” oraz osobny przycisk
  „Utwórz i przypisz klasę „Health””, wyraźnie oddzielony od „Zapisz Enter”.
  Playwright nie jest dowodem na zachowania okna systemowego.
- 2026-09-10: pełna bramka `scripts/check.ps1` — 9/9 PASS, bez SKIP:
  backend format, backend lint, backend typy (99 plików), backend testy
  (355 passed), frontend typy, frontend testy (41 plików / 639 testów),
  frontend build, E2E (15 passed), E2E root safety.
