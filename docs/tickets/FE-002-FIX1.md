# FE-002-FIX1 — chwyt skalowania i uczciwy kursor

Status: GOTOWY

## Powód

Re-review FE-002 dało `ACCEPT` i zostało zmergowane (`bcac2c4`), ale zostawiło
dwa findingi P2 w samym środku funkcji, o którą chodziło w tym tickecie.
Artefakt: `artifacts/fe-002-re-review/index.md`.

**P2-B — skalowanie skacze.** `resizeRectFromCorner` jest bezwzględne: ustawia
narożnik dokładnie na punkt wskaźnika, zamiast zachować offset chwytu.
Zmierzone przez recenzenta: chwyt 6 CSS px za narożnikiem, ruch o 1 px, i boks
`29×50` staje się natychmiast `37×58` — taka wartość idzie do zapisu. Przy
skali 0,8156 jeden piksel błędu celowania to 1,23 piksela źródłowego zmiany
rozmiaru.

Powód, dla którego nie złapały tego testy: **wszystkie chwytają dokładnie
środek uchwytu** — `RegionOverlay.test.tsx:546` oraz nowy `vertical-flow`
przez `handleBounds + width/2`. Żaden nigdy nie chwyta obok, więc offset
zerowy jest jedynym testowanym przypadkiem.

**P2-A — kursor kłamie.** W całym wnętrzu małego boksa `elementFromPoint`
zwraca uchwyt, więc kursor to `nwse-resize`, podczas gdy gest przesuwa.
`RegionOverlay.css` ustawia `cursor: move` na zaznaczonym kształcie, ale kursor
uchwytu siedzi na potomku i wygrywa. Recenzent zmierzył siatkę ±12 CSS px
wokół narożnika: **każdy** punkt raportuje `nwse-resize`, łącznie z tymi, które
są przesuwaniem. Afordancja przeczy zachowaniu.

Oba findingi mają jedną wspólną przyczynę: stały hit-target uchwytu 32 px jest
większy niż małe boksy OCR, a chwyt nie pamięta, gdzie go złapano.

## Zakres

### F1 — chwyt zachowuje offset

1. Rozpoczęcie skalowania zapamiętuje offset punktu wskaźnika względem
   narożnika, tak jak gałąź przesuwania robi to już przez `originPoint`.
2. Ruch stosuje ten offset, więc pierwszy piksel ruchu zmienia rozmiar o jeden
   piksel, a nie o odległość chwytu od narożnika.
3. Zachowanie przy chwycie dokładnie w narożniku pozostaje identyczne — to jest
   dzisiejszy przypadek testowy i nie ma się zmienić.

### F2 — hit-target uchwytu skaluje się do kształtu

1. Rozmiar celu uchwytu wynika z krótszego boku kształtu zamiast stałych 32 px,
   z rozsądnym minimum i maksimum.
2. Uchwyty nie mogą pokrywać całego wnętrza boksa — dla każdego realnego
   rozmiaru musi zostać obszar, który jest jednoznacznie przesuwaniem.
3. Reguła „ścisłe wnętrze to przesuwanie" z `838221b` zostaje jako
   zabezpieczenie, ale przestaje być jedyną rzeczą chroniącą małe boksy.

### F3 — kursor mówi prawdę

1. Kursor w danym punkcie odpowiada gestowi, który tam nastąpi: przesuwanie
   w obszarze przesuwania, skalowanie w strefie uchwytu.
2. Rozwiązanie ma działać mimo że uchwyt jest potomkiem kształtu i wygrywa
   kaskadę.

## Testy

Co najmniej trzy, wszystkie celujące w to, czego dotychczasowe nie sprawdzały:

1. **Chwyt poza środkiem uchwytu.** Złap uchwyt z jawnym offsetem od narożnika,
   przesuń o znaną deltę i asertuj dokładny bbox wynikowy. Ten test ma
   czerwienieć, gdy offset nie jest zachowany — to jest główny dowód nośności.
2. **Mały boks.** Dla rozmiaru zbliżonego do realnych boksów OCR (rzędu 19×40)
   sprawdź, że istnieje punkt dający przesunięcie i punkt dający skalowanie.
3. **Kursor.** Asercja, że w obszarze przesuwania kursor nie zapowiada
   skalowania.

## Poza zakresem

- backend, API, model danych, konfiguracja portów;
- zmiany w `resizeRectFromCorner` wykraczające poza offset chwytu;
- P3-C z re-review: `pointIsInsideShape` przy wymiarze ≤ 2 px — degeneracja
  brzegu, nierealna dla OCR;
- P3-D: formularz nowego bboxa 2×2 w panelu pełnej szerokości — kosmetyka.

## Done Criteria

- Chwyt uchwytu poza narożnikiem nie zmienia rozmiaru w chwili chwycenia;
  pierwszy piksel ruchu daje jeden piksel zmiany.
- Dla boksu wielkości realnego odczytu OCR dostępne są oba gesty.
- Kursor odpowiada gestowi w każdym punkcie kształtu.
- Trzy nowe testy, z których pierwszy czerwienieje po usunięciu offsetu.
- `check.ps1` przechodzi w całości jednym przebiegiem.
- `git status` czysty, bez push i merge.
