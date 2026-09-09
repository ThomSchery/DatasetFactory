# FE-010-FIX3 — log implementacji

## Zakres i przyczyna

FIX2 poprawnie odłożył decyzję o anulowaniu natywnej aktywacji przycisku do
`keyup`, ale usunął anulowanie każdego `keydown Space`. Dla nieinteraktywnego
fokusu dokumentu Chromium przewija stronę już na `keydown`, zanim LMB może
rozpocząć pan. Naprawa obejmuje wyłącznie rozstrzygnięcie celu `keydown` w
`RegionOverlay`.

Reguła ma rozpoznać w jednym miejscu trzy intencje celu:

1. cel edycyjny — zachowuje `Space` i nie uzbraja panu;
2. cel z własną aktywacją — zachowuje natywny `keydown`, ale utrzymuje kontrakt
   FIX2 pozwalający późniejszemu `Space` + LMB rozpocząć pan;
3. cel nieinteraktywny — uzbraja pan i, wyłącznie przy wskaźniku nad kanwą,
   anuluje `keydown` zanim przeglądarka przewinie dokument.

## Design Plan

### Elementy interfejsu i stosowane wytyczne

| Element | Decyzja | Moduły / ID UI/UX |
| --- | --- | --- |
| Powierzchnia `RegionOverlay` | Przy nieinteraktywnym celu i wskaźniku nad powierzchnią `keydown Space` jest konsumowany przed natywnym scrollem; późniejszy LMB używa istniejącego panu. Bez zmian wizualnych, warstw, geometrii i markerów pointerdown. | FE-08; UI & Visuals: `OVERLAY-06`, `COLOR-07`; Typography: `OPACITY-02` |
| Dokument / `body` | Nad kanwą `Space` oznacza gotowość do panu i nie przewija dokumentu. Poza kanwą zachowuje natywny scroll strony. `body` nie dostaje sztucznego `tabIndex`. | FE-08; UI & Visuals: `COLOR-07`; Typography: `OPACITY-02` |
| `Button` w toolbarze i `AnnotationPopover` | Natywna aktywacja `Space` bez panu oraz anulowanie `keyup` po realnym panie pozostają dokładnie zgodne z FIX2. | FE-08; UI & Visuals: `COLOR-07`; Typography: `OPACITY-02`; katalog komponentów `new-component.md`, sekcje 4–5 |
| `GroupedOptionList` | Lista klas zachowuje własną obsługę `Space` w zakresie `data-shortcut-scope`; nie jest traktowana jak nieinteraktywny dokument. | FE-08; UI & Visuals: `COLOR-07`; Typography: `OPACITY-02`; katalog komponentów `new-component.md`, sekcje 4–5 |
| `TextField`, natywne pola i `contenteditable` | Wpisywanie `Space` pozostaje lokalne niezależnie od położenia wskaźnika i nie uzbraja panu. | FE-08; UI & Visuals: `COLOR-07`; Typography: `OPACITY-02`; katalog komponentów `new-component.md`, sekcje 4–5 |

### Obowiązkowa checklista

- [x] **Layout/Siatka:** brak zmian układu, spacingu i tokenów `--size-*`.
- [x] **Typografia:** brak zmian `fontSize`, `lineHeight`, `fontWeight` i copy.
- [x] **Kolory:** brak nowych kolorów i zmian wizualnych stanów interakcji
  (`COLOR-07`).
- [x] **Obramowania:** brak zmian obrysów, szerokości i promieni.
- [x] **Cienie:** brak nowych warstw i cieni.
- [x] **Interakcje:** jedno rozstrzygnięcie celu `Space`; `body` nad kanwą nie
  scrolluje, `body` poza kanwą scrolluje, kontrolki zachowują FIX2, pola i lista
  klas zachowują własną obsługę (`OVERLAY-06`, `COLOR-07`, `OPACITY-02`).
- [x] **Komponenty:** zmiana pozostaje w istniejącym `RegionOverlay`; używane
  `Button`, `GroupedOptionList` i `TextField` nie zmieniają API ani wyglądu.

## Plan regresji

- Vitest `RegionOverlay`: `Space` na `body` nad kanwą anuluje `keydown` i
  pozwala przesunąć transformację; poza kanwą `keydown` oraz `keyup` pozostają
  natywne.
- Istniejące sondy FIX2: fokus przycisku bez panu, fokus „Usuń” z późniejszym
  panem, auto-repeat, dwa pany, blur i remount pozostają zielone.
- Istniejące testy `GroupedOptionList` i `TextField`: własna obsługa `Space`
  pozostaje niezależna od wskaźnika.
- Chromium bez sztucznego `tabIndex`: `activeElement === body`, `scrollY=0`,
  zoom 125%, wskaźnik nad kanwą; po `keydown` nadal `scrollY=0`, drag zmienia
  transformację i wykonuje zero mutacji. Osobna sonda poza kanwą potwierdza
  natywny scroll.
- Pełna bramka `scripts/check.ps1`: jeden nieprzerwany przebieg 9/9, zero SKIP.

## Implementacja

- Jedna funkcja `spaceTargetIntent` rozstrzyga właściciela zdarzenia jako
  `editing`, `activation` albo `pan`. Korzysta z jednego selektora właścicieli
  `Space`, zamiast powielać listy tagów między guardem i `preventDefault()`.
- `editing` obejmuje pola natywne i `contenteditable`: zachowuje istniejący
  wczesny return, więc nie uzbraja panu.
- `activation` obejmuje natywne kontrolki oraz `data-shortcut-scope`; `keydown`
  pozostaje dla kontrolki, a przyciski nadal mogą przejść do panu po późniejszym
  `Space` + LMB zgodnie z FIX2.
- `pan` obejmuje `body` i inne cele bez własnej obsługi `Space`. Tylko dla tej
  intencji i tylko przy wskaźniku wewnątrz kanwy `keydown` dostaje
  `preventDefault()` przed natywnym scrollem.
- `spaceUsedForPanRef`, `releaseSpace`, obsługa auto-repeat/blur, `WeakSet<Event>`,
  panel, wheel i geometria nie zostały zmienione.

## Próby i wyniki sond

Przed implementacją:

- Vitest: **1 oczekiwany FAIL** — `keydown Space` na `body` nad kanwą zwracał
  stan nieanulowany;
- Chromium bez sztucznego `tabIndex`: `activeElement === body`, początkowo
  `scrollY=0`, a 100 ms po fizycznym `keydown Space` **`scrollY=343`**. Sonda
  zatrzymywała się przed dragiem zgodnie z findingiem.

Po implementacji:

- docelowy pakiet `RegionOverlay`, `AnnotationPopover`/nudge i
  `GroupedOptionList`: **3/3 pliki, 76/76 testów PASS**;
- dedykowany Chromium FIX3: **1/1 PASS**;
- połączone główne sondy Chromium FIX2 + FIX3: **2/2 PASS**;
- typecheck: PASS;
- Impeccable detector, zakres `layout`: zero findingów.

### Sonda `body` nad kanwą

Przy viewportcie 1440×1000, zamkniętym panelu, naturalnym
`activeElement === body`, zoomie 125% i wskaźniku na środku kanwy:

- `scrollY` przed `keydown`: **0**;
- `scrollY` po fizycznym `keydown Space`: **0**;
- drag zmienił transformację zoom stage;
- `scrollY` po zakończeniu panu: **0**;
- żądania mutujące: **0**.

Po przesunięciu wskaźnika poza kanwę, nadal przy fokusie `body`, fizyczne
`Space` przewinęło stronę do wartości **większej od 0**. Żądania mutujące nadal
wynosiły **0**.

## Sondy FIX2 po zmianie

Główne ścieżki zostały ponownie uruchomione w Chromium, a pozostałe
niezmienniki sprawdzono w pełnym suite i względem wąskiego diffu:

1. „Usuń” → `Space` poza kanwą → wejście → pan → `keyup`: PASS, panel i
   anotacja pozostają, `DELETE=0`.
2. „Dopasuj kanwę do widoku” bez panu: PASS, zoom 125%→100%, `DELETE=0`.
3. Dwa pany w jednym przytrzymaniu: mechanizm press/pan/release z FIX2 bez zmian;
   oba gesty korzystają z tej samej zachowanej flagi.
4. Auto-repeat po panie: istniejąca sonda komponentu PASS; repeat nie zeruje
   `spaceUsedForPanRef`.
5. Auto-repeat bez panu: klasyfikacja `activation` nie ustawia fałszywej flagi,
   a natywny `keyup` pozostaje dozwolony.
6. `keydown` bez `keyup` + `blur`: `releaseSpace()` i listener blur bez zmian;
   pełny suite PASS.
7. `keyup` po odmontowaniu: cleanup obu listenerów bez zmian; pełny suite PASS.
8. Wszystkie `Button` w panelu i toolbarze trafiają przez ten sam właściciel
   `activation`; ich natywne `keydown` nie jest anulowane. Główna sonda toolbaru
   i destrukcyjna sonda panelu przechodzą w Chromium.
9. `GroupedOptionList` trafia przez `data-shortcut-scope`; testy własnej obsługi
   `Space` PASS.
10. Filtr klas (`input`) trafia przez `editing`, zachowuje wpisywanie spacji i
    nie uzbraja panu; suite PASS.

## Możliwy dalszy kierunek — poza zakresem FIX3

Tak, łańcuch warunków da się docelowo zastąpić jednym automatem cyklu klawisza:
`idle → pressed(owner) → panning/activation/editing → released|blurred`, gdzie
właściciel zdarzenia i przejścia decydują wspólnie o uzbrojeniu panu oraz o tym,
który z `keydown`/`keyup` jest konsumowany. FIX3 konsoliduje wyłącznie
klasyfikację celu; nie przenosi istniejących refów i listenerów do takiego
kontrolera, ponieważ byłaby to szersza zmiana mechanizmu po trzech fixupach.

## Pełna bramka

Jeden nieprzerwany przebieg
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1`
zakończył się **PASS — 9/9 bramek, 0 SKIP**:

- backend format, lint i mypy: PASS;
- backend: **347/347 testów**;
- frontend typy: PASS;
- frontend: **40/40 plików, 609/609 testów**;
- build produkcyjny: PASS; jedyne ostrzeżenie dotyczy istniejącego głównego
  chunka powyżej 500 kB;
- Chromium E2E: **8/8 scenariuszy**;
- bezpieczeństwo katalogu roboczego E2E: **2/2 testy**.
