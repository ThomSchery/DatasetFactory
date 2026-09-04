# FE-008 — log implementacji

## Design Plan przed kodem

### Ocena stanu wyjściowego

- Tryb powierzchni: **Operate**. Ścieżka to filtr → klatka → wybór klasy →
  decyzja. Wybór klasy występuje w dwóch miejscach i dziś ma dwie różne formy:
  natywny `select` przy kopiowaniu i pole tekstowe z listą przycisków
  w popoverze anotacji.
- Natywny `select` przy 40 pozycjach (`Pola HUD (gra)`, `Znaki`, 38 × `Klasa: X`)
  nie ma poziomów ani zaznaczania wielokrotnego. Wybór trzech klas znakowych to
  dziś trzy osobne operacje kopiowania.
- Popover ma dwie drogi zamknięcia o różnym zasięgu: `Escape` obsługiwany
  w polu klasy i na kontenerze dialogu, oraz brak reakcji na kliknięcie poza
  obszarem. `Escape` znika w całości, zastępuje go kliknięcie poza obszarem.
- Nazwa „szkic” jest terminem wewnętrznym z FE-006 i wyciekła do interfejsu
  w trzech miejscach: nagłówku popovera, przycisku porzucenia i etykiecie
  prostokąta.

### Teza

1. Jeden komponent wspólny obsługuje **oba** miejsca wyboru klasy. Różni je
   tryb (`single` w popoverze, `multiple` przy kopiowaniu), nie struktura.
2. Grupa jest jednostką operacyjną przy kopiowaniu: jedno kliknięcie pola
   wyboru grupy zaznacza wszystkie jej klasy. Stan częściowy jest odrębnym,
   nazwanym stanem (`aria-checked="mixed"`), a nie odcieniem koloru.
3. Filtrowanie po wpisaniu jest warunkiem użyteczności przy 38 klasach
   znakowych; lista pozostaje przewijalna z twardym `max-height`.
4. Kliknięcie poza popoverem zamyka bez zapisu i **nie konsumuje gestu**:
   nasłuch jest na `document` w fazie bąbelkowania, bez `preventDefault`
   i bez `stopPropagation`, więc `pointerdown` rozpoczynający rysowanie dociera
   do powierzchni SVG przed zamknięciem popovera.
5. `pointerdown` na bboxie, który popover właśnie edytuje, **nie jest**
   kliknięciem „poza obszarem”. Inaczej przeciągnięcie edytowanego boxa
   porzucałoby go w połowie gestu, co odbiera funkcję dowiezioną w FE-006.

### Elementy interfejsu

- nowy komponent wspólny `GroupedOptionList`: pole filtrowania, lista grup,
  wiersz grupy, wiersz klasy z wcięciem, znacznik zaznaczenia, komunikat pustej
  listy;
- panel `Powtórz z poprzedniej klatki`: `GroupedOptionList` w trybie `multiple`
  zamiast `SelectField`, grupy `Pola HUD (gra)` i `Znaki`;
- popover anotacji: `GroupedOptionList` w trybie `single` zamiast pola
  tekstowego i listy przycisków; znika podpowiedź `Esc zamyka bez zmian`;
- nazewnictwo: `Nowa anotacja · box`, `Porzuć box`, etykieta prostokąta `Box`.

### Moduły i ID wytycznych UI/UX

- [x] Layout/siatka: `GRID-01`, `GRID-02` (odstępy `--size-xs`/`--size-sm`
      wyłącznie z tokenów), `GRID-05` (wiersz listy ma minimum
      `--control-height-sm` = 32 px, czyli desktopowy obszar klikalny),
      `GRID-10` (pole filtrowania jest tak szerokie jak lista, bo wpisywana
      wartość jest nazwą klasy z tej listy), `SPACING-01` (wcięcie potomka
      `--size-md` jest większe niż odstęp między wierszami `--size-xs`, więc
      poziom czyta się przed treścią), `SPACING-02` (grupy rozdziela odstęp,
      nie obramowanie).
- [x] Typografia: `TYPO-07` — hierarchię wiersza grupy niesie
      `--font-weight-semibold`, nie większy stopień pisma; wiersze
      `--font-size-sm`/`--line-height-standard`, licznik i etykieta pustej
      listy `--font-size-xs`. `FONTSIZE-*` i `LHEIGHT-*` wyłącznie z tokenów.
- [x] Kolory: `COLOR-02` (akcent tylko na zaznaczeniu i znaczniku),
      `COLOR-07` (hover przez warstwę `--color-surface-neutral-hover`,
      `disabled` przez `--opacity-disabled`), `COLOR-08` (tekst wierszy to
      `--color-text-strong-default` na `--color-surface-neutral-raised`,
      para przechodzi bramkę kontrastu z `contrast.test.ts`), `COLOR-09`
      (stan częściowy NIE jest kolorem statusu — to `aria-checked="mixed"`
      plus odrębny kształt znacznika).
- [x] Obramowania: `BORDER-02`/`SPACING-02` — grupy rozdziela biała
      przestrzeń; jedyne obramowanie to obrys znacznika wyboru
      (`BWIDTH-03`: pole wyboru jest elementem, który natywnie wymaga
      widocznego obramowania) w `--color-stroke-strong-default`
      o `--border-width-default`. `BORDER-06` — fokus klawiatury korzysta
      z globalnego `:focus-visible` w kolorze marki. `BWIDTH-13` — wszystkie
      obramowania rysowane do wewnątrz (`box-sizing: border-box` globalnie).
- [x] Promień: `RADIUS-02` — znacznik wyboru `--radius-sm`, wiersz
      `--radius-sm`, kontener listy `--radius-md`. `RADIUS-04` — promień
      wiersza jest mniejszy niż promień kontenera, bo między nimi jest padding.
- [x] Cienie: brak. `SHADOW-05` — lista leży na powierzchni panelu i popovera,
      nie unosi się nad nią; wysokość niesie już `--shadow-elevation-high`
      samego popovera.
- [x] Interakcje: hover `--color-surface-neutral-hover` (OPACITY-02, warstwa
      0.06), zaznaczenie `--color-fill-brand-impeccable-soft`,
      `disabled` `--opacity-disabled` (COLOR-07), fokus globalny
      `--focus-ring-width`.
- [x] Komponenty gotowe w `common/`: `TextField` (pole filtrowania — jedyny
      dozwolony `<input>`), `Field` (chrome pola), `Panel`, `Button`,
      `StatusBadge`, `RegionOverlay`. Brakuje dwupoziomowej listy wyboru
      z polami wyboru — stąd nowy `GroupedOptionList` w `common/`, dopisany do
      katalogu (sekcja 4) i definicji (sekcja 5) `new-component.md`.

### Semantyka i dostępność nowego komponentu

- Tryb `multiple`: kontener `role="group"` z nazwą listy, w nim po jednej
  grupie `role="group"` z nazwą grupy. Wiersz grupy i wiersz klasy to
  `role="checkbox"` z `aria-checked` `true`/`false`/`mixed`. Stan częściowy jest
  więc czytany przez czytnik ekranu, a nie tylko widoczny.
- Tryb `single`: `role="listbox"` z `role="group"` na grupę i `role="option"`
  z `aria-selected` na klasę. Wiersz grupy nie jest interaktywny — anotacja
  niesie jedną kategorię, więc zaznaczanie grupy nie ma tam znaczenia.
- Roving tabindex: dokładnie jeden wiersz ma `tabIndex=0`. `ArrowDown`/`ArrowUp`
  przesuwają fokus po widocznych wierszach, `Home`/`End` skaczą na końce,
  `Enter` i `Spacja` aktywują wiersz. `ArrowDown` z pola filtrowania wchodzi
  w listę, `ArrowUp` z pierwszego wiersza wraca do pola filtrowania.
- Zaznaczenie **nie podąża za fokusem**. Przewinięcie listy strzałkami niczego
  nie wybiera; wybór jest jawny (`Enter`, `Spacja`, kliknięcie). To jest
  warunek F4: po narysowaniu boxa żadna klasa nie jest wybrana, a `Zapisz
  klasę` pozostaje nieaktywny do momentu wyboru.
- Pole wyboru grupy działa na **widoczne** pozycje grupy. Przy aktywnym filtrze
  zaznacza to, co użytkownik widzi, i stan `mixed` liczy się z tego samego
  zbioru, więc znacznik nigdy nie opisuje pozycji spoza ekranu.
- Skróty ekranu: korzeń komponentu niesie `data-shortcut-scope`. `FrameEditor`
  pomija zdarzenie, którego cel leży wewnątrz takiego elementu — to samo
  wymaganie, które natywny `select` spełniał przez `tagName === "SELECT"`.

### Kolizja zamykania z rysowaniem (Ryzyko 2 ticketu)

Nasłuch `pointerdown` jest rejestrowany na `document` w fazie bąbelkowania.
React 19 podpina swoje listenery do kontenera roota (`#root`), który leży
**poniżej** `document`, więc obsługa `onPointerDown` powierzchni SVG wykonuje
się pierwsza i gest rysowania startuje. Zamknięcie popovera wykonuje się po
niej, jako drugi efekt tego samego zdarzenia, i nie woła ani
`preventDefault`, ani `stopPropagation`. `pointerdown` nie jest więc zjadany —
ani przez zamknięcie, ani przez ponowne renderowanie: `<svg>` zachowuje
tożsamość w drzewie, więc `setPointerCapture` przetrwa zmianę stanu.

Wyjątek: `pointerdown`, którego cel leży w `[data-overlay-shape-id]` równym
identyfikatorowi anotacji z popovera, nie zamyka niczego. Bez tego wyjątku
przeciągnięcie edytowanego boxa (i szkicu) porzucałoby go w połowie gestu.

## Rozszerzenie kontraktu kopiowania

Wybór podzbioru klas wymaga, by `POST /frames/{id}/copy-previous` przyjmował
listę kategorii w jednym żądaniu. Sekwencja żądań została odrzucona przez
zleceniodawcę: łamałaby atomowość dowiezioną w FE-004 („albo wszystkie, albo
żadna”). Dodany addytywnie `scope: "categories"` z `category_ids`; `game`,
`character` i `category` zachowują dotychczasowy kształt i zachowanie.

Warunki utrzymane w jednej transakcji, bez zmiany istniejących ścieżek:
zastępowanie wyłącznie w obrębie wybranego zakresu, źródłem jest poprzednia
klatka w czasie wyznaczana w transakcji, zamrożone cele odmawiają,
a niepoprawna pozycja listy przerywa całość przed pierwszym zapisem.

## Przebieg

- Ticket przeczytany w całości, `frontend/src/AGENTS.md`, `AGENTS.md`,
  `new-component.md`, `tokens.css` i moduły wytycznych wymienione wyżej.
- F4 potwierdzone przez zleceniodawcę: struktura grupowana w popoverze nowego
  boxa, bez wstępnie wpisanej wartości, zapis nieaktywny do wyboru klasy.
- Zrzuty visual QA odświeżone po całości — ekran zmienia wygląd w F1–F4.
</content>
</invoke>
