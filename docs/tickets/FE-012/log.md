# FE-012 — usunięcie formularza geometrii z panelu anotacji

## Plan i decyzje przed implementacją

### Cel i granice

Jedynym celem panelu po FE-012 jest wybór klasy, zapis klasy oraz usunięcie albo
porzucenie anotacji. Geometrię operator ustawia wyłącznie na `RegionOverlay`:
przeciąganiem bboxa, uchwytami narożników i strzałkami (`1 px`, z `Shift`
`10 px`), a oczekujący preview zatwierdza `Enter` spoza panelu.

Zakres nie obejmuje backendu, trybu ręki, zoomu ani mechaniki kanwy z FE-011.
Nie powstaje nowa kontrolka ani nowa treść panelu.

### Inwentarz UI

| Element | Decyzja FE-012 | Komponent / mechanizm |
|---|---|---|
| Nagłówek „Anotacja” / „Nowa anotacja · box” | zostaje | semantyczny `header` |
| Badge źródła i confidence | zostają | `StatusBadge` |
| Filtr i lista klas | zostają razem z `data-shortcut-scope` | `GroupedOptionList` |
| „Usuń” / „Porzuć box” | zostaje | `Button` |
| „Zapisz klasę” + wskazówka `Enter` | zostaje | `Button` |
| Badge i opis „Niezapisane” | zostaje dla preview | `StatusBadge` + tekst |
| Nagłówek `x · y · w · h` | usunąć | `details/summary` |
| Pola `x`, `y`, `width`, `height` | usunąć | cztery `TextField` |
| „Zapisz geometrię” | usunąć | `Button` |
| „Przerysuj bbox” / „Anuluj przerysowanie” | usunąć | `Button` + `redrawMode` |
| Bbox, uchwyty, drag, nudge i `Enter` | zostają jako jedyne sterowanie geometrią | `RegionOverlay` + `FrameEditor` |
| Notice o niezapisanym przesunięciu i blokada akceptacji | zostają | `Notice` + guard akcji |

Katalog wspólnych komponentów sprawdzony: używane pozostają `Button`,
`GroupedOptionList`, `StatusBadge`, `Notice` i `RegionOverlay`; `TextField` traci
tylko tego konsumenta. Nie ma podstaw do tworzenia nowego komponentu.

### Design Plan — moduły i ID wytycznych

- [x] Layout/siatka: moduł **Siatka i Odstępy**, `GRID-00/01/02/05/08/09/10`
  i `SPACING-01/02/03/04/07/08/13`. Panel zachowuje tokeny `--size-xs` i
  `--size-sm`; usunięcie sekcji usuwa jeden krok siatki, dzielnik i kontrolki,
  bez dodawania arbitralnych wymiarów.
- [x] Typografia: moduł **Typografia**, `TYPO-01/02/06/07/08`,
  `FONTSIZE-02/06/08/09`, `LHEIGHT-09/10/11/12`, `LSPACE-02/09` oraz
  `CASING-01/02`. Pozostaje istniejąca hierarchia nagłówka, mikrokopii i `kbd`;
  znika monospace'owy odczyt współrzędnych.
- [x] Kolory: moduł **Stylizacja elementów / Kolor**, `COLOR-01/07/08/09/10`.
  Bez nowych kolorów; warning „Niezapisane” nadal ma tekst i opis, więc znaczenie
  nie zależy wyłącznie od koloru.
- [x] Obramowania: moduł **Stylizacja elementów / Obramowanie i szerokość**,
  `BORDER-01/02/03/05/06`, `BWIDTH-01/02/03/06/09/10/11/12/13/14`.
  Usuwamy osierocony strukturalny `border-top` sekcji geometrii; fokus listy i
  przycisków pozostaje bez zmian.
- [x] Promienie: moduł **Stylizacja elementów / Promień**, `RADIUS-01/02/03/05`.
  Panel nadal używa `--radius-md`; nie wprowadzamy nowego zagnieżdżenia.
- [x] Cienie i warstwy: moduł **Stylizacja elementów / Nakładki i Cienie**,
  `OVERLAY-06`, `SHADOW-01/03/05`. Brak nowej warstwy lub cienia; interakcje
  overlayu pozostają widoczne i dostępne.
- [x] Interakcje: `GRID-05`, `COLOR-07`, `BORDER-06`, `OPACITY-01/02` oraz
  kontrakt `data-shortcut-scope`. Stany hover/active/disabled/focus istniejących
  wspólnych kontrolek nie zmieniają się.
- [x] Komponenty: katalog `frontend/src/AGENTS.md` / `new-component.md`
  sprawdzony; nowe komponenty wspólne nie są potrzebne.

### Decyzje techniczne

1. `FormState` zachowa wyłącznie baseline i bieżący wybór klasy. Stan draftu
   geometrii, jego synchronizacja oraz błędy formularza znikną.
2. `redrawMode` ma jedyne wejście w przycisku „Przerysuj bbox”; po usunięciu
   przycisku usunięte zostaną też typ, stan, warunki i gałąź `handleDraw`.
3. Walidacja przed `PATCH` nie zniknie. `FrameEditor` przejdzie na kanoniczne
   `fitsInSource`; helper zostanie uzupełniony o wymóg czterech liczb
   całkowitych, aby zachować cały kontrakt dawnego `parseGeometryDraft`.
   `geometryForm.ts` zostanie usunięty dopiero po potwierdzeniu braku konsumentów.
4. CSS usunie wyłącznie selektory należące do sekcji geometrii. Układ panelu,
   marker preview i dwukolumnowe osadzenie obok overlayu pozostają bez zmian.

### Plan dowodów regresyjnych

| Niezmiennik | Dowód po FE-012 |
|---|---|
| 1. Overlay = body żądania | nudge `100 → 103`; pełne `aria-label` bboxa na overlayu i dokładnie taki sam `bbox` w jednym `PATCH` po `Enter` |
| 2. Batching i bieżący CAS | trzy strzałki: zero `PATCH`; `Enter`: jeden `PATCH`, `expected_version` z bieżącej anotacji, także po refetchu |
| 3. Preview nie ginie | testy wyboru/zapisu klasy, błędu `PATCH`, refetchu i blokady akceptacji nadal czytają overlay oraz oba znaczniki „Niezapisane” |
| 4. Baseline gestu scoped | istniejące testy FE-009-FIX2/FIX3 zmiany anotacji/epoki nadal anulują stary gest bez wskrzeszenia preview |
| 5. Guard fokusu | strzałka w polu filtra klasy oraz na elemencie `data-shortcut-scope` nie zmienia `aria-label` bboxa i nie wysyła `PATCH` |
| 6. FE-009 + `Space` | pełny zestaw testów jednostkowych/integracyjnych oraz sondy FE-010 FIX2/FIX3/FIX4 pozostają w bramce |

Test komponentu dodatkowo sprawdzi brak odczytu `x/y/w/h`, czterech pól,
„Zapisz geometrię” i „Przerysuj bbox” zarówno dla anotacji zapisanej, jak i
świeżego draftu.

### Weryfikacja końcowa

- testy celowane komponentu, `FrameEditor`, geometrii i E2E;
- Playwright repozytoryjny jako zaakceptowany zamiennik in-app Browsera:
  screenshot panelu z niezapisanym preview oraz pomiar wysokości panelu i kanwy;
- jedna nieprzerwana bramka `scripts/check.ps1`, 9/9 bez SKIP;
- trzy etapy commitów: `docs(fe-012)`, `refactor(fe-012)`, `test(fe-012)`, a po
  wynikach końcowe uzupełnienie `docs(fe-012)`; bez push i merge.

## Wykonanie — druga sesja (zimna weryfikacja zastanej pracy)

Pierwsze podejście przerwał limit modelu po commitach `docs(fe-012)` 61bb0a5 i
`refactor(fe-012)` 7060e91 oraz niezacommitowanej przeróbce siedmiu plików
testowych. Druga sesja zaczęła się od przeczytania tego kodu na zimno, nie od
dalszej budowy na nim. Uruchomienie testów celowanych na zastanym stanie dało
**9 FAIL / 165 PASS** i pod tymi porażkami leżała regresja produkcyjna, nie
tylko niedokończone testy.

### Regresja P1 w zastanej pracy: pełna anotacja w body PATCH

Komunikat, który ją zdradził:

```
AssertionError: expected { bbox: { id: 'ann-1', …(10) }, …(1) } to deeply equal
{ Object (bbox, expected_version) }
```

`bbox` w żądaniu miał jedenaście pól zamiast czterech — leciały w nim `id`,
`version`, `status`, `confidence`, `category_id` i reszta anotacji.

Mechanizm: `parseGeometryDraft` był nie tylko walidatorem, ale i **zwężeniem**.
Budował `BBox` od zera z czterech pól formularza, więc cokolwiek helper gestu
włożył do swojego wyniku, nigdy nie docierało do żądania. `nudgeRect` zwraca
`{ ...rect, x: next }`; przy nudge'u `rect` to cała anotacja
(`FrameEditor.tsx:447-452` bierze `selectedAnnotation`, gdy nie ma jeszcze
preview). Zastąpienie parsera samym `fitsInSource` zachowało walidację i
zgubiło zwężenie.

Dlaczego to jest P1 tej samej rodziny, co FE-009-FIX1: znowu „to, co widać, nie
jest tym, co idzie w żądaniu" — tym razem nie liczbą, lecz ładunkiem. Backend
dostawał w polu geometrii obiekt z `version` i `status`, których to pole nie
opisuje.

Jak złapane: nie przez przegląd diffu, tylko przez uruchomienie testów zastanej
pracy przed dalszą pracą; asercje `toEqual` na body żądania są dokładne, więc
nadmiarowe klucze same się ujawniły. **Wniosek dla recenzenta:** przy usuwaniu
warstwy parsującej sprawdzaj nie tylko to, co ona walidowała, ale i to, co
normalizowała po drodze.

Naprawa: `toBBox` w `FrameEditor.tsx` — te same cztery liczby, na tej samej
granicy, na której siedział parser: preview rysowany przez overlay i body
żądania. Objęte: nudge, gest myszą, draft i `Enter`.

### Decyzja: preview dogoniony przez serwer przestaje być preview

Formularz trzymał to per pole — pole, którego operator nie dotknął, szło za
baselinem serwera, więc po refetchu panel pokazywał i zapisywał nowszą
geometrię. Overlay nie ma pojęcia „pole czyste", więc po usunięciu formularza
sam preview musi ustąpić, gdy mówi dokładnie to samo co zapisana anotacja.

Bez tego: refetch przesuwa anotację (np. `x 101 → 188`), overlay zostaje na
`101`, znacznik „Niezapisane" wraca dla przesunięcia, którego nikt nie zrobił, a
`Enter` cofa nowszą geometrię. To jedyna zmiana zachowania w tym tickecie poza
usunięciem; wynika z punktu 1 listy „co musi przeżyć" i jest udowodniona testem
`resumes server overlay sync after a refetch catches up with the preview`.

Zakres jest wąski: preview znika wyłącznie wtedy, gdy `sourceRectsEqual` z
zapisaną anotacją. Żadne niezapisane przesunięcie nie ginie.

### Pozostałe naprawy w przerobionych testach

| Test | Co było nie tak | Rozwiązanie |
| --- | --- | --- |
| `nudges a draft in source pixels…` | fokus przeniesiony na opcję overlayu, a `RegionOverlay` sam zjada strzałki na roving focus (`RegionOverlay.tsx:684-691`) | nudge draftu z fokusem poza panelem i poza kanwą (`blur()`), bo zniknął `summary`, który był trzecim miejscem na fokus |
| `does not create a preview… at the frame edge` | `overlay` bez definicji w teście | pobranie kanwy w teście, plus asercja braku znacznika „Niezapisane" jako dowód braku preview |
| `maps bbox_invalid annotation_ids…` | oczekiwał tekstu z usuniętej sekcji geometrii | werdykt czytany z alertu ramki (`Kod: bbox_invalid`) i z tonu dokładnie tej opcji overlayu; zaznaczenie nie przenosi tonu na zdrową anotację |

### Martwy CSS

`.df-review-annotations__invalid` miał jedynego konsumenta w usuniętej sekcji —
usunięty. `.df-review-annotations__geometry` i `.df-review-annotations__actions`
były martwe **już na `47fa1a6`** (sprawdzone `git grep` na bazie), więc zostają;
to nie jest dług tego ticketu.

## Mapa dowodów — sześć niezmienników po usunięciu formularza

| # | Niezmiennik | Test dowodzący po FE-012 |
| --- | --- | --- |
| 1 | Wartość widoczna = wysyłana | `annotationNudgeFixup.test.tsx` › `saves exactly the bbox exposed by the overlay, not the stale annotation` — `aria-label` bboxa `x 103, y 120, szerokość 40, wysokość 32` i jedyny PATCH z `{ x: 103, y: 120, width: 40, height: 32 }`; `batches further nudges into the same visible preview until Enter` — overlay `x 112`, PATCH `x 112`, plus asercja, że w żadnej mutacji nie ma `1035`; `annotationReviewFlow.test.tsx` › `updates the overlay live and saves the dragged bbox through the existing PATCH` dla gestu myszą; e2e `vertical-flow.spec.ts` porównuje `aria-label` z body PATCH i ze snapshotem klatki z backendu. Wszystkie używają `toEqual`, więc nadmiarowe pole w `bbox` też jest porażką — to ta asercja złapała regresję P1 |
| 2 | Batching nudge i bieżący CAS | `annotationReviewFlow.test.tsx` › `accumulates three nudges in one preview and sends exactly one PATCH on Enter` (`expected_version: 3`); `annotationTerminalRefresh.test.tsx` › `commits the retained overlay preview with the refetched annotation version` — po refetchu `expected_version: 4`, czyli wersja bieżąca, nie ta z chwili nudge'u |
| 3 | Niezapisane przesunięcie nie ginie po cichu | `annotationNudgeFixup.test.tsx`, describe `an unsaved nudge is visible and blocks acceptance`: `survives reselecting its class chip…`, `survives a successful class save…`, `survives a failed geometry PATCH…`, `survives a refetch of the same annotation…`, `refuses to accept the frame from the shortcut or the button`; `annotationTerminalRefresh.test.tsx` › `refetches list and active detail once without losing the overlay preview` oraz `keeps an invalid overlay preview and its alarm through a refetch` |
| 4 | Baseline gestu scoped do anotacji i epoki | nietknięte i zielone: `annotationNudgeFixup.test.tsx` describe `FE-009-FIX2` (5 testów) i `FE-009-FIX3` (2 testy, w tym `cannot resurrect A after selecting B…`); przerobione: `annotationReviewFlow.test.tsx` › `resets dirty class and the scoped geometry preview when selection moves from A to B` i `annotationReviewFixup.test.tsx` › `draws a fresh draft after selecting B and never patches the prior annotation` |
| 5 | Guard fokusu | po usunięciu pól jedynym polem tekstowym panelu jest filtr klas — `annotationNudgeFixup.test.tsx` › `leaves ArrowRight to the remaining class filter without moving the overlay` i `annotationReviewFlow.test.tsx` › `leaves ArrowRight to the class filter while it owns focus`: `aria-label` bboxa bez zmian i zero PATCH. Kontrakt `data-shortcut-scope` nadal pokrywają testy `GroupedOptionList` (nietknięte) |
| 6 | Reszta FE-009 i kontrakt `Space` z FE-010 | pełne describe `FE-010-FIX1`, `FE-010-FIX2`, `FE-011-FIX1` w `annotationNudgeFixup.test.tsx` oraz cztery sondy `Space` w `e2e/visual-qa.spec.ts` — wszystkie w bramce, wszystkie zielone |

Dodatkowo, wprost o samym usunięciu: `AnnotationPopover.test.tsx` › `does not
render geometry controls for a saved annotation` i `… for a fresh draft`,
`annotationNudgeFixup.test.tsx` › `exposes no panel control that can redraw or
save geometry`, `annotationReviewFlow.test.tsx` › `keeps class, delete and draft
controls native while geometry stays on the overlay`, e2e
`fe012-visual-qa.spec.ts` i `vertical-flow.spec.ts`.

Żaden z sześciu punktów nie wymagał formularza. Nie ma punktu, którego nie dało
się udowodnić.

## Pomiary panelu i kanwy

Sonda: `e2e/fe011-visual-qa.spec.ts` (`FE011_AFTER`), ten sam kod sondy przed i
po. **Stan „przed" pochodzi z pomiaru na `47fa1a6`** (zapisany w
`docs/tickets/FE-011/log.md`), a nie z przebiegu wykonanego dziś obok „po";
uzgodnione z koordynatorem. Panel bez niezapisanego przesunięcia:

| Viewport | `panel.top` | `panel.bottom` przed | `panel.bottom` po | Wysokość przed | Wysokość po | Zmiana |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1440×1000 | 379,703 | 667,703 | 624,703 | 288 px | 245 px | −43 px (−14,9%) |
| 1920×1080 | 459,797 | 747,797 | 704,797 | 288 px | 245 px | −43 px (−14,9%) |
| 1280×1000 | 789,203 | 999,203 | 999,203 | budżet viewportu | budżet viewportu | bez zmiany pudełka |

`panel.top` jest w obu przebiegach ten sam, bo wynika z wysokości obrazu, a ta
się nie zmieniła. Przy 1280×1000 panel i przed, i po jest ograniczony budżetem
`innerHeight - panel.top`, więc zysk widać nie jako niższe pudełko, tylko jako
43 px mniej treści do przewinięcia w środku.

Liczba 43 px zgadza się z arytmetyką usuniętego CSS: `border-top` 1 px +
`summary` 34 px (`min-height: 32px`, `padding-block: 8px` ×2 i `box-sizing:
border-box`, więc decyduje treść 18 px + 16 px) + 8 px `gap` siatki panelu. Dwa
niezależne źródła dają tę samą wartość.

**Kanwa nie zyskała pikseli i nie miała ich zyskać.** Obraz to
1043,984×694,906 przy 1440×1000 zarówno przed, jak i po — identycznie jak w
pomiarze FE-011. Od FE-011 rozmiar obrazu nie jest już liczony przez odjęcie
wysokości panelu, więc krótszy panel nie powiększa kanwy. Zysk jest inny: 43 px
wolnego miejsca w viewportcie pod kanwą i tyle samo mniej przewijania panelu.
Przy 1440×1000 panel z aktywnym znacznikiem „Niezapisane" ma 305 px wysokości i
`scrollHeight == clientHeight == 303`, czyli mieści się bez własnego paska
przewijania (`FE012_PANEL`).

Visual QA (repozytoryjny Playwright/Chromium — in-app Browser niedostępny; to
nie jest dowód na zachowania systemowe okna):
`docs/tickets/FE-012/screenshots/panel-without-geometry-1440.png` (panel ze
znacznikiem niezapisanego przesunięcia, bez sekcji geometrii) oraz
`review-1440.png` (kanwa i panel w jednym kadrze).

## Bramka

Jeden nieprzerwany przebieg
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1`:
**9/9 PASS, zero SKIP** — backend format, backend lint, backend typy, backend
testy (347), frontend typy, frontend testy (626 w 40 plikach), frontend build,
E2E (14 testów Chromium), E2E root safety. Porty 8000 i 5173 zwolnił operator
na prośbę; procesy operatora nie były zabijane przez wykonawcę.
