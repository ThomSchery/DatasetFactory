# FE-018 — log

Baza: `main` = `234aea2`. Gałąź `feat-fe-018-profile-regions-and-class-groups`.

Dwie części: **A** — dodanie regionu HUD do istniejącego profilu (backend + interfejs),
**B** — podział grupy `ZNAKI` na `Liczby`, `Litery`, `Symbole` w dwóch miejscach.

---

## 1. Rozpoznanie stanu zastanego

| Fakt | Źródło |
|---|---|
| Regiony powstają wyłącznie przy tworzeniu profilu | `api/profiles.py:48` — `regions: tuple[RegionRequest, ...] = Field(min_length=1)`; brak trasy `.../regions` |
| Walidacja prostokąta wobec obrazu referencyjnego już istnieje | `engines/definition/engine.py::_validate_region` → `region_out_of_bounds` przy `x + width > source_width` |
| Unikalność nazwy regionu jest w bazie | `models.py:86` — `UniqueConstraint("profile_id", "name", name="uq_hud_regions_profile_name")` |
| Etap kadrowania czyta regiony **na żywo z profilu** | `repositories/frames.py:405` — `select(HudRegion).where(HudRegion.profile_id == run.profile_id)` w `_processing_record` |
| Klatka już `cropped` nie wraca do kadrowania | `commit_cropped` wymaga `require_frame_transition(current, "cropped")`; przejście jest jednorazowe |
| `active_run` ma już kod błędu i mapowanie na `409` | `api/profiles.py:143`; blokada pochodzi z `ProfileSelectionBlockedError` (`workflow_slot == 1`) |
| Jedna grupa `ZNAKI` w panelu anotacji | `features/annotations/copySelection.ts:10` — `COPY_GROUPS = [game, character]` |
| Ekran profilu ma **płaską** listę klas, nie `GroupedOptionList` | `ProfilesScreen.tsx:261` — `<ul aria-label="Klasy profilu">` |
| Ostrzeżenie FE-016 mówi o dwóch grupach | `ProfilesScreen.tsx:35` — `categoryGroupLabel(kind)` zwraca `"Znaki (OCR)"` albo `"Pola HUD (gra)"` |

---

## 2. Rozstrzygnięcie: `active_run` **blokuje** dodanie regionu

Rodzic argumentował, że blokada jest zbędna, bo dodanie regionu nie wpływa na bieżący run.
Pierwsza część przesłanki jest prawdziwa dla klatek **już przetworzonych** i fałszywa dla
całego runu.

`FrameRepository._processing_record` (`repositories/frames.py:405`) czyta listę regionów
zapytaniem po `run.profile_id` w momencie kadrowania, a nie ze snapshotu zrobionego przy
starcie runu. Run, który w chwili dodania regionu ma jeszcze nieprzetworzone klatki,
przytnie je z **pięcioma** regionami, podczas gdy klatki wcześniejsze mają cztery
`region_samples`. Powstaje run niejednorodny: eksport z niego ma część klatek z `timer` i
część bez, a nic w interfejsie tego nie tłumaczy.

Rozstrzygnięcie operatora brzmi „dodanie go nie wpływa na już przeprowadzony run".
Dozwolenie dodawania w trakcie runu czyni to zdanie **nieprawdziwe** — run byłby
częściowo dotknięty. Snapshot regionów per run byłby lepszym rozwiązaniem, ale leży poza
granicami tego ticketu („bez zmian w potoku próbkowania, kadrowania i OCR”). Blokada jest
jedyną tanią odpowiedzią, która utrzymuje obietnicę „nowy region obowiązuje od kolejnego
runu” dosłownie prawdziwą.

**Zakres blokady jest węższy niż przy `activate_profile`.** Tamta blokuje, gdy
ktokolwiek zajmuje `workflow_slot`. Tutaj blokuje tylko pracę związaną **z tym samym
profilem**, która może jeszcze wejść w etap kadrowania: `queued`, `running`, `paused`,
`failed` lub `cancelled`. Trzy ostatnie stany zwalniają `workflow_slot`, ale stan maszyny
pozwala je wznowić, więc sprawdzanie samego slotu zostawiałoby tę samą lukę po pauzie albo
błędzie. `review_ready` i `completed` nie mogą wrócić do kadrowania i nie blokują zmiany;
run na innym profilu nie dotyka tych regionów. Kod błędu pozostaje `active_run`, status
`409`.

Komunikat w interfejsie mówi wprost, dlaczego: część klatek zdążyłaby użyć nowego
regionu, a część nie.

## 3. Rozstrzygnięcie: stan początkowy zwijania — **wszystkie rozwinięte**

| Wariant | Odrzucony, bo |
|---|---|
| wszystkie zwinięte | panel anotacji jest autofocusowany i używany pod presją czasu; start w stanie zwiniętym dokłada krok przed każdym pierwszym wyborem klasy i zmienia dzisiejsze zachowanie każdego istniejącego profilu |
| zapamiętywany | ten sam ekran otwierałby się różnie u dwóch operatorów i ukrywałby klasy z powodu niewidocznego w interfejsie; niezmiennik FE-008-FIX1 („filtr zawężający do jednego wyniku potwierdza `Enterem`”) ma zachowywać się identycznie przy każdym otwarciu |
| **wszystkie rozwinięte** | zwijanie jest wygodą przeglądania, więc domyślny jest stan, w którym nic nie jest schowane; operator zwija to, czego w tej sesji nie potrzebuje |

Stan żyje w komponencie (per mount). `AnnotationPopover` montuje listę z
`key={annotation?.id}`, więc każdy box otwiera się tak samo — to celowe, nie uboczne.

## 4. Rozstrzygnięcie: filtr ma pierwszeństwo przed zwinięciem

Wpisanie czegokolwiek w filtr **zawiesza** zwinięcie: każda grupa z trafieniem jest
rozwinięta, a trójkąt jest w tym czasie nieaktywny (`disabled`, `aria-expanded="true"`).
Zapamiętany stan zwinięcia wraca po wyczyszczeniu filtra.

Wariant odrzucony: pozwolić na zwijanie w trakcie filtrowania. Wtedy albo trójkąt kłamie
(pokazuje „zwinięte”, a treść widać), albo filtr ukrywa wynik — a to jest dokładnie to,
czego ticket zabrania.

---

## 5. Design Plan (obowiązkowy, `new-component.md` §2.2)

Przeczytane: `frontend/src/styles/tokens.css`, moduły wytycznych dla użytych ID,
katalog komponentów (`new-component.md` §4–5).

### 5.1 Nowy komponent wspólny: `CollapsibleGroup`

Powód istnienia: ticket wymaga tego samego zachowania zwijania w `GroupedOptionList`
(panel anotacji) i na liście klas ekranu profilu. Bez wspólnego komponentu byłyby dwie
implementacje trójkąta, dwa `aria-expanded` i dwa zestawy klawiszy.

- [x] **Layout/Siatka** (GRID-01/02, SPACING-01): nagłówek `display: flex`, `gap: var(--size-xs)`;
      treść grupy `display: grid`, `gap: calc(var(--size-xs) / 2)` — tak samo jak dzisiejszy
      `.df-grouped-options__group`, żeby wstawienie komponentu nic nie przesunęło.
- [x] **Typografia** (TYPO-07, FONTSIZE-*, LHEIGHT-*): etykieta grupy `--font-size-xs`,
      `--font-weight-semibold`, `--letter-spacing-wide`, `--line-height-tight`, `UPPERCASE` —
      dokładnie to, co dziś ma `.df-grouped-options__group-title`. Hierarchię niesie waga i
      kolor, nie drugi rozmiar.
- [x] **Kolory** (COLOR-*): etykieta `--color-text-weak-default`, trójkąt `currentColor`;
      hover nagłówka `--color-surface-neutral-hover` (OPACITY-02, warstwa 0.06).
- [x] **Obramowania** (BORDER-*, RADIUS-*): brak obrysu — grupy rozdziela odstęp, nie kreska
      (BORDER-02). Przycisk trójkąta `--radius-sm`, mniejszy niż kontener listy (RADIUS-04).
- [x] **Cienie** (SHADOW-*): żadnych. Grupa nie jest powierzchnią uniesioną.
- [x] **Interakcje** (COLOR-07, OPACITY-*): hover trójkąta `--color-surface-neutral-hover`,
      `focus-visible` — globalny pierścień `--focus-ring-width` w kolorze marki z `Button`,
      `disabled` (filtr aktywny) `--opacity-disabled`.
- [x] **Komponenty** (§4–5): trójkąt renderuje `Button` (`size="sm"`, `variant="muted"`) —
      `Button` jest jedynym dozwolonym `<button>` w aplikacji. Dodaję do `ButtonProps`
      wyłącznie `ref?: Ref<HTMLButtonElement>`, wzorem `TextFieldProps.ref`; wygląd, warianty
      i stany bez zmian.

Znacznik: glif `▾` (rozwinięte) / `▸` (zwinięte) w `aria-hidden` spanie. Glif zamiast
trójkąta z `border`, bo trójkąt z obramowań wymaga arbitralnych pikseli, a glif skaluje się
z `--font-size-xs` i nie wprowadza wartości spoza tokenów.

### 5.2 `GroupedOptionList` — zmiany

- grupa renderuje się przez `CollapsibleGroup` zamiast własnego `div[role="group"]`;
- `mode="multiple"`: wiersz-checkbox grupy dostaje `aria-expanded` oraz `ArrowLeft`/`ArrowRight`
  (zwiń/rozwiń); trójkąt jest afordancją myszy i ma `tabIndex={-1}`, żeby lista nadal miała
  jeden przystanek `Tab` (wymóg z §5 katalogu: „pole filtrowania jest wejściem i wyjściem z listy”);
- `mode="single"`: trójkąt **jest** wierszem nagłówka grupy i bierze udział w roving tabindex
  (`tabIndex` sterowany `activeId`), `Enter`/`Spacja` zwija i rozwija;
- podczas filtrowania wymuszone otwarcie wyłącza trójkąty i usuwa je z modelu roving tabindex;
  strzałki, `Home` i `End` przechodzą wtedy wyłącznie po aktywnych wynikach, nie próbują
  ustawić fokusa na wyłączonym przycisku;
- wiersze pozycji zwiniętej grupy **nie wchodzą** do tablicy `rows`, więc strzałki ich nie
  odwiedzają — zwijanie nie tworzy pułapki fokusa;
- treść grupy jest zawsze w DOM z atrybutem `hidden`, więc `aria-controls` nigdy nie wskazuje
  nieistniejącego identyfikatora.

Kompromis ARIA, świadomy: w trybie `single` korzeń listy ma `role="listbox"`, a wewnątrz
`div[role="group"]` pojawia się `<button>`. Ścisła konformancja chce w `listbox` wyłącznie
`option` i `group`. Dzisiejszy kod ma tam `<p aria-hidden="true">`, czyli też nie jest ściśle
konformantny; wybór jest między nieosiągalnym z klawiatury trójkątem a przyciskiem w grupie.
Wybieram osiągalny trójkąt.

### 5.3 Ekran profilu — lista klas i formularz regionu

- **lista klas**: te same cztery grupy przez `CollapsibleGroup`; wiersze zostają takie, jakie są
  (nazwa + `StatusBadge` + `Button` „Zmień nazwę”), więc FE-016 działa bez zmian;
- **formularz regionu**: `Button` „Dodaj region”, `RegionOverlay` w `interactionMode="draw"`
  (ten sam mechanizm co przy tworzeniu profilu — §4 mówi, że to jedyny dozwolony sposób
  rysowania nad `<img>`), `TextField` na nazwę, `Notice` o braku wpływu na bieżący run,
  `InlineError` na odpowiedź backendu;
- **`Notice`** (tone `info`) jest widoczny od chwili wejścia w tryb dodawania, czyli **przed**
  zapisem, wzorem „Ukończone eksporty pozostają niezmienne” z FE-016.

### 5.4 Taksonomia grup

Nowy moduł `src/api/categoryGroups.ts` — obok `categoryNames.ts`, który też jest logiką
domenową współdzieloną przez oba ekrany. Cztery grupy w kolejności:
`Pola HUD (gra)`, `Liczby`, `Litery`, `Symbole`. Klasyfikacja po `kind` i po nazwie
(`0-9` → `Liczby`, `A-Z` → `Litery`, reszta znaków → `Symbole`). Pusta grupa nie jest
renderowana.

Ostrzeżenie FE-016 przestaje porównywać `kind` — porównuje **identyfikator grupy**, więc
zmiana `7` → `A` (obie `character`) też jest przejściem między grupami i też ostrzega.

---

## 6. Przebieg prac

### 6.1 Commity implementacyjne

| Commit | Zakres |
|---|---|
| `e1322c8` | plan, rozpoznanie i rozstrzygnięcia `active_run` / stanu zwijania |
| `a6f9c92` | repozytorium, use case i trasa dodania regionu wraz z testami kontraktu |
| `c67a3be` | wspólna taksonomia czterech grup, `CollapsibleGroup`, integracja pickerów i test filtra przez zwinięcie |
| `54833fd` | interfejs dodania regionu na ekranie profilu, grupy klas na tym ekranie i aktualizacja ostrzeżenia FE-016 |
| `0cf9905` | scenariusz Playwright/Visual QA FE-018 i aktualizacja historycznego testu FE-016 do czterech grup |
| `01fbf81` | poprawki po cold review: pełna blokada pracy, którą można uruchomić/wznowić, i prawidłowy fokus przy filtrze |

### 6.2 Sondy przed pełną bramką

- `uv run --frozen pytest backend/tests/test_profile_region_api.py -q` — **15/15 PASS**;
- `uv run --frozen ruff format --check` — **272 pliki poprawnie sformatowane**;
- `uv run --frozen ruff check` — **PASS**;
- `uv run --frozen python -m mypy` — **PASS, 100 plików źródłowych**;
- `npm run typecheck` — **PASS**;
- `npm test` przed cold review — **43/43 pliki, 705/705 testów PASS**;
- test falsyfikowalny filtra: grupa `Liczby` zostaje zwinięta, klasa jest niewidoczna,
  wpisanie jej nazwy pokazuje wynik, a wyczyszczenie filtra przywraca wcześniejsze zwinięcie;
- test FE-016 obejmuje też przejście `7` (`Liczby`) → `A` (`Litery`) bez zmiany `kind`,
  więc ostrzeżenie naprawdę rozumie cztery grupy, a nie tylko dawny podział `character/game`.

### 6.3 Cold review i dwie naprawy przed bramką

Niezależny reviewer odtworzył na `0cf9905` dwa blokery:

1. po pauzie `workflow_slot` znikał, więc API przyjmowało region (`201`), a wznowiona
   kolejna klatka tego samego runu dostawała już inny zestaw regionów;
2. w trybie `single` filtrowanie wyłączało przyciski grup, ale zostawiało je w tablicy
   nawigacji; `Home`/strzałka próbowały fokusować wyłączony przycisk.

Commit `01fbf81` zamknął oba przypadki. Blokada obejmuje teraz `queued`, `running`,
`paused`, `failed` i `cancelled` tego samego profilu; `review_ready` i `completed` są
bezpieczne, bo nie wracają do kadrowania. Regresja klawiatury przechodzi sekwencję
`ArrowDown` → `End` → `Home` → `ArrowUp` przy aktywnym filtrze. Po poprawce:

- backend regionów: **15/15 PASS**;
- `GroupedOptionList` + ekran profilu: **23/23 PASS**;
- `npm run typecheck`: **PASS**.

Finalny cold review zakresu `234aea2..01fbf81` zakończył się bez otwartych ustaleń.
Recenzent niezależnie uzyskał **15/15** testów backendu, **41/41** wskazanych testów
frontendu i powtórzył naprawioną sekwencję fokusa w prawdziwym Chromium. Pełny zapis:
`artifacts/fe-018-cold-review/index.md`.

### 6.4 Visual QA — oględziny pełnej rozdzielczości

`fe018-visual-qa.spec.ts`: **1/1 PASS**. Sprawdzone ręcznie wszystkie dziesięć PNG przy
1440×1000 i 1920×1080, bez `fullPage`, ponownie po pełnej bramce:

- **dodawanie regionu:** ostrzeżenie „Nowy region obowiązuje od kolejnego runu” jest
  widoczne przed zapisem, nad kanwą; szkic prostokąta ma czytelny obrys, pole nazwy i akcje
  pozostają w naturalnej kolejności, a nic nie nachodzi na nawigację ani krawędź karty;
- **profil — grupy rozwinięte:** cztery nagłówki `Pola HUD (gra)`, `Liczby`, `Litery`,
  `Symbole` są jednoznaczne, wiersze i plakietki zachowują wyrównanie, a trójkąty mają
  widoczny stan rozwinięcia;
- **profil — grupy zwinięte:** zwinięte nagłówki pozostają widoczne, znikają tylko ich
  wiersze; karta nie zostawia przypadkowych pustych bloków;
- **anotacje:** ten sam język trójkątów i nagłówków działa w wąskim panelu przy obu
  viewportach; stan rozwinięty nie zasłania przycisków „Usuń”/„Zmień nazwę”, a po
  zwinięciu wszystkie nagłówki mieszczą się bez przycięcia;
- szeroki viewport powiększa kanwę i wiersze, a 1440×1000 zachowuje czytelny, kompaktowy
  panel; nie ma poziomego przepełnienia, obciętych etykiet ani kolizji z kontrolkami zoomu.

### 6.5 Pełna bramka

Jeden nieprzerwany przebieg absolutnej ścieżki `scripts/check.ps1`: **9/9 PASS, 0 SKIP**.

| Etap | Wynik |
|---|---|
| backend format | PASS — 272 pliki |
| backend lint | PASS |
| backend typy | PASS — 100 plików źródłowych |
| backend testy | PASS — 389/389 |
| frontend typy | PASS |
| frontend testy | PASS — 43/43 pliki, 706/706 |
| frontend build | PASS |
| E2E | PASS — 24/24 |
| E2E root safety | PASS — 2/2 |

Bramka ponownie wyrenderowała 25 historycznych PNG. Przed przebiegiem 28 śledzonych PNG
skopiowano do kontrolowanego katalogu tymczasowego; po bramce wszystkie przywrócono przez
`Copy-Item` (nie `git restore`) i potwierdzono **0** zmodyfikowanych historycznych PNG.
Dziesięć nowych PNG FE-018 pozostało jako dowód ticketu.
