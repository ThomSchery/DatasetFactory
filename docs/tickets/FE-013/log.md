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

## FE-013-FIX1 — plan po zimnym review

Review wykazało, że przeglądarka nie może wiarygodnie przewidzieć pełnego
Pythonowego `str.casefold()`. Frontendowa logika porównania pozostaje wyłącznie
heurystyką sterującą widocznością akcji; backend jest jedynym źródłem
prawdy. Nie kopiujemy tabel Unicode do TypeScriptu.

### Mechanizm odzyskania po `409`

1. Precheck repozytorium nadal działa pod istniejącym `BEGIN IMMEDIATE`, ale
   wraz z `CategoryNameExistsError` przeniesie `category_id` i `category_name`
   znalezionego wiersza. Router zwróci je w `error.details`; transakcja,
   `ordinal`, reguła `kind` i rozdział operacji pozostają bez zmian.
2. Po `409 category_name_exists` edytor odświeży profil, ustawi filtr na
   autorytatywną nazwę zwycięskiej klasy i zaznaczy jej identyfikator w pickerze.
   Operator zobaczy jedną istniejącą pozycję i jawnie zapisze przypisanie;
   nie powstaje drugie żądanie zapisu anotacji jako skutek samego `409`.
3. Fallback `IntegrityError` zachowuje `409`. Jeśli nie ma szczegółów
   prechecku, picker filtruje dokładną nazwą z odrzuconego żądania — to
   wystarcza dla kolizji exact-name wymuszanej przez indeks SQLite.
4. Heurystyka klienta zostanie nazwana wprost (`categoryNameDuplicateHintKey`,
   `looksLikeDuplicateCategoryName`). Kanonizacja znaku obejmie wyłącznie
   jawne ASCII `a-z → A-Z`; `ſ` i `ı` pozostaną klasami `game`.
5. Limit 200 będzie liczony przez punkty kodowe (`[...value]`), a kontrolowany
   filtr przytnie wklejenie do 200 punktów. Natywne `maxlength`, które liczy
   jednostki UTF-16, nie będzie użyte w tym pickerze.

### Design Plan FIX1

Tryb powierzchni: **Operate / hardening**. Bez nowego komponentu, stylu, układu
ani copy poza doprecyzowaniem naprawy po konflikcie.

Elementy interfejsu:

1. `TextField` „Klasa” wewnątrz `GroupedOptionList` — staje się kontrolowany;
   po `409` pokazuje nazwę z backendu, zachowuje autofocus i zakres skrótów.
2. `GroupedOptionList` — po refetchu pokazuje zwycięską klasę i ustawia jej
   lokalne `aria-selected`; roving tabindex, Enter/Space i listbox bez zmian.
3. `Button` „Utwórz i przypisz klasę” — jego widoczność nadal wynika tylko
   z heurystyki; po autorytatywnym `409` znika, bo filtr wskazuje istniejący wiersz.
4. `InlineError` — informuje, że klasa już istniała, lista została odświeżona
   i trzeba jawnie zapisać przypisanie. Nadal ma `role=alert`.
5. `Button` „Zapisz klasę” — po odzyskaniu jest aktywny dla wskazanej klasy;
   dopiero on uruchamia dotychczasowy POST draftu albo wersjonowany PATCH anotacji.
6. Draft `RegionOverlay` i istniejąca anotacja — pozostają widoczne i nietknięte
   po konflikcie; geometria, pan/zoom i skróty ekranu są poza zakresem.

Moduły/ID UI/UX (te same istniejące prymitywy, bez nowych wartości CSS):

- [x] Layout/Siatka: bez zmian; `--size-xs`, `--control-height-sm`,
  **GRID-01/02/05/08/10, SPACING-01/03/04/08/13**.
- [x] Typografia: bez zmian; `--font-size-sm/xs`, regular/semibold,
  `--line-height-standard`, **TYPO-01/02/06/07/08/11,
  FONTSIZE-02/06/08/09/10, LHEIGHT-10/12, LSPACE-02, CASING-01/02**.
- [x] Kolory: semantyczne tokeny listy, Button i InlineError,
  **COLOR-01/07/08/09/10**.
- [x] Obramowania/promienie: bez zmian,
  **BORDER-02/03/05/06, BWIDTH-03/06/10/11/12/13,
  RADIUS-02/03/04/05**.
- [x] Cienie: bez nowych warstw, **SHADOW-01/03/05**.
- [x] Interakcje: zachowane hover/active/focus-visible/disabled/loading;
  po `409` focus pozostaje w obrębie dialogu, **COLOR-07, BORDER-06,
  OPACITY-01/02**.
- [x] Komponenty: istniejące `TextField`, `GroupedOptionList`, `Button`,
  `InlineError`, `RegionOverlay`; brak inline `<button>` i nowego common.
- [x] Hardening/a11y: `ſ/S`, ligatura `ﬀ/ff`, 101 emoji, 201 punktów,
  brak automatycznego przypisania, czytelny alert i widoczna odzyskana opcja.

### Testy FIX1

- Backend: wymuszony prawdziwy SQLAlchemy `IntegrityError` z komunikatem SQLite,
  po przejściu prechecku, musi dać HTTP `409 category_name_exists`.
- Frontend unit: heurystyka jest jawnie nieautorytatywna; tylko ASCII podlega
  kanonizacji; limit liczy punkty kodowe.
- Frontend integracja: `ſ` kontra `s` oraz `ﬀ` kontra `ff` kończą się
  odświeżeniem profilu, widoczną/zaznaczoną zwycięską klasą, aktywnym
  jawnym zapisem i zerem automatycznych zapisów anotacji.
- Regresja: oba dotychczasowe przepływy tworzenia, pusty/biały Enter,
  współbieżność `ordinal`, geometria FE-012 i kontrakt `Space`.
- Finalnie jeden nieprzerwany `scripts/check.ps1`: 9/9 PASS, zero SKIP.

### Wynik FIX1

- 2026-09-11: backendowy precheck zwraca w `409` autorytatywne
  `details.category_id` i `details.category_name`. Dla par `ſ`/`S` i `ﬀ`/`ff`
  edytor czeka na refetch profilu, ustawia filtr na nazwę z odpowiedzi i zaznacza
  zwycięski wiersz. Operator widzi alert
  „Lista została odświeżona, a istniejąca klasa wybrana” oraz aktywny
  `Zapisz klasę`; przed jego kliknięciem test potwierdza dokładnie jeden zapis
  HTTP (odrzucone tworzenie) i brak POST/PATCH anotacji.
- 2026-09-11: `categoryNameDuplicateHintKey` /
  `looksLikeDuplicateCategoryName` są jawnie opisane jako heurystyka affordance,
  nie implementacja `casefold`. Kanonizacja obejmuje tylko ASCII `a-z`, a
  `GroupedOptionList` ogranicza filtr do 200 punktów kodowych. Test przyjmuje
  101 emoji i przycina 201 emoji do 200, zgodnie z backendowym liczeniem.
- 2026-09-11: trwała regresja fallbacku monkeypatchuje `Session.flush` dopiero po
  utworzeniu profilu. Nazwa `score` nie istnieje, więc jawny precheck przechodzi;
  `flush` rzuca prawdziwy SQLAlchemy `IntegrityError` z tekstem constraintu
  SQLite. Pełna ścieżka repozytorium → use case → API zwraca
  `409 category_name_exists`, a nie `500`.
- 2026-09-11: testy wąskie PASS: backend 2/2 (precheck details i wymuszony
  fallback), frontend 4 pliki / 86 testów (nazwy, limit, picker, przepływ).
- 2026-09-11: jeden nieprzerwany `scripts/check.ps1` — **9/9 PASS, zero SKIP**:
  backend format (266 plików), backend lint, backend mypy (99 plików), backend
  testy (356 passed), frontend typecheck, frontend testy (41 plików / 645
  testów), frontend build, E2E (15 passed), E2E root safety (2 passed).
  Istniejąca sonda FE-013 w 1440×900 oraz regresje kanwy/pan/Space przeszły;
  FIX1 nie zmienił geometrii ani stylu panelu.
