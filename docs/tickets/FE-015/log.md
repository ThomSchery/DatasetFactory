# FE-015 — log implementacji

## 2026-09-15 — Design Plan przed zmianą UI

### Kierunek i zakres

Tryb powierzchni: **Operate**. Zmiana zachowuje baseline „Home — Impeccable”
i układ FE-014: toolbar na pełnej szerokości, lewa kolumna operacyjna, kadr po
prawej. Priorytetem jest bezpieczna edycja bboxa: panel klasy pozostaje stale
widoczny, menu kontekstowe dodaje tylko istniejącą akcję „Usuń”, a kontrolki
zoomu odsłaniają już istniejący mechanizm 1×–8×. Nie powstają nowe operacje ani
zmiany kontraktu API.

### Wszystkie elementy interfejsu i jedenaście pozycji

| # | Element | Plan | Komponent / kontrakt |
|---|---|---|---|
| 1 | Panel „Anotacja” | stale zamontowany; bez celu ma pusty filtr, pełną listę bez zaznaczenia i nieaktywne akcje mutujące | `AnnotationPopover`, `GroupedOptionList`, `Button`, `StatusBadge` |
| 2 | Bbox — menu kontekstowe | jednoelementowe menu „Usuń”; mysz i `Shift+F10`/klawisz menu; zamknięcie Escape, poza menu i po utracie fokusa | `RegionOverlay`, istniejący `Button`; ta sama funkcja `onRemove` co Delete/przycisk panelu |
| 3 | Skróty A/X/Enter/R | usunięte oznaczenia (`kbd`, tooltipy) i globalne handlery; strzałki nudge pozostają | `FrameEditor`, `AnnotationPopover`, `FrameToolbar` |
| 4 | HUD zoomu | przyciski `−`, `+`, `RESET` przy procencie; stan disabled na 1×/8×; kotwica w centrum kadru | `RegionOverlay`, istniejący `Button` |
| 5 | Panel „Dane klatki” | usunięty wraz z metadanymi i osieroconym CSS; komunikaty operacyjne przeniesione do inspektora | `FrameEditor`, `Panel`, `Notice`, `InlineError` |
| 6 | Opis „Anotacje na klatce” | usunięty bez zmiany nagłówka i badge liczby | `Panel` w `FrameEditor` |
| 7 | Nazwa klasy | lewa krawędź wiersza | `ClassList` |
| 8 | Licznik klasy | prawa część szerokiego przycisku, przed źródłem | `ClassList` |
| 9 | Znacznik OCR/Ręczna | osobna skrajna kolumna po prawej | `ClassList`, `StatusBadge` |
| 10 | Suwak przewijania | wspólne tokenowe zaokrąglenie toru i thumb w panelach/listach; bez przycisków strzałek WebKit | CSS `AnnotationReviewScreen` / `GroupedOptionList` |
| 11 | Chevron selektora klatki | większy padding po prawej bez zmiany `SelectField` poza tą powierzchnią | `FrameToolbar` + lokalny CSS |

### Moduły i ID UI/UX

- **Siatka i odstępy:** GRID-00/01/02 (wyłącznie skala tokenów), GRID-03/05
  (min. 32×32 px dla przycisków zoom/menu), GRID-08/10/12 (kontrolki nie
  rozciągają się bez potrzeby, selektor zachowuje ograniczenie),
  SPACING-01/02/06/07/13 (grupy HUD/menu/list i tokenowe przerwy).
- **Kolor i stany:** COLOR-01..10, szczególnie COLOR-07/08/09/10; wszystkie
  powierzchnie, teksty, status usuwania i disabled korzystają z istniejących
  tokenów. OPACITY-01/02 dla stanu disabled/hover.
- **Obramowania i promienie:** BORDER-01/02/03/05/06, BWIDTH-01/03/06/09/10/13,
  RADIUS-01..05. Menu używa `stroke-strong` i `--radius-md`, suwak
  `--radius-pill`; bbox pozostaje dokładnym prostokątem `--radius-none`.
- **Nakładki i głębia:** OVERLAY-01/03/05/06. Menu jest lokalną nakładką nad
  kadrem bez scrimu; nie blokuje niewidocznie kanwy i tłumi natywne menu tylko
  nad bboxem. SHADOW-01..05: menu użyje istniejącego tokenu
  `--shadow-elevation-high`, bez arbitralnego cienia.
- **Typografia:** TYPO-01/02/06/07/08/11, FONTSIZE-01/02/06/08/09/10,
  LHEIGHT-09/10/11, LSPACE-01/02/09, CASING-01/02. Bez nowych fontów i
  rozmiarów; `RESET`, `OCR` i `RĘCZNA` pozostają krótkimi etykietami uppercase
  z istniejącym trackingiem badge/przycisku.
- **Dostępność interakcji:** GRID-05, BORDER-06, COLOR-08, OVERLAY-06;
  widoczny fokus, nazwy ARIA, roving tabindex bboxów, klawiaturowe menu oraz
  semantyczne `disabled` dla braku celu i granic zoomu.

### Checklista obowiązkowa

- [x] Layout/Siatka: `--size-xs/sm/md`, `--control-height-sm`; pełnoszerokie
  wiersze i trzy logiczne kolumny (GRID-01/02/05, SPACING-01).
- [x] Typografia: istniejące `--font-size-xs/sm`, `--line-height-tight/standard`,
  `--font-weight-semibold`; bez nowej skali (FONTSIZE-*, LHEIGHT-*, TYPO-*).
- [x] Kolory: tylko istniejące tokeny semantyczne tła, tekstu, stroke, brand i
  error (COLOR-*).
- [x] Obramowania: menu/scrollbar/select używają tokenów stroke oraz
  `--radius-md/pill`; bbox zachowuje `--radius-none` (BORDER-*, RADIUS-*).
- [x] Cienie: wyłącznie `--shadow-elevation-high` dla rzeczywiście pływającego
  menu; bez cienia na stałym panelu (SHADOW-03/05).
- [x] Interakcje: hover/active/disabled/focus, Escape/outside/blur, mysz i
  klawiatura; brak mutacji bez celu (COLOR-07, OPACITY-02, BORDER-06).
- [x] Komponenty: katalog `common` sprawdzony; wszystkie przyciski przez
  `Button`, pola/lista przez `GroupedOptionList`, geometria przez
  `RegionOverlay`; brak potrzeby nowego komponentu wspólnego.

### Decyzje przed kodem

- Krok zoomu: współczynnik **1,25×**, taki sam jak istniejący `Ctrl`+kółko.
  Zachowuje jedną mechanikę i daje czytelne 25% na pierwszym kroku bez skoków
  utrudniających precyzyjną kontrolę bboxów. Przyciski kotwiczą skalę w środku
  widocznego kadru; `RESET` ustawia dokładnie 1× i translację 0/0.
- Menu ma jedną pozycję „Usuń”. To jedyna wskazana i już istniejąca operacja,
  więc nie dokładamy przypadkowych akcji. Wywołuje `onRemove(id)`, czyli ten sam
  tor mutacji co Delete/Backspace i przycisk panelu.
- Zastępcza kotwica testu „klik poza panelem”: panel
  `.df-review-workspace__inspector`, konkretnie nagłówek „Anotacje na klatce”.
  Jest stale obecny w lewej kolumnie, jednoznacznie leży poza
  `AnnotationPopover` i zachowuje siłę asercji FE-014 po usunięciu „Dane klatki”.

