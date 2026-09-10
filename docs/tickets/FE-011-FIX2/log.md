# FE-011-FIX2 — log implementacji

## Zakres i wejście

Fixup realizuje jeden finding P2 z re-review FIX1 na bazie `93a8a63`:

- `lostpointercapture` kończy wyłącznie aktywny gest panu;
- `window.blur` kończy aktywny gest i wyłącza tryb ręki;
- wspólny koniec gestu jest odporny na synchroniczny `lostpointercapture`
  wywołany przez własne `releasePointerCapture`.

Automat stanów, część B i część C FE-011 pozostają poza zakresem. Nie ma zmian
backendu, geometrii bboxów, zapisu ani wyglądu edytora.

## Diagnoza i skorygowane twierdzenie

`finishPanGesture()` obejmował reset, zmianę zaznaczenia, `pointerup` i
`pointercancel`, lecz nie dwa końce epoki niezależne od tej ścieżki:
`window.blur` i utratę pointer capture. Niepusty `panGestureRef` pozwalał wtedy
następnemu `pointermove` kontynuować stary transform bez nowego `pointerdown`.

Poprzednie twierdzenie o kompletności było zbyt szerokie. W tym raporcie nie
wnioskuję o kompletności całego automatu. Jawnie retestowana lista granic to:
zmiana klatki, zamknięcie panelu, usunięcie wybranej anotacji, remount overlaya,
`window.blur`, zmiana zaznaczenia, wejście w draft i jego porzucenie, reset `1×`,
`pointerup`, `pointercancel`, `lostpointercapture` oraz ruch bez nadal wciśniętego
przycisku inicjującego.

## Design Plan

Tryb powierzchni: **Operate / harden**. Zmiana utwardza cykl życia istniejącej
interakcji, bez zmian CSS, copy, layoutu, tokenów i hierarchii.

### Elementy interfejsu i wytyczne

| Element | Decyzja | Moduły / ID UI/UX |
| --- | --- | --- |
| Powierzchnia SVG `RegionOverlay` | `onLostPointerCapture` kończy gest przez wspólny prymityw. Ref jest zerowany przed próbą zwolnienia capture, więc synchroniczne zdarzenie nie może ponownie wejść w aktywną ścieżkę. | katalog `new-component.md`, `RegionOverlay`; UI & Visuals: `OVERLAY-06`, `COLOR-07`; Typography: `OPACITY-02`; FE-08 |
| Widoczny stan panu (`data-panning`, kursor) | `lostpointercapture`, `blur` i brak maski inicjującego przycisku na `pointermove` zdejmują stan panu. Transform pozostaje w ostatniej prawidłowej pozycji. | `RegionOverlay`; UI & Visuals: `COLOR-07`; Typography: `OPACITY-02`; FE-08 |
| Przycisk `Przesuwaj kadr` | Utrata capture sama pozostawia `aria-pressed=true`, aby operator mógł zacząć nowy gest. `window.blur` ustawia `aria-pressed=false`, bo utrata kontekstu okna kończy właściciela interakcji. Wygląd, hit area, focus i copy bez zmian. | katalog `new-component.md`, `Button`; UI & Visuals: `COLOR-07`, `BORDER-06`; Typography: `OPACITY-02`; FE-08 |
| Obraz, bboxy, HUD, toolbar i panel | Bez zmian renderowania, geometrii i wysokości. Część B, stress panelu, rysowanie, zaznaczenie i nudge są wyłącznie retestowane. | katalog `new-component.md`, `RegionOverlay`/`Button`; `OVERLAY-06`, `COLOR-07`, `OPACITY-02`; FE-08 |

### Obowiązkowa checklista

- [x] **Layout/Siatka:** brak zmian CSS, wymiarów i spacingu.
- [x] **Typografia:** brak zmian fontów, rozmiarów, wysokości linii, wag i copy.
- [x] **Kolory:** brak zmian tokenów; stan ręki nadal ma `aria-pressed`, a nie
  wyłącznie kolor (`COLOR-07`, `OPACITY-02`).
- [x] **Obramowania:** brak zmian stroke, promieni i focus ringów (`BORDER-06`).
- [x] **Cienie:** brak zmian.
- [x] **Interakcje:** `blur` i `lostpointercapture` przechodzą przez wspólny
  koniec gestu; reset, `pointerup` i `pointercancel` pozostają idempotentne;
  kontrakt `Space` nie zmienia się (`OVERLAY-06`, FE-08).
- [x] **Komponenty:** zmiana pozostaje wewnątrz istniejącego `RegionOverlay` i
  istniejącego `Button`; nie powstaje nowy komponent common.

## Mechanizm i decyzja `buttons`

1. `finishPanGesture()` najpierw atomowo odbiera własność gestu przez
   wyzerowanie `panGestureRef`, następnie czyści `panning` i znacznik clicku, a
   dopiero potem prosi przeglądarkę o zwolnienie capture. Reentrant
   `lostpointercapture` widzi już pusty ref.
2. `onLostPointerCapture` kończy gest tylko wtedy, gdy zdarzenie dotyczy jego
   `pointerId`; nie wyłącza `panMode`.
3. `window.blur` zachowuje istniejące sprzątanie `Space` i dodatkowo wywołuje
   `invalidatePanInteraction()`, więc kończy gest i wyłącza rękę.
4. Gest zapamiętuje bit maski fizycznego przycisku, który go rozpoczął: `1` dla
   LMB i `4` dla środkowego. `pointermove` bez tej maski kończy gest przez ten
   sam prymityw. To pas bezpieczeństwa na brakujące przyszłe zdarzenie końca,
   nie substytut jawnych granic `blur` i `lostpointercapture`.

## Plan testów i commitów

1. `docs(fe-011)`: Design Plan, skorygowane twierdzenie i macierz granic.
2. `test(fe-011)`: czerwone regresje komponentu dla `lostpointercapture`,
   `blur`, reentrancy normalnego `pointerup` oraz pasa `buttons`.
3. `fix(fe-011)`: kolejność sprzątania, dwa handlery i pas maski przycisku.
4. `test(fe-011)`: prawdziwy Chromium z natywnym
   `releasePointerCapture(pointerId)` i dokładną ścieżką `window.blur`.
5. `docs(fe-011)`: wyniki sond, jawna lista retestów i pełna bramka 9/9.
