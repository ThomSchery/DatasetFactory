# FE-SETUP — Bootstrap systemu designu Impeccable

## Cel

Utworzyć obowiązkowy łańcuch zasad UI i pierwsze wspólne komponenty na podstawie
wyekstrahowanego `Home — Impeccable`, bez implementowania ekranów funkcjonalnych.

## Zależności

Brak; poprzedza każdy ticket UI. Może być realizowany równolegle z TK-001.

## Zakres / poza zakresem

W zakresie: kroki 0–5 `.agent/guidelines/frontend-design-workflow.md` w adaptacji
dla zwykłego CSS, tokeny Impeccable, `Button`, katalog komponentów, visual harness.
Poza: Dashboard/Profile/Materials/Annotations/Exports i integracja API.

## Pliki

- `D:\my\Projects\DatasetFactory\AGENTS.md`
- `D:\my\Projects\DatasetFactory\frontend\src\AGENTS.md`
- `D:\my\Projects\DatasetFactory\.agent\guidelines\new-component.md`
- `D:\my\Projects\DatasetFactory\frontend\src\styles\{tokens,global}.css`
- `D:\my\Projects\DatasetFactory\frontend\src\components\common\Button\**`
- `D:\my\Projects\DatasetFactory\frontend\src\components\common\UiStates\**`
- `D:\my\Projects\DatasetFactory\frontend\src\design-harness\**`

## Pakiety

Bez biblioteki komponentów i bez Tailwind. Użyj CSS variables/classes z
`designs/baseline-impeccable/page.css` i `tokens.json`; testy Vitest/Testing Library.

## Kontrakt

Publiczny `Button` ma warianty wynikające z baseline'u, jawne rozmiary i stany
default/hover/active/focus/disabled/loading. `UiStates` definiuje Loading, Empty,
InlineError, FatalError i Progress zgodnie z FE-06.

## Logika

1. Wykonaj literalnie workflow kroków 0–5, używając adaptacji CSS zamiast Tailwind.
2. Przenieś tokeny z baseline'u do jednego źródła, zachowując komentarze ID
   GRID/COLOR/TYPO/RADIUS/SHADOW z wytycznych UI/UX v3.
3. Nie kopiuj HTML strony jako komponentu; wyprowadź prymitywy wspólne.
4. Utwórz `new-component.md` z template, wpisz Button i UiStates do katalogu.
5. Design harness renderuje komponenty i pełną paletę/tokeny przy 1440 px.

## Done Criteria

- Łańcuch `AGENTS → src/AGENTS → new-component → tokens + UI/UX v3` jest pełny
  i żaden plik nie przeskakuje kolejnego kroku.
- Tokeny pochodzą z Impeccable; 0 nierozwiązanych `var()` i brak arbitralnych
  kolorów/spacingu/fontów w komponentach.
- `Button` i UiStates mają testy klawiatury, focus, disabled/loading i kontrastu.
- Fonty mają jawny fallback i zachowanie offline; brak fetch do CDN w runtime.
- Harness przechodzi screenshot QA 1440 px; wynik porównany z `page.html/page.css`.
- Nie powstaje Tailwind ani drugi system tokenów; F16/TD-010 pozostają zgodne.
- Coding agent zapisuje Design Plan w `log.md` przed kodem i aktualizuje katalog.

// @SCALE: zwykłe CSS tokens → zatwierdzona nowa iteracja designu → podmiana jednego źródła tokenów, nie ręczne przepisywanie ekranów.
