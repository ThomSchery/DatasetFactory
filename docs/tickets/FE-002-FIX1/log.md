# FE-002-FIX1 — log implementacji

## Design Plan

Tryb powierzchni: **Operate**. Zmiana dotyczy wyłącznie istniejącego komponentu
`common/RegionOverlay` — nie powstaje nowy komponent, nowy token ani nowy
asset. Autorytet wizualny: `frontend/src/styles/tokens.css`, katalog
komponentów z `.agent/guidelines/new-component.md` i wytyczne UI/UX v3.

### Elementy interfejsu w zakresie

- bbox zaznaczonej anotacji na obrazie: cztery uchwyty narożne (marker wizualny
  i cel wskaźnika), wypełnienie, pas hit-targetu krawędzi;
- afordancja kursora nad zaznaczonym, edytowalnym kształtem: obszar
  przesuwania i strefa skalowania;
- gest skalowania narożnikiem — relacja punktu chwytu do narożnika.

Poza zakresem: panele, inspektor, lista anotacji, formularz nowego bboxa,
backend, API i model danych. Ticket jest czysto frontendowy.

### Moduły i ID wytycznych UI/UX

- [x] Layout/siatka: `GRID-03`, `GRID-04`, `GRID-05`, `GRID-08`. Przeczytany
  cały moduł „Elementy Interaktywne i Obszary Dotykowe”. `GRID-05` żąda
  minimum `32x32px` dla obszaru klikalnego na desktopie — patrz „Napięcie z
  GRID-05” niżej; rozstrzygnięcie jest świadome i opisane.
- [x] Typografia: brak zmian — żaden tekst nie jest dotykany.
- [x] Kolory: `COLOR-09`, `OPACITY-02`. Bez nowych wartości; cel wskaźnika
  pozostaje `--color-surface-transparent`, marker `--color-text-strong-default`.
- [x] Obramowania: `BWIDTH` bez zmian — `--border-width-emphasis` obrysu bboxa
  i `--size-xs` pasa krawędzi zostają nietknięte.
- [x] Cienie: brak.
- [x] Interakcje: `OVERLAY-06`. Przeczytany cały moduł „Ograniczenia Techniczne
  i Rozwiązania Awaryjne”. Cel wskaźnika jest niewidoczny, ale *jest* celem
  gestu, a nie ślepą blokadą; nadal odbiera wyłącznie interakcję, którą
  zapowiada, i nie zabiera zdarzeń wnętrzu kształtu.
- [x] Komponenty: wyłącznie istniejący `RegionOverlay`; zero elementów inline.

### Napięcie z GRID-05 i jego rozstrzygnięcie

`GRID-05` mówi o minimalnym obszarze klikalnym `32x32px` dla elementu
interaktywnego. Boks OCR rzędu 19×40 pikseli źródłowych renderuje się jako
około 15×33 CSS px, więc cztery cele `32x32` nie mieszczą się wokół niego bez
przykrycia całego wnętrza — dokładnie to zmierzył recenzent FE-002 i to jest
przyczyna obu findingów P2.

Rozstrzygnięcie: cel narożnika przestaje być kwadratem wyśrodkowanym na
narożniku i staje się kwadratem **wychodzącym na zewnątrz** kształtu, a jego
bok wynika z krótszego boku bboxa. Dzięki temu:

- wnętrze kształtu nigdy nie należy do uchwytu, więc kursor nad wnętrzem
  zapowiada przesuwanie, którym gest faktycznie jest (`F3`);
- zasięg *na zewnątrz* narożnika dla dużych kształtów rośnie z 16 do 32 px
  źródłowych względem dzisiejszego stanu, bo dzisiejsza wewnętrzna połowa celu
  i tak jest martwa — reguła z `838221b` każdy punkt ściśle wewnątrz kształtu
  traktuje jako przesuwanie niezależnie od trafionego DOM-u;
- intencja `GRID-05` — „operacja nie może wymagać precyzji” — jest w tym
  ekranie spełniona inną drogą, którą `RegionOverlay` deklaruje w swojej
  definicji: klawiatura wybiera i usuwa kształt, a inspektor ma pełnowymiarowe
  pola `x/y/width/height`. Żadna operacja v1 nie wymaga trafienia w prostokąt.

Granice celu, w pikselach źródłowych, żeby jednostka była ta sama co jednostka
geometrii bboxa:

| Wielkość | Wartość | Skąd |
|---|---|---|
| minimum | `8` | ten sam rozmiar co istniejący pas krawędzi `--size-xs`, którym komponent już dziś łapie cienkie regiony |
| maksimum | `32` | liczba z `GRID-05`, wyrażona w pikselach źródłowych, więc skaluje się z obrazem, a nie z oknem |
| formuła | `krótszy bok / 2` | cel narożnika nie sięga dalej niż do połowy krótszego boku, więc nie wchodzi w drugą połowę sąsiada w gęstym rzędzie OCR |

### Dlaczego jednostki źródłowe, a nie CSS

`geometry.ts` deklaruje jedno przejście między układami współrzędnych —
`clientPointToSource`. Rozmiar celu liczony z krótszego boku kształtu **jest**
wielkością w pikselach źródłowych; przeliczanie go na CSS wymagałoby drugiej,
reaktywnej ścieżki skalowania (obserwacja rozmiaru powierzchni) i drugiego
miejsca, w którym render i arytmetyka mogą się rozjechać. Cel zostaje więc
w jednostkach źródłowych i jest czystą funkcją, testowaną wprost.

Koszt: przy bardzo małej skali wyświetlania (obraz 4K w wąskim panelu) cel
w CSS px maleje razem z obrazem. Ścieżka bez precyzji (inspektor, klawiatura)
pozostaje nietknięta, a `viewBox` nie powiększa obrazu ponad 1:1.

## Plan testów

1. **F1 — chwyt poza środkiem uchwytu** (`RegionOverlay.test.tsx`, jsdom):
   chwyt 6 px źródłowych za narożnikiem, ruch o znaną deltę, asercja dokładnego
   bboxa. Test czerwienieje po usunięciu zachowania offsetu.
2. **F2 — mały boks 19×40** (`RegionOverlay.test.tsx` + `geometry.test.ts`):
   istnieje punkt dający przesunięcie i punkt dający skalowanie; żaden punkt
   ściśle wewnątrz nie należy do celu uchwytu.
3. **F3 — kursor** (`vertical-flow.spec.ts`, Chromium): `elementFromPoint`
   i `getComputedStyle().cursor` w obszarze przesuwania i w strefie uchwytu.
   jsdom nie stosuje CSS (`vitest.config.ts` bez `css: true`), więc asercja
   kursora ma sens wyłącznie w prawdziwej przeglądarce — tak samo mierzył to
   recenzent.

## Przebieg i dowody

### Dowód mutacyjny F1

Po zaimplementowaniu zachowania offsetu usunięto na chwilę oba odjęcia
`current.grabOffset` w `rectForManipulation` i uruchomiono wyłącznie test nośny:

```text
npm test -- --run src/components/common/RegionOverlay/RegionOverlay.test.tsx -t "resizes by how far the pointer travelled"

AssertionError: expected "vi.fn()" to be called with arguments: [ Array(2) ]

-     "height": 40,
-     "width": 50,
+     "height": 46,
+     "width": 56,
```

Wynik mutacji: `1 failed`, `26 skipped`. Po natychmiastowym przywróceniu
odejmowania offsetu ten sam przebieg dał `1 passed`, `26 skipped`. Różnica
`+6/+6` jest dokładnie niezerowym przesunięciem chwytu zapisanym w scenariuszu,
więc test nie przechodzi przypadkiem na chwycie w środku narożnika.

### Weryfikacja F3 w przeglądarce

Skupiony przebieg `vertical-flow.spec.ts` w Chromium dał `1 passed`. Test mierzy
rzeczywisty element spod wskaźnika i jego styl obliczony: ścisłe wnętrze bboxa
ma `cursor: move` i nie należy do żadnego uchwytu, a zewnętrzna strefa
południowo-wschodniego narożnika ma `cursor: nwse-resize`. Ten sam scenariusz
rozpoczyna resize w punkcie różnym od narożnika i asertuje zmianę bboxa wyłącznie
o deltę ruchu.
