# FE-006 — log implementacji

## Design Plan przed kodem

### Ocena układu

- Tryb powierzchni: **Operate**. Najczęstsza ścieżka to filtr → wybór klatki →
  decyzja na obrazie → akcja akceptacji/odrzucenia.
- Kolejność czytania przed zmianą jest rozbita: nawigacja stoi wewnątrz panelu
  obrazu, filtr w osobnym panelu kart klatek, a klasy dopiero pod obrazem.
  Źródłowo potwierdzają to obszary siatki `preview preview / frames inspector`.
- Gęstość panelu obrazu jest zawyżona przez formularz `Klasa nowego bbox` oraz
  cztery pola geometrii. Te kontrolki dublują rysowanie i popover, przez co obraz
  traci pierwszeństwo.
- Przy 1280 i 1440 px `WidthGuard` gwarantuje desktopową powierzchnię roboczą;
  poniżej 1280 px istniejący komunikat zastępuje edytor. Nie powstaje drugi,
  konkurencyjny układ mobilny.
- Skan Impeccable przed zmianą: `[]`. Brak findingów mechanicznych nie zmienia
  problemu hierarchii potwierdzonego makietą i pierwszym użyciem.

### Teza przestrzenna

1. Pełnoszeroki pasek operacyjny prowadzi: filtry po lewej, strzałki + natywny
   wybór klatki + licznik w środku, decyzje po prawej.
2. Pod paskiem zaczyna się właściwy edytor: kompaktowa kolumna klas i kopiowania
   po lewej, obraz z bboxami po prawej.
3. Metadane wspierają obraz, nie konkurują z nim. Formularz liczbowego tworzenia
   znika; precyzyjna geometria pozostaje w popoverze konkretnego bboxa.
4. Filtr, select, strzałki i licznik zawsze opisują ten sam przefiltrowany zbiór.
   Kopiowanie zachowuje osobny porządek czasowy backendu.

### Elementy interfejsu

- filtry `Wszystkie`, `Oczekujące`, `Zaakceptowane`, `Odrzucone` z licznikami;
- strzałki poprzednia/następna, natywny `SelectField` klatek oraz licznik pozycji;
- opcje klatek: numer, timestamp i status weryfikacji;
- akcje `Zaakceptuj`, `Odrzuć`, `Otwórz ponownie`;
- lewy panel `Anotacje na klatce`: lista klas, pochodzenie, liczby i kopiowanie;
- obraz, zapisane bboxy, niezapisany bbox-szkic i `AnnotationPopover`;
- komunikaty loading, empty, błędu obrazu, mutacji i zamrożonej klatki;
- usuwane kontrolki: `Klasa nowego bbox`, `Nowy x/y/width/height`,
  `Dodaj bbox z pól`, karty/paginacja panelu `Klatki runu`, nagłówek i opis
  `Obraz i bbox`.

### Semantyka szkicu

- Po zakończeniu rysowania powstaje wyłącznie stan klienta. Szkic ma
  przerywany, przygaszony obrys i tekstową etykietę „Szkic — wybierz klasę”.
- `POST /annotations` następuje dopiero po jawnym zapisie istniejącej klasy
  profilu. Nie ma domyślnej klasy zapisanej do datasetu.
- `Escape`, kliknięcie zapisanego bboxa, zmiana klatki albo filtra porzucają
  szkic bez mutacji. Błąd POST pozostawia szkic i zapytanie, aby można było
  poprawić klasę i ponowić.
- Brak dopasowania pokazuje jawny komunikat „Brak takiej klasy w profilu”; sam
  nieaktywny przycisk nie jest wystarczającą informacją.

### Moduły i ID wytycznych UI/UX

- [x] Layout/siatka: całe `GRID-00..14` i `SPACING-01..13`. Zastosowanie:
  `GRID-01`, `GRID-02`, `GRID-05`, `GRID-08`, `GRID-09`, `GRID-10`, `GRID-11`,
  `GRID-12`; `SPACING-01`, `SPACING-02`, `SPACING-03`, `SPACING-06`,
  `SPACING-07`, `SPACING-08`, `SPACING-10`, `SPACING-11`, `SPACING-13`.
- [x] Typografia: całe moduły typografii. Zastosowanie: `TYPO-02`, `TYPO-06`,
  `TYPO-07`, `FONTSIZE-02`, `FONTSIZE-08`, `FONTSIZE-09`, `LHEIGHT-09`,
  `LHEIGHT-10`, `LHEIGHT-11`, `LSPACE-02`, `LSPACE-09`, `CASING-02`.
  Timestampy i liczniki używają mono/tabular; etykiety pozostają sentence case.
- [x] Kolory: całe `COLOR-01..10`. Zastosowanie: `COLOR-07`, `COLOR-08`,
  `COLOR-09`, `COLOR-10`, `OPACITY-02`. Stan szkicu różni się także kształtem
  linii i tekstem, nie tylko kolorem.
- [x] Obramowania: całe `BORDER-01..09`, `BWIDTH-01..14`, `RADIUS-01..05`.
  Zastosowanie: `BORDER-02`, `BORDER-03`, `BORDER-05`, `BORDER-06`,
  `BORDER-07`, `BWIDTH-06`, `BWIDTH-10`, `BWIDTH-11`, `BWIDTH-13`,
  `RADIUS-02`, `RADIUS-03`, `RADIUS-05`.
- [x] Warstwy/cienie: całe `OVERLAY-01..07`, `SHADOW-01..05`. Zastosowanie:
  `OVERLAY-04`, `OVERLAY-06`, `SHADOW-03`, `SHADOW-05` dla popovera; szkic
  pozostaje w SVG i nie tworzy nowej warstwy blokującej wskaźnik.
- [x] Interakcje: `GRID-05`, `COLOR-07`, `BORDER-06`, `OPACITY-02`,
  `OVERLAY-06`. Select jest natywny i zatrzymuje globalne skróty przez istniejący
  strażnik `INPUT/SELECT/TEXTAREA`; focus order zgadza się z DOM.
- [x] Komponenty: reużywane `Button`, `SelectField`, `Panel`, `DataList`,
  `StatusBadge`, `Notice`, `UiStates`, `RegionOverlay`, `AnnotationPopover`,
  `ClassList`. Nowy `FrameToolbar` jest komponentem feature-specific, bo scala
  dane i akcje wyłącznie ekranu review; nie powstaje duplikat komponentu common.

### Weryfikacja zaplanowana

- jsdom: select klatki, filtrowany zakres strzałek i licznik, blokada skrótów
  w select, porzucenie szkicu bez POST/licznika, pozostawienie szkicu po błędzie,
  jawny brak klasy, wybór klasy i POST dopiero przy zapisie;
- test klienta/harness: lista większa niż 100 klatek składa strony API w jeden
  wybór bez utraty kolejności;
- Chromium: pasek bez overflow, klasy po lewej, obraz bezpośrednio pod paskiem,
  szkic i popover nie zasłaniają się, focus widoczny;
- visual QA: PNG zostają odświeżone, obejrzane i zacommitowane świadomie;
- poza jsdom: rzeczywiste wymiary selecta, pozycje kolumn, overflow i placement
  popovera pozostają odpowiedzialnością Chromium.

## Ochrona FE-002 / FE-002-FIX1

Mechanika `RegionOverlay` — najmniejszy trafiony bbox, offset chwytu, move,
resize, clamp, hit-target uchwytu i kursory — pozostaje bez zmian. Jedyna zmiana
w komponencie wspólnym jest prezentacyjna: nowy tone `draft` dla klientowego
szkicu. Nie modyfikuje handlerów ani `geometry.ts`.

## Stan implementacji przed pełną bramką

- `FrameToolbar` scala filtr, natywną listę klatek, strzałki, licznik pozycji i
  akcje weryfikacji. Lista jest składana ze wszystkich stron API po 100 pozycji,
  a filtr świadomie zawęża zarówno opcje, jak i zakres strzałek.
- Panel klas i kopiowania jest pierwszą kolumną edytora, obraz drugą. Usunięto
  panel `Klatki runu`, nagłówek `Obraz i bbox` oraz cały formularz liczbowego
  tworzenia anotacji.
- Narysowany bbox pozostaje klientowym szkicem do czasu zapisu wybranej klasy.
  Porzucenie szkicu nie wywołuje POST, zaś nieudany POST zachowuje szkic.
- Test FE-005 o nawigacji niezależnej od filtra został świadomie odwrócony:
  sprawdza teraz pozycję i granice nawigacji w zbiorze przefiltrowanym. Test
  paginacji `FrameList` zastąpił test agregacji ponad 100 klatek w select.
- Lokalna weryfikacja przed Chromium: TypeScript — 0 błędów; Vitest — 38 plików
  i 510 testów; build — 301 modułów; skan Impeccable w zakresie zmiany — 0
  findingów.

## Granica jsdom

jsdom pilnuje semantyki i wywołań API, ale nie daje wiarygodnych pomiarów
rzeczywistej szerokości natywnego selecta, położenia kolumn, przepełnienia paska
ani kolizji popovera z bboxem. Te własności pozostają do sprawdzenia w Chromium
w pełnej bramce i przez świadomą inspekcję odświeżonego PNG.
