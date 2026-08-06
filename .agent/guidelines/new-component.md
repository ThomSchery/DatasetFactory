---
version: "1.0"
description: Twarde reguły tworzenia komponentów UI DatasetFactory. Plik utworzony z new-component.TEMPLATE.md w FE-SETUP.
---

# 🧩 new-component.md

> ⛔ **TEN PLIK JEST NIEZMIENNY.** Agent NIE MOŻE go modyfikować
> ani nadpisywać. Jedyne dozwolone zmiany: dodanie nowego komponentu
> do katalogu (sekcja 4) i jego definicji (sekcja 5) po stworzeniu
> go w `frontend/src/components/common/`.

Ścieżka do wytycznych UI/UX:
`./_agent_oriented_guidelines_final_UI_UX_v3.md`.

## 1. CEL

Spójność wizualna całego projektu poprzez: reużywalne komponenty,
obowiązkowy proces planowania designu oraz wymuszenie użycia tokenów z
`../../frontend/src/styles/tokens.css` zamiast arbitralnych wartości.

## 2. TWARDE REGUŁY DESIGNU

### 2.1 Reużywalność

ZABRONIONE jest tworzenie inline elementów interaktywnych
(np. `<button className="...">`), jeśli istnieje odpowiedni komponent w
`common/`. ZAWSZE najpierw sprawdź katalog (sekcja 4) i użyj istniejącego.
Jeśli komponent nie istnieje — stwórz go w `common/` i dopiero potem użyj.

### 2.2 Design Plan (OBOWIĄZKOWY)

ZANIM napiszesz jakikolwiek kod UI, MUSISZ:

1. Przeczytać `../../frontend/src/styles/tokens.css` i zidentyfikować dostępne
   tokeny.
2. Dla każdego elementu designu w zadaniu znaleźć ID w komentarzach tokenów,
   a następnie przeczytać CAŁY moduł w wytycznych UI/UX, do którego to ID
   należy (np. RADIUS-02 → cała sekcja „Promień Obramowania”).
3. Sprawdzić katalog komponentów (sekcja 4).
4. Zapisać plan w `log.md` zadania z checklistą:
   - [ ] Layout/Siatka: jakie tokeny spacing? (GRID-01/02)
   - [ ] Typografia: fontSize, lineHeight, fontWeight? (FONTSIZE-*,
         LHEIGHT-*, TYPO-*)
   - [ ] Kolory: jakie tokeny? (COLOR-*)
   - [ ] Obramowania: stroke-weak czy strong? radius? (BORDER-*, RADIUS-*)
   - [ ] Cienie: elevation-low czy high? (SHADOW-*)
   - [ ] Interakcje: stany hover/active/disabled? (COLOR-07, OPACITY-*)
   - [ ] Komponenty: czy istnieją gotowe w common/? (sekcje 4–5)
5. Dopiero po uzupełnieniu checklisty — kodowanie.

## 3. STRUKTURA FOLDERÓW

Zasada Colocation — każdy komponent ma własny folder.

```text
frontend/src/components/
├── common/        # komponenty wielokrotnego użytku
├── dashboard/     # feature: dashboard
├── profiles/      # feature: profile gier
├── materials/     # feature: materiały
├── annotations/   # feature: anotacje
└── exports/       # feature: eksporty
```

## 4. KATALOG ISTNIEJĄCYCH KOMPONENTÓW WSPÓLNYCH

⚠️ ZANIM stworzysz nowy element UI inline — sprawdź poniżej.

| Komponent | Ścieżka | Kiedy używać |
|---|---|---|
| `Button` | `frontend/src/components/common/Button` | Każda akcja przyciskowa; jedyny dozwolony element `<button>` w aplikacji. |
| `UiStates` | `frontend/src/components/common/UiStates` | Loading, Empty, InlineError, FatalError i Progress zgodne z FE-06. |
| `NavItem` | `frontend/src/components/common/NavItem` | Każdy link nawigacyjny; jedyny dozwolony sposób renderowania linku trasy. |
| `StatusBadge` | `frontend/src/components/common/StatusBadge` | Odznaka stanu lub zakresu przy etykiecie: status runu, klatki, eksportu, znacznik „poza v1”. |

## 5. DEFINICJE KOMPONENTÓW PROJEKTU

### Button

Rozmiary:

| Rozmiar | Wysokość | Padding poziomy | Typografia |
|---|---|---|---|
| `sm` | `--control-height-sm` | `--size-sm` | `--font-size-sm` / `--line-height-standard` |
| `md` | `--control-height-md` | `--size-sm` | `--font-size-sm` / `--line-height-standard` |
| `lg` | `--control-height-lg` | `--size-md` | `--font-size-md` / `--line-height-standard` |

Warianty i stany:

| Wariant/stan | Tło | Tekst | Obramowanie / fokus |
|---|---|---|---|
| `primary` default | `--color-fill-brand-impeccable` | `--color-text-on-brand` | `--color-fill-brand-impeccable` |
| `secondary` default | `--color-surface-transparent` | `--color-text-strong-default` | `--color-stroke-weak-default` |
| `muted` default | `--color-surface-transparent` | `--color-text-strong-default` | `--color-stroke-strong-default` |
| hover / active | odpowiedni token `*-hover` / `*-active` | bez zmiany | bez zmiany szerokości |
| focus-visible | bez zmiany | bez zmiany | `--focus-ring-width` + `--color-fill-brand-impeccable` |
| disabled | bez zmiany | bez zmiany | cały komponent `--opacity-disabled` |
| loading | jak wariant | jak wariant | spinner z `currentColor`, natywny `disabled`, `aria-busy` |

### UiStates

| Stan | Semantyka | Tokeny wizualne |
|---|---|---|
| `Loading` | `role=status`, `aria-live=polite` | surface, text-weak, brand spinner |
| `Empty` | nazwany `section` | surface-neutral, text-strong/weak, radius-lg |
| `InlineError` | `role=alert` | status-error + status-error-soft |
| `FatalError` | nazwany `section role=alert`, retry przez `Button` | status-error, surface-raised, stroke-error |
| `Progress` | etykieta + natywny `<progress>` | surface-raised + brand fill |

### NavItem

Opakowuje `NavLink` z React Routera. Props: `to`, `children` (etykieta),
`description?`, `end?`.

| Stan | Tło | Tekst | Obramowanie / dekoracja |
|---|---|---|---|
| default | `--color-surface-transparent` | `--color-text-weak-default` | akcent `border-inline-start` 2 px w kolorze przezroczystym (rezerwacja miejsca) |
| hover | `--color-surface-neutral-hover` (alpha 0.06) | `--color-text-strong-default` | `text-decoration: underline` na etykiecie |
| active (`aria-current="page"`) | `--color-fill-brand-impeccable-soft` | `--color-text-strong-default` | akcent 2 px `--color-fill-brand-impeccable`, etykieta `--font-weight-semibold` |
| focus-visible | bez zmiany | bez zmiany | globalny `--focus-ring-width` + kolor marki |

Stan aktywny niesie `aria-current="page"` od `NavLink`, więc nie opiera się na
samym kolorze. Wysokość minimalna `--control-height-md` (hit area desktop).

### StatusBadge

Nieinteraktywna pigułka. Props: `children`, `tone?`, `srLabel?`.
Typografia: `--font-size-xs`, `--font-weight-semibold`,
`--letter-spacing-wide`, `text-transform: uppercase`, tekst wyśrodkowany.

| Tone | Tło | Tekst | Obramowanie | Kiedy |
|---|---|---|---|---|
| `neutral` (domyślny) | `--color-surface-neutral-raised` | `--color-text-strong-default` | `--color-stroke-weak-default` | zwykła etykieta stanu |
| `muted` | `--color-surface-transparent` | `--color-text-weak-default` | `--color-stroke-weak-default` | zakres poza v1, destynacja wymagająca danych |
| `brand` | `--color-fill-brand-impeccable-soft` | `--color-fill-brand-impeccable` | `--color-fill-brand-impeccable` | stan wyróżniony, np. aktywny run |
| `success` | dziedziczone | `--color-status-success-default` | `--color-status-success-default` | zakończone powodzeniem |
| `warning` | dziedziczone | `--color-status-warning-default` | `--color-status-warning-default` | ostrzeżenie, np. `experimental` OCR |
| `error` | `--color-status-error-soft` | `--color-status-error-default` | `--color-status-error-default` | niepowodzenie |

Tonów statusu nie wolno używać do znaczeń niestatusowych — „poza v1” to
`muted`, nie `warning`. `srLabel` dodaje prefiks czytany przez czytnik ekranu,
żeby znaczenie nie zależało wyłącznie od koloru.

