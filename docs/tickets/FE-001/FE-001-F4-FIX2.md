# FE-001-F4-FIX2 — selekcja pointer capture i retry po 409

Status: WYKONANY (2026-08-24)

> Finalny niezależny acceptance review: `ACCEPT`, bez findingów.

## Powód

Niezależny re-review FIX1 potwierdził zamknięcie F1–F5 i F7, ale pozostawił dwa
findings. W realnej przeglądarce pointer capture może przekierować click ze
shape do SVG, więc klik bez drag w `interactionMode="draw"` nie zaznaczy bbox.
Ponadto test 409 kończy się po refetchu i nie dowodzi, że kolejna mutacja używa
wersji z nowego DTO.

Źródło findings:
`artifacts/fe-001-f4-fix1-independent-rereview/index.md` w epicu Traycer.

## Zakres

1. `RegionOverlay` zapamiętuje shape, na którym rozpoczął się gest. Jeżeli
   pointerup nie tworzy drawable rect, jawnie wybiera dokładnie ten shape mimo
   retargetowania click przez pointer capture. Gest nie wywołuje `onDraw`.
   Alternatywna implementacja może opóźnić capture do realnego drag, ale musi
   zachować overlapping draw i selekcję F3.
2. Test draw-mode emuluje pointerdown/up bez ruchu na shape i dowodzi jednego
   `onSelect(shapeId)` oraz zera `onDraw`. Test select-mode i overlapping drag
   pozostają zielone.
3. Test UI wersjonowania modeluje: stary DTO → mutation `409 version_conflict`
   → refetch jawnie nowszego DTO → ponowienie mutacji przez UI → request z
   `expected_version` z nowszego DTO. Fixture tylko zwraca kolejne odpowiedzi;
   nie implementuje reguł backendu.

## Poza zakresem

Zmiany kontraktu API, kolejny redesign edytora, runtime browser fixture parent
Gate 3 i nowe zależności.

## Done Criteria

- Draw-mode click na shape wybiera ten shape po pointer capture i nie rysuje.
- Draw zaczynający się na shape nadal tworzy nakładający bbox.
- Domyślny select-mode zachowuje zachowanie F3.
- Test 409 wykonuje drugą realną mutację z wersją zwróconą przez refetch.
- Pełne Vitest, architecture.test.ts, typecheck, build, audit i diff-check są
  zielone. Backend niezmieniony, więc pełny backend gate nie jest powtarzany.
- Log FE-001 zapisuje rozwiązanie, wyniki i SHA fixupu.
