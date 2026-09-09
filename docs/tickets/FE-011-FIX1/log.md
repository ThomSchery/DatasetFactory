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

