# FE-011-FIX1 — log implementacji

## Zakres i wejście

Fixup realizuje wyłącznie dwa findingi P2 z zimnego review FE-011 na bazie
`f672079`:

- zmiana rzeczywiście wybranego bboxa unieważnia tryb ręki;
- reset `1×` unieważnia aktywną epokę panu, aby stary `originView` nie mógł
  wskrzesić zoomu.

Część B FE-011, automat stanów całego edytora i część C pozostają poza
zakresem. Nie ma zmian backendu, geometrii bboxów ani kontraktu zapisu.

## Diagnoza

Oba findingi mają ten sam mechanizm: `panGestureRef`, `panning` i `panMode`
żyją niezależnie od zdarzeń kończących ich kontekst. `resetView()` zeruje widok,
ale nie aktywny gest; zmiana `selectedId` nie zeruje ręki. Następny
`pointermove` może więc odtworzyć `originView`, a nowa selekcja odziedziczyć
właściciela LMB.

## Design Plan

Tryb powierzchni: **Operate / harden**. Jest to naprawa cyklu życia istniejącej
interakcji, bez zmian wizualnych, copy, layoutu ani tokenów.

### Elementy interfejsu i wytyczne

| Element | Decyzja | Moduły / ID UI/UX |
| --- | --- | --- |
| Powierzchnia `RegionOverlay` | Jedna funkcja kończy aktywną epokę panu: zwalnia pointer capture, zeruje `panGestureRef` i `panning`. Nie zmienia geometrii, źródłowego `viewBox` ani clampu. | katalog `new-component.md`, `RegionOverlay`; UI & Visuals: `OVERLAY-06`, `COLOR-07`; Typography: `OPACITY-02`; FE-08 |
| Przycisk `Przesuwaj kadr` | Rzeczywista zmiana `selectedId` wyłącza `panMode` i przywraca `aria-pressed=false`. Ponowny wybór tego samego ID niczego nie resetuje. Warianty, treść, focus i hit area bez zmian. | katalog `new-component.md`, `Button`; Grid & Spacing: `GRID-03`, `GRID-05`; UI & Visuals: `COLOR-07`, `COLOR-09`, `BORDER-06`; Typography: `OPACITY-02` |
| Przycisk `1×` | Reset wywołuje to samo unieważnienie interakcji przed ustawieniem `FIT_VIEW`; ruch nadal trzymanego wskaźnika nie odtwarza 156%. Natywna aktywacja klawiaturą bez zmian. | katalog `new-component.md`, `Button`; `GRID-05`, `COLOR-07`, `BORDER-06`, `OPACITY-02`; FE-08 |
| Zaznaczone bboxy A/B | Granicą jest zmiana tożsamości `selectedId`, niezależnie od wyboru klawiaturą lub kliknięciem na kanwie. Wybrany B i niezapisany nudge zachowują istniejące reguły FE-009. | katalog `new-component.md`, `RegionOverlay`; `OVERLAY-06`, `COLOR-09`, `OPACITY-02`; FE-08 |
| HUD, celownik, obraz, panel i toolbar | Bez zmian wizualnych i wysokości. Część B oraz `panel.bottom <= innerHeight` są tylko retestowane. | `GRID-01`, `GRID-08`, `SPACING-01`; `OVERLAY-06`, `BORDER-05`; FE-08 |

### Obowiązkowa checklista

- [x] **Layout/Siatka:** brak zmian CSS i wymiarów; obecne `GRID-01/03/05/08`
  oraz tokeny spacing pozostają nietknięte.
- [x] **Typografia:** brak zmian copy, fontów, rozmiarów, wysokości linii i wag.
- [x] **Kolory:** brak zmian tokenów i wariantów; `aria-pressed` nadal niesie
  stan poza kolorem (`COLOR-07/09`, `OPACITY-02`).
- [x] **Obramowania:** brak zmian obrysów, promieni i focus ringów
  (`BORDER-06`).
- [x] **Cienie:** brak zmian.
- [x] **Interakcje:** reset i zmiana selekcji unieważniają wspólny stan panu;
  pointerup/pointercancel są idempotentne po invalidacji; środkowy przycisk,
  `Space`, rysowanie i nudge pozostają bez zmian (`OVERLAY-06`, `COLOR-07`).
- [x] **Komponenty:** zmiana pozostaje wewnątrz istniejącego `RegionOverlay` i
  `Button`; nie powstaje nowy komponent common.

## Mechanizm

1. Funkcja zakończenia gestu odczytuje jedyną aktywną epokę z
   `panGestureRef`, zwalnia capture jej `pointerId`, zeruje ref i `panning`.
2. Funkcja unieważnienia panu wywołuje zakończenie gestu i wyłącza `panMode`.
   Jest jedyną ścieżką używaną przez reset widoku i zmianę selekcji.
3. Poprzednie `selectedId` jest pamiętane w refie. Efekt reaguje tylko, gdy
   tożsamość faktycznie się zmieniła; re-click tego samego bboxa nie wyłącza
   świadomie wybranej ręki.
4. Zwykłe wyłączenie ręki podczas trwającego gestu nie unieważnia tej epoki —
   zaakceptowany przez review gest może się dokończyć, a dopiero następny LMB
   wraca do rysowania.

Automat stanów pozostaje osobnym zadaniem. Ten fixup nie ujawnia kolejnego
stanu wymagającego nowego punktu invalidacji: wszystkie końce aktywnej epoki
panu przechodzą przez ten sam prymityw, a dwa końce kontekstu przez to samo
unieważnienie interakcji.

## Plan testów i commitów

1. `docs(fe-011)`: plan fixupu i rozstrzygnięcie mechanizmu.
2. `test(fe-011)`: czerwone regresje wyboru B klawiaturą i kliknięciem oraz
   resetu w trakcie capture, z `pointerup` i `pointercancel`.
3. `fix(fe-011)`: wspólne unieważnienie panu.
4. `test(fe-011)`: realny Playwright dla sekwencji 156% → ręka → held LMB →
   `Tab`/`Enter` na `1×` → move; pełne retesty FE-009/Space/layout.
5. `docs(fe-011)`: wyniki sond i pełna bramka 9/9.

## Implementacja

- `finishPanGesture(suppressClick)` jest jedynym prymitywem kończącym aktywną
  epokę panu. Zwalnia pointer capture zapamiętanego `pointerId`, zeruje
  `panGestureRef`, usuwa `panning` i ustawia deduplikację następującego clicku
  zgodnie z rodzajem końca. Korzystają z niego również zwykły `pointerup` i
  `pointercancel`.
- `invalidatePanInteraction()` wyłącza `panMode` i wywołuje ten prymityw. Jest
  używane przez `resetView()` oraz efekt zmiany zaznaczenia.
- `previousSelectedIdRef` odróżnia zmianę tożsamości A → B od ponownego wyboru
  A → A. `useLayoutEffect` unieważnia rękę przed następnym paintem po zmianie
  selekcji, bez migotania starego `aria-pressed=true` w nowym kontekście.
- Reset najpierw unieważnia interakcję, potem ustawia `FIT_VIEW`. Stary
  `originView` nie jest już osiągalny dla następnego `pointermove`.
- Zwykłe kliknięcie `Zakończ przesuwanie` nie wywołuje invalidacji aktywnej
  epoki. Zachowanie zaakceptowane w review pozostaje: rozpoczęty gest kończy się
  normalnie, a następny LMB wraca do rysowania/edycji.

Nie pojawił się kolejny stan wymagający osobnego miejsca invalidacji.
`pointerup`, `pointercancel`, reset i zmiana selekcji składają się z jednego
prymitywu końca gestu; reset oraz selekcja dzielą dodatkowo jedno unieważnienie
właściciela interakcji. Pełny automat stanów pozostaje poza zakresem.

## Sondy findingów

### FIX-A — zmiana zaznaczenia

- Komponent: przy ręce ON ponowny `Enter` na A pozostawia rękę aktywną;
  `Enter` na B natychmiast daje `aria-pressed=false`, pozostawia B jako
  `aria-selected=true`, a kolejny LMB edytuje/rysuje bez zmiany transformu.
- Komponent: kliknięcie B bezpośrednio na kanwie daje ten sam wynik.
- Ekran: A jest najpierw przesunięte nudgem `100 → 101`, następnie przy 156%
  ręka jest włączona, a B wybrane fokusem i `Enter`. B pozostaje wybrane,
  kontrolka ręki jest wyłączona, kolejny drag na B nie zmienia transformu i
  wykonuje zero mutacji.

### FIX-B — reset aktywnej epoki

- Komponent: 156%, ręka ON, LMB wciśnięty, reset `1×`, dalszy move i osobno
  `pointerup` albo `pointercancel` pozostają przy 100%, bez draftu.
- Ekran: niezapisany nudge `100 → 101` pozostaje w bboxie, panelu i statusie po
  resecie aktywnego panu; zoom zostaje 100%, `panning` znika, mutacji zero.
- Prawdziwy Playwright/Chromium: dokładna sekwencja recenzenta 156% → ręka ON →
  trzymany LMB → `Tab` na `1×` → `Enter` → dalszy `page.mouse.move` → release.
  Po każdym kroku po resecie zoom i transform pozostają 100%/`FIT_VIEW`, nie ma
  draftu ani mutacji.

## Próby i korekty sond

1. Testy uruchomione przed zmianą produkcyjną dały oczekiwane **6 FAIL** przy
   **67 PASS**: dwie ścieżki selekcji, dwa końce resetowanego gestu oraz obie
   sondy ekranowe.
2. Po implementacji 5/6 przeszło. Ostatnia sonda ekranowa klikała pustą
   powierzchnię, więc poprawny outside-dismiss zdejmował B. Skorygowano cel na
   wypełnienie wybranego bboxa B: test sprawdza teraz przekazanie LMB do edycji
   nowego kontekstu, zgodnie z findingiem, bez osłabiania FE-009.
3. Pierwsza sonda Chromium resetu dodała nudge do sekwencji recenzenta. Globalny
   `Enter` edytora poprawnie przejmował wtedy klawisz do zapisu nudge'a, zamiast
   aktywować `1×`. Dowody rozdzielono: exact Chromium bez nudge'a oraz osobna
   integracyjna sonda zachowania nudge'a przy resecie.

## Preflight

- Vitest: **40 plików, 619/619 PASS**.
- Typecheck i build Vite: PASS; pozostaje zastane ostrzeżenie o głównym chunku
  większym niż 500 kB.
- Playwright/Chromium FE-011: **2/2 PASS**; pomiary części B pozostały bez zmian:
  `883.984×588.406`, `1043.984×694.906`, `1280×852` dla trzech wymaganych
  viewportów, z `panel.bottom <= innerHeight`.
- Impeccable detector, zakres `layout`, zmieniony plik UI: `[]`.

