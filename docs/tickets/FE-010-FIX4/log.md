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
- Chromium E2E, nowa sonda `visual-qa.spec.ts` — dokładna sekwencja recenzenta.
- Pełna bramka `scripts/check.ps1`: jeden nieprzerwany przebieg 9/9, zero SKIP.

## Implementacja

Jedna zmiana produkcyjna w `RegionOverlay.tsx`, `handleKeyDown` w efekcie okna,
tuż po `spacePressedRef.current = true`:

```ts
if (event.repeat && spaceUsedForPanRef.current) {
  event.preventDefault();
}
```

`spaceUsedForPanRef` jest ustawiane na `true` w `handlePointerDown` przy starcie
`Space` + LMB panu i zerowane w `releaseSpace` (`keyup`/`blur`) oraz na pierwszym
nie-powtórzonym `keydown` nowego przytrzymania. Guard nie dotyka tej ścieżki —
czyta flagę i konsumuje powtórzone `keydown`, dopóki żyje. Bez panu flaga jest
`false`, więc natywne przewijanie poza kanwą zostaje nietknięte. Cel `editing`
nadal ma wczesny return przed guardem — pole tekstowe zachowuje wpisywanie
spacji.

## Próby i wyniki sond

### Czerwone sondy (przed fixem)

- Vitest `keeps consuming Space auto-repeat after a pan ends with the pointer
  outside the canvas`: **FAIL** — `keyDown` z `repeat=true` po `pointerUp` +
  `pointerLeave` zwracał `true` (`defaultPrevented=false`). Dokładnie finding P2.
- Vitest `leaves held Space auto-repeat native outside the canvas when no pan
  happened`: PASS już przed fixem — potwierdza, że guard nie zabiera przewijania
  tam, gdzie nie było gestu.

### Po fixie

- Vitest `RegionOverlay.test.tsx`: **42/42 PASS** (dwie nowe sondy zielone).
- Vitest `RegionOverlay` + `annotation`: **93/93 PASS**.
- Chromium E2E `visual-qa.spec.ts:774` „wciąż trzymany Space nie przewija
  dokumentu po zakończeniu panu poza kanwą" — **PASS**. Naturalny
  `activeElement === body`, zoom 125%, `Space` w dół, drag przez róg kanwy, LMB
  w górę poza kanwą, `mouse.move` poza kanwę, potem dwa dalsze `keyboard.down`
  (Playwright wystawia `repeat=true`): `window.scrollY === 0` po 100 ms, zero
  żądań mutujących. Druga część sondy: bez panu, ten sam wciśnięty i powtarzany
  `Space` poza kanwą przewija (`scrollY > 0`).

### Sonda recenzenta z findingu P2

Sekwencja z re-review FIX3 (`repeat` po `pointerup` poza kanwą →
`defaultPrevented=true`, `scrollY=0`) jest pokryta łącznie: mechanikę
`defaultPrevented` false → true asertuje sonda Vitest, a `scrollY=0` przy
trzymanym powtarzanym `Space` po panie asertuje sonda Chromium `:774`.

### Sondy FIX2 i FIX3 po zmianie

- E2E `visual-qa.spec.ts:648` „Space zachowuje natywny przycisk bez panu i
  blokuje go po panie" — **PASS**.
- E2E `visual-qa.spec.ts:719` „Space nad kanwą nie przewija dokumentu przy
  naturalnym fokusie body" — **PASS** (`scrollY` 0 → 0 nad kanwą, natywny scroll
  poza kanwą zachowany).
- Vitest: `consumes Space on keyup after it starts a canvas pan from a focused
  button`, `leaves Space native on a focused button over the canvas when no pan
  happens`, `consumes document Space over the canvas before it can scroll and
  still pans`, `pans with Space plus left button`, dwa pany w jednym holdzie,
  blur, remount — wszystkie w zielonym suite 40 plików / 611 testów.
- Dziewięć zachowań FE-009: `WeakSet<Event>` pan-intent, limit wysokości panelu,
  `preventDefault` na kółku, mapowanie współrzędnych, roving tabindex, `Delete`
  na kształcie, rysowanie w pikselach źródłowych po zoomie/panie, selekcja bez
  precyzji, celownik — bez zmian w diffie, zielone w pełnym suite.

## Pełna bramka

Jeden nieprzerwany przebieg
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1`:
**PASS — 9/9 bramek, 0 SKIP**.

- backend format / lint / mypy: PASS;
- backend: **347/347 testów** (339 s);
- frontend typy: PASS;
- frontend: **40/40 plików, 611/611 testów**;
- build produkcyjny: PASS; jedyne ostrzeżenie o istniejącym chunku >500 kB;
- Chromium E2E: **9/9 scenariuszy** (w tym `:648`, `:719`, nowy `:774`);
- bezpieczeństwo katalogu roboczego E2E: **2/2**.

## Commity (ponad `2a26d56`)

- `c22d65c` docs(fe-010-fix4): plan wąskiego guardu
- `844f03c` test(fe-010-fix4): czerwona sonda Vitest auto-repeat po panie
- `fab6060` fix(fe-010-fix4): guard `event.repeat && spaceUsedForPanRef`
- `f005e78` test(fe-010-fix4): sonda E2E dokładnej sekwencji recenzenta
- (ten commit) docs(fe-010-fix4): dowody weryfikacji

## Możliwość uproszczenia — poza zakresem

Bez zmian względem FIX3: cały cykl `Space` da się docelowo zamknąć w jednym
automacie `idle → pressed(owner) → panning|activation|editing → released|blurred`.
FIX4 to czwarty fixup dokładający warunek do obsługi `Space` w `RegionOverlay`;
guard bieżącego cyklu klawisza jest minimalną naprawą findingu, ale kontrakt
jest wciąż rozdzielony między `spaceTargetIntent`, `spacePressedRef`,
`spaceUsedForPanRef`, `pointerInsideRef`, `panGestureRef` i listenery
`keydown`/`keyup`/`blur`/`pointerenter`/`pointerleave`. Rekomendacja recenzenta:
osobny ticket po scaleniu FE-010.
