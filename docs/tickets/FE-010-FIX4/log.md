# FE-010-FIX4 — log implementacji

## Zakres i przyczyna

Wejście: [re-review FIX3](../../../../) — werdykt `CHANGES REQUESTED`, 1 × P2.
Baza: `2a26d56` na `feat-fe-010-canvas-crosshair`.

FIX3 domknął `Space`-pan przy naturalnym fokusie `body` i zachował natywne
zachowanie kontrolek. Zostaje wyścig na końcu gestu:

1. pierwszy `keydown Space` nad kanwą — `defaultPrevented=true`;
2. `repeat` w trakcie przeciągania poza granicę kanwy — `defaultPrevented=true`,
   `scrollY=0`;
3. `pointerup` poza kanwą zwalnia pointer capture, `onPointerLeave` ustawia
   `pointerInsideRef=false`;
4. kolejny `repeat` **tego samego, wciąż trzymanego** `Space` —
   `defaultPrevented=false`;
5. dokument rusza — 236 px po 100 ms.

Przyczyna: `RegionOverlay.tsx` — `handleKeyDown` w efekcie okna anuluje
`keydown` z intencją `pan` wyłącznie przy `pointerInsideRef.current === true`.
`spaceUsedForPanRef` pozostaje `true` aż do `keyup`/`blur`, ale nie uczestniczy
w decyzji o kolejnych powtórzonych `keydown`. Naturalna kolejność puszczania —
najpierw lewy przycisk, potem spacja — trafia w okno, w którym auto-repeat
przestaje być konsumowany, a klawisz jest wciąż wciśnięty.

## Fix

Wąski guard bieżącego cyklu klawisza. W `handleKeyDown`, po ustawieniu
`spacePressedRef.current = true`:

```
if (event.repeat && spaceUsedForPanRef.current) {
  event.preventDefault();
}
```

Skoro bieżący fizyczny `Space` został użyty do panu, wszystkie dalsze `keydown`
z `repeat=true` są konsumowane aż do `keyup`/`blur`, niezależnie od
`pointerInsideRef`. Raz uzbrojony do panu klawisz pozostaje uzbrojony do końca
przytrzymania.

Guard nie rusza `spaceTargetIntent`, `WeakSet<Event>`, ograniczenia wysokości
panelu, `preventDefault` na kółku, mapowania współrzędnych ani dziewięciu
zachowań FE-009. Automat `idle → pressed(owner) → panning|activation|editing →
released|blurred` jest poza zakresem — trafi do osobnego ticketu po scaleniu
FE-010.

## Plan regresji

- Vitest `RegionOverlay`, nowa sonda: pan z `body`, `pointerup` + `pointerleave`
  poza kanwą, następny `keydown Space` z `repeat=true` — `defaultPrevented=true`.
- Vitest `RegionOverlay`, nowa sonda: `Space` **bez** panu poza kanwą, także
  `repeat=true` — pozostaje natywny (`defaultPrevented=false`).
- Istniejące sondy FIX2 i FIX3 zielone: `scrollY` 0 → 0 nad kanwą, natywna
  aktywacja przycisków spacją bez panu, `keyup` po panie konsumowany, dwa pany
  w jednym holdzie, blur, remount, lista klas, pola tekstowe.
- Pełna bramka `scripts/check.ps1`: jeden nieprzerwany przebieg 9/9, zero SKIP.
