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

## FE-013-FIX2 — plan po re-review

Re-review potwierdził mechanizm backendu, współbieżność, regresję
`IntegrityError`, oba przepływy i kontrolowany picker. Zakres FIX2 obejmuje
wyłącznie geometrię panelu po alercie oraz uczciwy fallback starszego `409`
bez `details`.

### Decyzje

1. `CategoryConflictRecovery` będzie stanem rozłącznym:
   `identified(category)` albo `unidentified`. Nie da się więc jednocześnie
   twierdzić, że klasa została wybrana, i nie mieć jej identyfikatora.
2. `identified` zachowuje FIX1: filtr przyjmuje autorytatywną nazwę, a picker
   zaznacza ID zwycięzcy. `unidentified` czyści filtr i wybór formularza,
   pokazuje wszystkie klasy po refetchu, wyłącza „Zapisz” do czasu ręcznego
   wskazania i ukrywa akcję tworzenia, aby nie wejść w pętlę `409`.
3. Copy `category_name_exists` jest prawdziwe w obu wariantach: „Lista została
   odświeżona. Wskaż istniejącą klasę na liście i zapisz przypisanie albo podaj
   inną nazwę”. Jedno zdanie dla obu stanów, bo `messages.ts` tłumaczy kod
   błędu, a nie stan ekranu (`react-coding-standards.md` §3); dla identified
   zaznaczenie widać w pickerze, ale komunikat nie przypisuje sobie sukcesu,
   którego backend anotacji jeszcze nie potwierdził.
4. `AnnotationPopover` dostaje jedną kolumnę `minmax(0, 1fr)` zamiast
   dokowanego wariantu `minmax(0, 1fr) auto`. Rozpinanie pojedynczych dzieci
   przez `grid-column: 1 / -1` naprawiłoby tylko dzisiejszy alert — każdy
   następny element auto-placementu znów trafiłby do kolumny `auto` obok
   przycisków. Alert dostaje dodatkowo `min-width: 0` i `overflow-wrap:
   anywhere`, bo niesie nazwę pisaną przez operatora, więc może zawierać jeden
   nierozdzielny token.

### Design Plan FIX2

Tryb: **Operate / hardening**. Zachowujemy baseline i istniejące komponenty.

Elementy interfejsu:

1. `GroupedOptionList` / `TextField` „Klasa” — pełny wiersz panelu; w fallbacku
   unknown pokazuje pusty filtr i całą odświeżoną listę.
2. Wiersze `role=option` — przy winner identified jeden ma `aria-selected=true`;
   przy unknown żaden nie jest zaznaczony do ręcznego kliknięcia.
3. `Button` „Utwórz i przypisz klasę” — ukryty w unknown niezależnie od
   heurystyki; nie ma pętli ponownego `409`.
4. `InlineError` — osobny pełny wiersz, zawijanie dowolnie długiego copy bez
   wpływu na geometrię przycisków.
5. Kontener akcji z `Porzuć/Usuń` i `Zapisz klasę` — osobny pełny wiersz;
   hit-target „Zapisz” musi w całości pozostać wewnątrz dialogu.
6. `RegionOverlay`, draft i istniejąca anotacja — bez zmian; konflikt nie
   zapisuje automatycznie anotacji ani geometrii.

Moduły/ID UI/UX:

- [x] Layout/Siatka: pełne wiersze oraz `min-width: 0`, istniejący gap
  `--size-xs`, **GRID-01/02/05/08/10, SPACING-01/03/04/08/13**.
- [x] Typografia: bez zmiany skali i wag; alert się zawija,
  **TYPO-01/02/06/07/08/11, FONTSIZE-02/06/08/09/10,
  LHEIGHT-10/12, LSPACE-02, CASING-01/02**.
- [x] Kolory: istniejący `InlineError`, Button i selection,
  **COLOR-01/07/08/09/10**.
- [x] Obramowania/promienie: bez zmian,
  **BORDER-02/03/05/06, BWIDTH-03/06/10/11/12/13,
  RADIUS-02/03/04/05**.
- [x] Cienie: bez zmian i nowych warstw, **SHADOW-01/03/05**.
- [x] Interakcje: mysz, hit-test, focus, Enter/Space, disabled i loading;
  **COLOR-07, BORDER-06, OPACITY-01/02**.
- [x] Komponenty: `GroupedOptionList`, `TextField`, `Button`, `InlineError`,
  `RegionOverlay`; brak nowego common i brak inline `<button>`.
- [x] Hardening/a11y: najdłuższy komunikat, containment i hit-test,
  `ſ/S`, `ﬀ/ff`, no-details exact i non-exact, brak fałszywego wyboru,
  brak create affordance w unknown, zachowane roving tabindex i shortcut scope.

### Testy FIX2

- Playwright dla obu par Unicode: geometria dialogu/przycisku, `elementFromPoint`
  trafia w przycisk, prawdziwy klik myszy wysyła PATCH z ID i
  `expected_version: 3`.
- Playwright z nadmiarowo długim alertem: te same pomiary przed kliknięciem.
- Integracja no-details non-exact: pusty filtr, pełna lista, brak zaznaczenia,
  disabled save i brak akcji create; ręczny wybór umożliwia PATCH.
- Integracja no-details exact po refetchu: automatyczne wskazanie nadal działa.
- Retest nawigacji `GroupedOptionList`, pustego/białego Enter, obu przepływów,
  geometrii FE-012, Space FE-010, współbieżności i `IntegrityError`.
- Finalnie jeden `scripts/check.ps1`: 9/9 PASS, zero SKIP.

### Wynik FIX2

**FIX-A — pomiary.** `frontend/e2e/fe013-conflict-geometry.spec.ts`, Chromium
1440×1000, oba warianty `ſ/S` i `ﬀ/ff` dały identyczną geometrię:

| Prostokąt | left | right | top | bottom |
| --- | --- | --- | --- | --- |
| dialog | 337 | 1383 | 321,70 | 674,70 |
| „Zapisz” | 1252,83 | 1366 | 625,70 | 657,70 |

Przycisk mieści się w panelu w obu osiach, `document.elementFromPoint` na jego
środku trafia w element wewnątrz `[aria-label="Zapisz klasę"]`, a zwykły klik
myszą wysyła dokładnie jeden `PATCH /annotations/ann-1` z
`{category_id: <zwycięzca>, expected_version: 3}`.

Test faktycznie łapie usterkę: po tymczasowym przywróceniu reguły
`grid-template-columns: minmax(0, 1fr) auto` pomiar odtworzył liczbę z
re-review — `save.left = 320` przy `panel.left = 337`, czyli 17 px poza lewą
krawędzią. Poza bieżącym komunikatem test mierzy też alert zastąpiony tekstem
1800 znaków oraz jednym nierozdzielnym tokenem 400 znaków; w obu przypadkach
prostokąt przycisku się nie zmienia.

**FIX-B — co widzi operator bez `details`.** Profil ma `ſ`, operator wpisuje
`s`, akcja proponuje `S`, backend odrzuca `409 category_name_exists` bez
szczegółów, a przeglądarka nie potrafi odtworzyć `casefold`:

1. alert: „Klasa o tej nazwie już istnieje w profilu. Lista została odświeżona.
   Wskaż istniejącą klasę na liście i zapisz przypisanie albo podaj inną nazwę.
   Kod: category_name_exists.” — żadnego zdania o dokonanym wyborze;
2. filtr pusty, więc odświeżona lista pokazuje wszystkie klasy profilu wraz
   z `ſ`, niewidocznym pod zapytaniem `s`;
3. żaden wiersz nie ma `aria-selected="true"`;
4. „Zapisz” jest `disabled` do czasu ręcznego wskazania klasy;
5. akcji „Utwórz i przypisz klasę” nie ma, więc nie da się wejść w pętlę
   kolejnych `409`; wraca dopiero po zmianie treści filtra, czyli po nowej
   intencji operatora;
6. po kliknięciu `ſ` i „Zapisz” idzie zwykły wersjonowany `PATCH`
   (`expected_version: 3`).

Ścieżka bez `details` z dokładną nazwą (`Score` utworzone równolegle) nadal
odzyskuje zwycięzcę z odświeżonego profilu i zaznacza go automatycznie.

**Bramka.** Jeden nieprzerwany `scripts/check.ps1`: **9/9 PASS, zero SKIP** —
backend format, lint, mypy (99 plików), 356 testów; frontend typy, 649 testów
w 41 plikach, build; E2E 18 passed (15 dotychczasowych plus trzy nowe), E2E
root safety 2/2. Oficjalny E2E odświeżył pięć zrzutów zawierających panel
anotacji — jednokolumnowy układ jest w nich widoczny i zostały zacommitowane
razem z tym wpisem.

## FE-013-FIX3 — plan po re-review

Re-review wykazał, że `unidentified` znika przy pierwszym zdarzeniu filtra,
ponieważ prawdziwy rodzic bezwarunkowo kasuje `categoryConflict`. Zakres FIX3
obejmuje wyłącznie pamięć odrzuconej propozycji, warunek bramy i regresję na
poziomie ćwiczącym `FrameEditor`.

### Decyzje

1. `unidentified` przechowuje `rejectedName`: nazwę po tej samej normalizacji,
   z którą wysłano odrzucony POST (`categoryInputFromName`, m.in. `s → S`).
2. Pamięć odrzucenia pozostaje do resetu kontekstu (zamknięcie panelu, zmiana
   anotacji/klatki albo udana mutacja). Akcja tworzenia jest ukryta tylko wtedy,
   gdy bieżąca znormalizowana propozycja równa się `rejectedName`; inna propozycja
   jest nową intencją i od razu przywraca akcję. Pozostawienie pamięci oznacza,
   że także powrót do odrzuconej nazwy nie otwiera kolejnej pętli `409`.
3. Edycja filtra nadal czyści widoczny błąd poprzedniej próby, ale nie niszczy
   pamięci `unidentified`. Wariant `identified` zachowuje dotychczasowy reset po
   nowej edycji filtra.
4. Regresja trafia do integracyjnego `annotationReviewFlow.test.tsx`: renderuje
   prawdziwą trasę, `FrameEditor` i `AnnotationPopover`, a zastępuje dopiero API.
   Dzięki temu wykonuje callback rodzica, którego komponentowy stub
   `onCategoryFilterChange={vi.fn()}` nie obejmował.

### Design Plan FIX3

Tryb: **Operate / hardening**. Bez zmiany układu FIX-A, stylów, copy, tokenów ani
komponentów; zmienia się wyłącznie logika dostępności istniejącej akcji.

Elementy interfejsu:

1. `GroupedOptionList` / `TextField` „Klasa” — ta sama kontrolowana wartość i
   normalizacja propozycji; wpisanie odrzuconej nazwy nie kasuje jej pamięci.
2. `Button` „Utwórz i przypisz klasę” — ukryty dla zapamiętanej propozycji,
   widoczny dla innej prawidłowej propozycji; istniejące stany disabled/loading
   bez zmian.
3. `InlineError` — dotychczasowy komunikat konfliktu i dotychczasowe czyszczenie
   po edycji; bez zmiany copy i geometrii.
4. Wiersze `role=option` i `Button` „Zapisz klasę” — bez zmian; ręczny wybór po
   konflikcie nadal działa zwykłą ścieżką przypisania.
5. `RegionOverlay`, draft, istniejąca anotacja i kontener akcji — bez zmian.

Moduły/ID UI/UX:

- [x] Layout/Siatka: bez zmian CSS i tokenów; zachowany jednokolumnowy panel,
  **GRID-01/02/05/08/10, SPACING-01/03/04/08/13**.
- [x] Typografia, kolory, obramowania i cienie: bez zmian,
  **TYPO-01/02/06/07/08/11, FONTSIZE-02/06/08/09/10, LHEIGHT-10/12,
  LSPACE-02, CASING-01/02, COLOR-01/07/08/09/10, BORDER-02/03/05/06,
  BWIDTH-03/06/10/11/12/13, RADIUS-02/03/04/05, SHADOW-01/03/05**.
- [x] Interakcje: jawna różnica między tą samą i inną znormalizowaną intencją,
  zachowane focus/keyboard/disabled/loading, **COLOR-07, BORDER-06,
  OPACITY-01/02**.
- [x] Komponenty: istniejące `GroupedOptionList`, `TextField`, `Button`,
  `InlineError`, `RegionOverlay`; brak nowego common i brak inline `<button>`.
- [x] Hardening: ta sama propozycja po `409` nie daje drugiego POST-a; inna
  propozycja przywraca akcję i wysyła POST; wariant `details` bez regresji.

### Testy FIX3

- Integracja prawdziwego rodzica: `409` bez `details`, ponowne wpisanie `s → S`,
  brak akcji i brak drugiego POST-a; inna nazwa przywraca akcję i przechodzi
  przez zwykły POST kategorii oraz wersjonowany PATCH anotacji.
- Test komponentowy pozostaje testem lokalnego renderowania bramy, ale nie jest
  dowodem na okablowanie rodzica.
- Retest wariantu `details`, ręcznego odzyskania, exact-name bez `details`, resetów
  kontekstu, geometrii FIX-A i pozostałych niezmienników wskazanych w tickecie.
- Finalnie jeden nieprzerwany `scripts/check.ps1`: 9/9 PASS, zero SKIP.

### Wynik FIX3

`unidentified` przechowuje teraz `rejectedName` dokładnie z odrzuconego
`CategoryInput`. `AnnotationPopover` porównuje z nim każdą bieżącą propozycję po
`categoryInputFromName`: ponowne `s → S` nie pokazuje akcji tworzenia, `Mana`
pokazuje ją i przechodzi przez zwykły POST kategorii oraz PATCH anotacji z
`expected_version: 3`. Rodzic nie kasuje pamięci `unidentified` przy edycji
filtra, więc także powrót do odrzuconej nazwy pozostaje zablokowany; pamięć jest
usuwana przez dotychczasowe resety kontekstu i sukces mutacji. Wariant
`identified` zachowuje dotychczasowe zachowanie.

Nowa regresja jest **integracyjna** w
`frontend/src/features/annotations/annotationReviewFlow.test.tsx`. Renderuje
prawdziwą trasę aplikacji, `FrameEditor` i `AnnotationPopover`, a mockuje dopiero
odpowiedzi HTTP. Wpisanie filtra wykonuje więc produkcyjny
`onCategoryFilterChange` rodzica — dokładnie tę granicę, którą test komponentowy
z `vi.fn()` omijał. Falsyfikowalność potwierdzona: po tymczasowym przywróceniu
samego `setCategoryConflict(null)` test znalazł przycisk „Utwórz… S” i upadł;
po odtworzeniu poprawki przeszedł. Tymczasowa zmiana została cofnięta bit-for-bit.

Wąski zestaw: 2 pliki / **69 testów PASS** oraz frontend typecheck PASS.
Jeden nieprzerwany `scripts/check.ps1`: **9/9 PASS, zero SKIP** — backend format,
lint, mypy (99 plików), **356 testów**; frontend typy, **650 testów w 41
plikach**, build; Playwright **18/18**, E2E root safety **2/2**. Geometria FIX-A
pozostała identyczna dla obu konfliktów: panel `left=337`, przycisk zapisu
`left=1252,83`, hit-test i klik myszy przeszły. E2E nie wytworzył zmian w
zrzutach ani innych plikach.

## FE-013-FIX4 — plan po re-review

Re-review wykazał drugi, niezależny reset pamięci `unidentified`: wspólny
`submit()` kasuje `categoryConflict` przed każdą mutacją. W efekcie nieudany
POST innej klasy albo nieudany PATCH geometrii otwiera ponownie pętlę dla
wcześniej odrzuconej propozycji. Zakres FIX4 obejmuje wyłącznie warunek tego
resetu i dwie regresje integracyjne odtwarzające sondy recenzenta. Znana luka
aliasów Unicode w heurystyce `looksLikeDuplicateCategoryName` pozostaje poza
zakresem zgodnie z ticketem.

### Decyzje

1. `submit()` przestaje czyścić `categoryConflict`. Wynik nowej próby tworzenia
   klasy rozstrzygają istniejące callbacki mutacji: `onError` dla
   `category_name_exists` zastępuje pamięć nowym `identified` albo
   `unidentified`, a `onSuccess` czyści ją po sukcesie. Zwykły błąd innej próby
   (`500`) zachowuje wcześniejszą bramę.
2. To rozdzielenie po wyniku jest konieczne, ponieważ sam warunek
   `intent.kind === "create-category"` nadal kasowałby pamięć `S` przed
   nieudanym POST-em `Timer`. Mutacje review, geometrii, usunięcia, przypisania
   oraz kopiowania także nie dotykają bramy przed poznaniem wyniku.
3. Testy pozostają integracyjne w `annotationReviewFlow.test.tsx`, ponieważ
   renderują prawdziwe połączenie `FrameEditor` → `AnnotationPopover`, wykonują
   wspólny `submit()` i mockują dopiero granicę HTTP. To poziom, na którym da się
   wykazać przeciek między dwoma różnymi rodzajami mutacji.

### Design Plan FIX4

Tryb: **Operate / hardening**. Brak zmian CSS, copy, układu FIX-A, tokenów i
komponentów. Zmienia się wyłącznie trwałość pamięci odrzuconej propozycji po
nieudanej, niezwiązanej mutacji.

Elementy interfejsu:

1. `GroupedOptionList` i jego `TextField` „Klasa” — ponowne wpisanie
   zapamiętanej znormalizowanej nazwy nadal nie pokazuje akcji tworzenia.
2. `Button` „Utwórz i przypisz klasę” — dostępny od razu dla innej prawidłowej
   propozycji; jej nieudany POST nie usuwa pamięci wcześniejszej nazwy.
3. `InlineError` — pokazuje błąd bieżącej mutacji bez zmiany copy i geometrii;
   jego zniknięcie przy edycji nie oznacza usunięcia bramy.
4. `RegionOverlay` i obsługa nudge + `Enter` — nieudany PATCH geometrii nie
   zmienia pamięci konfliktu klasy.
5. Wiersze `role=option`, `Button` „Zapisz klasę”, przyciski review/usunięcia/
   kopiowania, draft i istniejąca anotacja — renderowanie i kontrakty bez zmian;
   sukces mutacji zachowuje dotychczasowy reset.

Moduły/ID UI/UX:

- [x] Layout/Siatka: bez zmian CSS; zachowane tokeny `--size-*`, pełne wiersze i
  `min-width: 0`, **GRID-01/02/05/08/10, SPACING-01/03/04/08/13**.
- [x] Typografia: bez zmian skali, wagi i copy,
  **TYPO-01/02/06/07/08/11, FONTSIZE-02/06/08/09/10, LHEIGHT-10/12,
  LSPACE-02, CASING-01/02**.
- [x] Kolory: istniejące stany `InlineError`, wyboru i przycisków,
  **COLOR-01/07/08/09/10**.
- [x] Obramowania/promienie: bez zmian,
  **BORDER-02/03/05/06, BWIDTH-03/06/10/11/12/13,
  RADIUS-02/03/04/05**.
- [x] Cienie: bez zmian i nowych warstw, **SHADOW-01/03/05**.
- [x] Interakcje: zachowane hover/focus/disabled/loading, roving tabindex,
  `data-shortcut-scope`, Enter/Space i obsługa klawiatury,
  **COLOR-07, BORDER-06, OPACITY-01/02**.
- [x] Komponenty: istniejące `GroupedOptionList`, `TextField`, `Button`,
  `InlineError`, `RegionOverlay`; brak nowego komponentu common i brak inline
  `<button>`.
- [x] Hardening/a11y: brama przeżywa błędy `500` innej klasy i
  `422 bbox_invalid`, odrzucona nazwa nie wysyła kolejnego POST-a, inna nazwa
  pozostaje dostępna, focus i komunikaty dynamiczne bez zmian.

### Testy FIX4

- Integracja sondy 1: `S` odrzucone bez `details` → POST `Timer` kończy się
  `500` → ponowne `s` nie pokazuje akcji i liczba zapisów pozostaje równa 2.
- Integracja sondy 2: `S` odrzucone bez `details` → nudge + `Enter`, PATCH
  kończy się `422 bbox_invalid` → ponowne `s` nie pokazuje akcji i liczba
  zapisów pozostaje równa 2.
- Retest istniejącej ścieżki: inna klasa może zostać utworzona i przypisana,
  sukces czyści pamięć, warianty normalizacji/prefiksu i resety kontekstu bez
  regresji.
- Finalnie jeden nieprzerwany `scripts/check.ps1`: 9/9 PASS, zero SKIP,
  włącznie z pełnym Playwright E2E.

### Próba odrzucona

Pierwsza implementacja obwarowała reset w `submit()` warunkiem
`intent.kind === "create-category"`. Sonda 1 od razu ją sfalsyfikowała: POST
`Timer` również ma ten rodzaj intencji, więc przed odpowiedzią `500` pamięć `S`
znikała, a akcja „Utwórz… S” wracała. Test zakończył się 1 fail / 53 pass.
Implementacja została zastąpiona rozstrzyganiem wyłącznie w istniejących
`onError`/`onSuccess`; niepowiązany błąd nie jest sygnałem do resetu.

### Wynik FIX4

`submit()` nie czyści już `categoryConflict`. Wybrana droga opiera reset na
wyniku mutacji: istniejąca gałąź `onError` dla `category_name_exists` zapisuje
nowego zwycięzcę albo nową odrzuconą propozycję, a wspólny `onSuccess` usuwa
pamięć po powodzeniu. Dzięki temu błąd innej klasy albo geometrii nie kasuje
bramy, a udane utworzenie i przypisanie nadal ją czyści.

Obie sondy integracyjne renderują prawdziwy `FrameEditor` i mockują dopiero
HTTP:

1. `S` → `409` bez `details`, potem `Timer` → `500`, potem ponowne `s`:
   dokładnie **2 zapisy**, oba POST (`S`, `Timer`); przycisk „Utwórz… S” jest
   nieobecny, więc trzeci POST nie może zostać wysłany.
2. `S` → `409` bez `details`, potem `ArrowRight` + `Enter` →
   `422 bbox_invalid`, potem ponowne `s`: dokładnie **2 zapisy** — POST `S` oraz
   PATCH `/annotations/ann-1` z `expected_version: 3`; przycisk „Utwórz… S”
   pozostaje nieobecny.

Falsyfikowalność sprawdzona wspólnie dla obu testów: tymczasowe przywrócenie
starego bezwarunkowego `setCategoryConflict(null)` dało **2 fail / 52 skip**, w
obu przypadkach na ponownie widocznym przycisku „Utwórz… S”. Po odtworzeniu
poprawki oba testy przeszły. Pełny plik integracyjny: **54/54 PASS**;
frontend typecheck PASS.

Jeden właściwy, nieprzerwany `scripts/check.ps1`: **9/9 PASS, zero SKIP** —
backend format, lint, mypy (99 plików), **356/356 testów**; frontend typecheck,
**652/652 testy w 41 plikach**, build; Playwright **18/18**; E2E root safety
**2/2**. Bramka nie zmieniła zrzutów ani innych plików. Pierwsze wywołanie
powłoki zakończyło się przed wejściem do bramki z powodu utraty backslashy w
argumencie `-File`; pełny przebieg został następnie uruchomiony raz z absolutną
ścieżką i zakończony bez restartu.
