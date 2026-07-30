# FE-SETUP — log wykonania

## Design Plan (przed kodem)

Baseline: `designs/baseline-impeccable/page.html`, `page.css` i `tokens.json`.
Wariant wizualny: ciemny `Impeccable` z pomarańczowym akcentem
`--color-fill-brand-impeccable`. Fonty z baseline'u mogą być użyte tylko wtedy,
gdy są zainstalowane lokalnie; stosy systemowe zapewniają działanie offline.

Elementy UI w tickecie:

- `Button`: warianty `primary`, `secondary`, `muted`; rozmiary `sm`, `md`, `lg`;
  stany default, hover, active, focus-visible, disabled i loading.
- `Loading`, `Empty`, `InlineError`, `FatalError`, `Progress` zgodne z FE-06.
- Design harness: paleta semantyczna, spacing, radius, typography, Button i UiStates
  pokazane w jednym widoku referencyjnym dla viewportu 1440 px.

Checklist:

- [x] Layout/Siatka: `--size-xs` … `--size-xxl`, wysokości kontrolek 32/40/48 px;
  GRID-00..14 oraz SPACING-01..13 przeczytane w całości. Komponenty używają
  wyłącznie tokenów siatki; wyjątkiem są funkcjonalne grubości border 1/2 px.
- [x] Typografia: lokalne stosy fallback, skala 12/14/16/20/24/32 px, wagi
  regular/semibold/bold, `--line-height-tight|standard|loose`; moduły TYPO,
  FONTSIZE, LHEIGHT, LSPACE, PARASPACE i CASING przeczytane w całości.
- [x] Kolory: semantyczne tokeny baseline'u `background`, `surface`, `stroke`,
  `text`, `brand`, `status`, `overlay`; COLOR-01..10 przeczytane w całości.
  Pary tekst/tło będą objęte testem kontrastu.
- [x] Obramowania: stroke-weak tylko strukturalnie, stroke-strong dla kontrolek
  i fokusu; radius sm/md/lg/pill; moduły BORDER, BWIDTH i RADIUS przeczytane.
- [x] Cienie: tokeny elevation-low/high pozostają przeniesione z baseline'u;
  komponenty stanów na ciemnym tle nie polegają na cieniu. Moduły OVERLAY i
  SHADOW przeczytane w całości.
- [x] Interakcje: hover/pressed z alpha 0.8, disabled 0.2, jawny focus-visible,
  natywny `disabled`, `aria-busy`, role live/alert i `<progress>`; COLOR-07,
  OPACITY-01..02, BORDER-06 oraz GRID-03..07.
- [x] Komponenty: katalog startowy był pusty. Powstają wyłącznie `Button` i
  `UiStates`; `FatalError` reużywa `Button`, bez przycisków inline.

## Interpretacje i ograniczenia

- Workflow Tailwind został literalnie zaadaptowany: jedynym źródłem tokenów jest
  `frontend/src/styles/tokens.css`; Tailwind nie powstaje.
- Baseline zawiera fetch Google Fonts, ale aplikacja go nie kopiuje. Nazwy Inter,
  Manrope i JetBrains Mono są pierwszym wyborem tylko lokalnie, potem działają
  jawne fallbacki systemowe.
- Dwuwarstwowe tokeny cieni zachowują dokładne wartości wyekstrahowanego
  baseline'u dla porównania referencyjnego. Komponenty produkcyjne nie polegają
  na cieniu do komunikacji stanu na ciemnym canvasie (SHADOW-05); używają koloru,
  stroke i semantyki.
- FE-07 definiuje desktop-first i minimalną szerokość roboczą 1280 px. Harness
  ma szerokość referencyjną 1440 px; komponenty wspólne same pozostają odporne na
  zwężenie, bez implementowania ekranów mobilnych.

## Gate odpowiedzialności modułów

Ocena wg `.agent/guidelines/class-responsibility-review.md`:

| Moduł | Wynik | Jedna odpowiedzialność / granica |
|---|---|---|
| `Button` | Healthy | Renderuje semantyczny przycisk i mapuje jawne propsy na warianty oraz stany; nie zna domeny, API ani persistence. |
| `UiStates` | Healthy | Udostępnia pięć małych, niezależnych prezentacji stanów FE-06; jedyna zależność to reużycie publicznego `Button`. |
| `DesignHarness` | Healthy | Składa wyłącznie publiczne komponenty i tokeny w referencyjny katalog; nie jest shellem aplikacji ani feature'em. |

Brak pozycji `Review` i `Split required`. Nie ma klas, serwisów, AI, dostępu do
danych ani orkiestracji między modułami; knowledge graph nie wniósłby dodatkowej
informacji dla tych funkcyjnych komponentów React.

## Wynik implementacji i QA

- `npm test`: 4 pliki, 15/15 testów — PASS. Pokryte: klawiatura/focus,
  disabled, loading/`aria-busy`, semantyka status/alert/progress oraz kontrast.
- `npm run build`: `tsc --noEmit` + Vite production build — PASS (24 moduły).
- Kontrast wyliczony bez duplikowania palety, bezpośrednio z `tokens.css`:
  text-strong/canvas 16.08:1; text-weak/canvas 8.18:1; text-on-brand/brand
  7.26:1; error/surface 4.72:1; stroke-strong/canvas 11.31:1.
- Audyt CSS: 69 zdefiniowanych custom properties, 0 nierozwiązanych `var()`.
- Harness pokazuje 20/20 runtime'owych tokenów koloru oraz spacing, typografię,
  radius, stroke, elevation, warianty/rozmiary Button i komplet UiStates.
- Audyt zależności wizualnych: brak Tailwinda, `@apply`, CDN, Google Fonts i
  runtime `http(s)` w `frontend/src`; stosy fontów mają fallback offline.
- Lokalny harness `http://127.0.0.1:5174/?view=design-harness` odpowiedział 200.
  Port 5173 był zajęty przez inną lokalną aplikację, więc do QA użyto 5174.
- Statyczne porównanie z `page.css/tokens.json`: zachowane canvas/surface/text,
  pomarańczowy brand Impeccable, 8-point spacing, radius i dwuwarstwowe shadows;
  HTML baseline'u nie został skopiowany do komponentu.

### Bloker screenshot QA

In-app Browser nie udostępnił żadnego backendu (`agent.browsers.list() = []`),
więc nie dało się wykonać i obejrzeć screenshotu 1440 px ani interaktywnie
sprawdzić hover/focus. Nie zastąpiono tego innym browser-control, zgodnie z
procedurą skilla. Harness jest gotowy pod `?view=design-harness`; screenshot QA
pozostaje jedynym niespełnionym kryterium środowiskowym.
