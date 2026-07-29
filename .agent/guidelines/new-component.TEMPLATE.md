---
version: "1.0"
description: SZABLON pliku new-component.md. Przy bootstrapie projektu (frontend-design-workflow.md, KROK 3) agent kopiuje go jako .agent/guidelines/new-component.md i uzupełnia miejsca oznaczone [UZUPEŁNIJ]. Po utworzeniu plik jest niezmienny poza sekcjami 4-5.
---

# 🧩 new-component.md

> ⛔ **TEN PLIK JEST NIEZMIENNY.** Agent NIE MOŻE go modyfikować
> ani nadpisywać. Jedyne dozwolone zmiany: dodanie nowego komponentu
> do katalogu (sekcja 4) i jego definicji (sekcja 5) po stworzeniu
> go w `common/`.

Ścieżka do wytycznych UI/UX: [UZUPEŁNIJ — ścieżka do
_agent_oriented_guidelines_final_UI_UX_v3.md]

---

## 1. CEL

Spójność wizualna całego projektu poprzez: reużywalne komponenty,
obowiązkowy proces planowania designu oraz wymuszenie użycia
tokenów z `tailwind.config.js` (lub odpowiednika) zamiast
arbitralnych wartości.

## 2. TWARDE REGUŁY DESIGNU

### 2.1 Reużywalność

ZABRONIONE jest tworzenie inline elementów interaktywnych
(np. `<button className="...">`), jeśli istnieje odpowiedni
komponent w `common/`. ZAWSZE najpierw sprawdź katalog (sekcja 4)
i użyj istniejącego. Jeśli komponent nie istnieje — stwórz go
w `common/` i dopiero potem użyj.

### 2.2 Design Plan (OBOWIĄZKOWY)

ZANIM napiszesz jakikolwiek kod UI, MUSISZ:

1. Przeczytać `tailwind.config.js` i zidentyfikować dostępne tokeny.
2. Dla każdego elementu designu w zadaniu znaleźć ID w komentarzach
   configu, a następnie przeczytać CAŁY moduł w wytycznych UI/UX,
   do którego to ID należy (np. RADIUS-02 → cała sekcja "Promień
   Obramowania" — zawiera reguły użycia, nie tylko wartości).
3. Sprawdzić katalog komponentów (sekcja 4).
4. Zapisać plan w `log.md` zadania z checklistą:
   - [ ] Layout/Siatka: jakie tokeny spacing? (GRID-01/02)
   - [ ] Typografia: fontSize, lineHeight, fontWeight?
         (FONTSIZE-*, LHEIGHT-*, TYPO-*)
   - [ ] Kolory: jakie tokeny? (COLOR-*)
   - [ ] Obramowania: stroke-weak czy strong? radius?
         (BORDER-*, RADIUS-*)
   - [ ] Cienie: elevation-low czy high? (SHADOW-*)
   - [ ] Interakcje: stany hover/active/disabled?
         (COLOR-07, OPACITY-*)
   - [ ] Komponenty: czy istnieją gotowe w common/? (sekcje 4-5)
5. Dopiero po uzupełnieniu checklisty — kodowanie.

## 3. STRUKTURA FOLDERÓW

Zasada Colocation — każdy komponent ma własny folder.

```text
src/components/
├── common/        # komponenty wielokrotnego użytku
├── [UZUPEŁNIJ]/   # foldery feature wg funkcjonalności projektu
└── ...            # (przy Modularnym Monolicie: odzwierciedlaj
                   #  nazwy modułów backendu tam, gdzie naturalne)
```

## 4. KATALOG ISTNIEJĄCYCH KOMPONENTÓW WSPÓLNYCH

⚠️ ZANIM stworzysz nowy element UI inline — sprawdź poniżej.

| Komponent | Ścieżka | Kiedy używać |
|---|---|---|
| (pusto — rośnie z projektem) | | |

## 5. DEFINICJE KOMPONENTÓW PROJEKTU

Dla każdego komponentu z common/: tabela rozmiarów i tabela stanów
(default / hover / active / disabled) wyrażona WYŁĄCZNIE tokenami.

(pusto — rośnie z projektem)
