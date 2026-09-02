# FE-005 — log implementacji

## Design Plan

Tryb powierzchni: **Operate**. Autorytet wizualny: zatwierdzona makieta
`artifacts/fe-005-review-layout`, istniejące tokeny
`frontend/src/styles/tokens.css`, klasy `.df-*` oraz katalog komponentów z
`.agent/guidelines/new-component.md`. Makieta określa hierarchię i zachowanie;
wartości wizualne pochodzą wyłącznie z istniejących tokenów.

### Ocena układu przed zmianą

- **Reading order / squint test:** obecny ekran prowadzi od dużego formularza
  tworzenia bbox, przez obraz, dopiero do listy klatek i rozwiniętych kart
  anotacji. Obraz jest wizualnie główny, ale decyzje dotyczące bieżącej
  anotacji leżą daleko poza nim i często poniżej pierwszego viewportu.
- **Grouping:** geometria, klasa i akcje jednej anotacji są związane, lecz
  powielone pełnowymiarowe karty nadają każdej z nich wagę osobnej sekcji.
  Nawigacja oraz decyzje klatki są rozdzielone między listę i dół podglądu.
- **Rhythm / density:** powtarzane odstępy `--size-sm` / `--size-md` są spójne,
  ale każda anotacja rezerwuje komplet pól i przycisków, więc gęstość jest
  niedopasowana do częstej operacji zmiany jednej klasy.
- **Structure:** topologia `preview → frames + inspector` zachowuje wszystkie
  funkcje, lecz nie odpowiada sekwencji pracy `nawiguj → oceń bbox → popraw →
  zdecyduj`. Docelowo decyzja i nawigacja są nad obrazem, a szczegół anotacji
  jest lokalnym popoverem.
- **Adaptation / extremes:** edytor pozostaje desktop-only za `WidthGuard`
  1280 px. Przy 1280 i 1440 px dolne kolumny mają się reflowować bez ściskania
  obrazu; długie nazwy klas są obcinane lub zawijane bez zmiany kolejności DOM.
  Popover ma sprawdzać cztery strony boksu oraz granice obrazu w realnym DOM.
- **Mechanical scan:**
  `node .agents/skills/impeccable/scripts/detect.mjs --json --scope layout frontend/src/features/annotations frontend/src/components/common/RegionOverlay`
  zwrócił `[]` przed zmianami. Scan nie rozstrzyga hierarchii ani kolizji
  popovera.

### Teza przestrzenna

Główna ścieżka zadania: **pasek bieżącej klatki → obraz i bbox → popover
wybranej anotacji → decyzja klatki**. Lista klatek i panel klas wspierają
nawigację i selekcję, ale nie konkurują z obrazem. Nawigacja, licznik i decyzje
tworzą jedną zwartą grupę; narzędzia rysowania są osobną grupą nad obrazem;
filtr należy do listy klatek; źródło i confidence należą bezpośrednio do bbox.
Rytm: `--size-xs` wewnątrz zwartych grup, `--size-sm` między narzędziami,
`--size-md` między panelami. Struktura pozostaje liniowa w DOM i wizualnie.

### Elementy interfejsu w zakresie

- pasek bieżącej klatki: poprzednia/następna, `pozycja / liczba`, timestamp,
  status, `Odrzuć`, `Zaakceptuj klatkę`, skróty `X` i `A`;
- narzędzia nowego bbox: wybór klasy, tryb rysowania, precyzyjne dodanie z pól;
- obraz i `RegionOverlay`: bbox OCR/manual, label klasy, confidence OCR,
  zaznaczenie, fokus, błąd, move i cztery uchwyty resize;
- popover zaznaczonej anotacji: filtr klasy, lista wyników, `Usuń`, `Zapisz`,
  `Escape`, współrzędne, precyzyjne pola geometrii i przerysowanie;
- panel klas: licznik wszystkich anotacji, wiersze klas z licznikami i źródłem,
  cykliczne zaznaczanie wielu anotacji tej samej klasy;
- panel klatek: filtry `Wszystkie`, `Oczekujące`, `Zaakceptowane`, `Odrzucone`
  wraz z licznikami, status każdego wiersza, wybór i paginacja;
- stany: loading, empty, błędy zapytań/mutacji, zamrożona zaakceptowana lub
  odrzucona klatka, trwający OCR, disabled i focus-visible;
- zachowanie szerokości: działanie przy 1280 i 1440 px; poniżej 1280 istniejący
  `WidthGuard` zastępuje edytor komunikatem.

### Moduły i ID wytycznych UI/UX

- [x] Layout/siatka: pełny moduł `GRID-00..14`, `SPACING-01..13` przeczytany.
  Zastosowanie: `GRID-01`, `GRID-02`, `GRID-05`, `GRID-08`, `GRID-09`,
  `GRID-10`, `GRID-11`, `GRID-12`; `SPACING-01`, `SPACING-02`, `SPACING-03`,
  `SPACING-04`, `SPACING-07`, `SPACING-08`, `SPACING-10`, `SPACING-11`,
  `SPACING-13`. Wyłącznie `--size-*`, `--control-height-*`,
  `--measure-copy` i `--workspace-min-width`.
- [x] Typografia: pełny moduł `TYPO-01..21`, `FONTSIZE-01..11`,
  `LHEIGHT-01..14`, `LSPACE-01..09`, `PARASPACE-01..06`, `OPACITY-01..02`,
  `CASING-01..03` przeczytany. Zastosowanie: `TYPO-02`, `TYPO-06..11`,
  `FONTSIZE-02`, `FONTSIZE-08..10`, `LHEIGHT-09..11`, `LSPACE-02`,
  `LSPACE-07`, `LSPACE-09`, `CASING-02`, `CASING-03`. Polskie sentence case,
  tabularne liczby i mono tylko dla współrzędnych/skrótów.
- [x] Kolory: pełny moduł `COLOR-01..10` przeczytany. Zastosowanie:
  `COLOR-07`, `COLOR-08`, `COLOR-09`, `COLOR-10`, `OPACITY-02`.
  Pomarańczowy token marki oznacza OCR, zielony token success + linia
  przerywana oznacza manual; tekst źródła zabezpiecza znaczenie bez koloru.
- [x] Obramowania: pełne moduły `BORDER-01..09`, `BWIDTH-01..14`,
  `RADIUS-01..05` przeczytane. Zastosowanie: `BORDER-02`, `BORDER-03`,
  `BORDER-05..07`, `BWIDTH-06`, `BWIDTH-08..14`, `RADIUS-01..05`.
  Bbox pozostaje ostrym prostokątem; popover i pola używają tokenów radius.
- [x] Cienie/warstwy: pełne moduły `OVERLAY-01..07`, `SHADOW-01..05`
  przeczytane. Zastosowanie: `OVERLAY-04`, `OVERLAY-06`, `SHADOW-03`,
  `SHADOW-05`. Popover używa `--shadow-elevation-high`; niewidoczne warstwy
  etykiet nie blokują wskaźnika.
- [x] Interakcje: `GRID-05`, `COLOR-07`, `BORDER-06`, `BWIDTH-09..13`,
  `OPACITY-02`, `OVERLAY-06`, FE-08. Wybrane stany mają ARIA i kształt/tekst,
  skróty ignorują fokus w polach formularza, a DOM/focus order zgadza się z
  kolejnością wizualną.
- [x] Komponenty: reużywane `Panel`, `RegionOverlay`, `Button`, `TextField`,
  `SelectField`, `StatusBadge`, `Notice`, `UiStates`, `FrameList` oraz
  przebudowany `AnnotationList`. Nie powstaje drugi `selectedId` ani inline
  `<button>` / `<input>`.

## Rozstrzygnięcia przed kodem

1. **Pole klasy podpowiada wyłącznie klasy profilu; bieżąca zmapowana klasa
   jest pierwszym aktywnym wyborem.** Surowa wartość OCR nie jest osobną
   propozycją, bo kontrakt `Annotation` jej nie przenosi, a tworzenie klas w
   locie jest poza zakresem. Pokazanie wartości spoza profilu sugerowałoby, że
   da się ją zapisać i obchodziłoby zamknięty alfabet. Pochodzenie i confidence
   OCR pozostają widoczne przy bbox.
2. **`A` i `X` nie przechodzą automatycznie do następnej klatki.** Decyzja
   zmienia trwały dataset, a akceptacja jest w obecnej maszynie stanów
   terminalna. Pozostanie na klatce pokazuje wynik mutacji i nie ukrywa
   przypadkowego skrótu; przejście jest osobną, jawną strzałką.
3. **Popover zamyka się po udanym zapisie przez wyczyszczenie wspólnego
   `selectedId`.** Zwalnia obraz po zakończeniu decyzji i nie wymaga drugiego
   stanu `isOpen`; `Escape` robi to samo bez mutacji. Błąd zapisu pozostawia
   popover otwarty z komunikatem.

## Ochrona zachowania FE-002 / FE-002-FIX1

Mechanika trafienia najmniejszego bbox, offset chwytu, move, resize, clamp,
skala hit-targetu uchwytów i kursory pozostają bez zmian. Rozszerzenie
`RegionOverlay` będzie wyłącznie prezentacyjne (etykiety i slot popovera) i nie
zmieni obsługi zdarzeń ani geometrii gestów.

