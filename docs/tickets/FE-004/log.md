# FE-004 — log decyzji i plan UI

## Rozstrzygnięcia przed kodem

1. **Odrzucona klatka może być źródłem, ale nie celem kopiowania.** Odrzucenie
   często oznacza wadliwy OCR całej klatki, nie nieprawdziwą geometrię stałych
   pól HUD. Selektywna grupa nadal może więc być wartościowym źródłem. Cel
   odrzucony pozostaje zamrożony zgodnie z istniejącym kontraktem review; przed
   kopiowaniem trzeba go jawnie otworzyć ponownie. Zaakceptowany cel również
   pozostaje terminalny.
2. **Porządek wyznacza `(run_id, frame_index)` w repozytorium backendu.** Źródło
   jest wyszukiwane jako największy `frame_index` mniejszy od indeksu celu.
   Stan filtra, strona listy i ostatnio edytowana klatka nie uczestniczą w tej
   decyzji.

## Plan interfejsu

Elementy UI:

- pasek „Powtórz z poprzedniej” w panelu bieżącej klatki;
- `SelectField` z grupami „Pola HUD”, „Znaki” i pojedynczymi klasami profilu;
- przycisk kopiowania z widocznym skrótem `R`;
- wyłączony stan pierwszej klatki z czytelnym powodem;
- komunikat `aria-live` z liczbą skopiowanych i zastąpionych anotacji albo
  jawną informacją o pustej grupie;
- blokada całego paska podczas istniejącej serializacji mutacji review.

Zastosowane moduły/ID wytycznych UI/UX:

- `forms`: kontrola ma etykietę, stan disabled i zachowuje natywne sterowanie;
- `interactions`: skrót `R` nie działa w polach tekstowych, selectach ani przy
  modyfikatorach; przycisk pozostaje równoważną drogą;
- `states`: pierwszy frame, pending, sukces, pusta grupa i błąd są jawne;
- `accessibility`: natywne kontrolki, `aria-live="polite"`, widoczny focus;
- `layout`: pasek pozostaje zwarty, zawija się przy progu `WidthGuard` 1280;
- `tokens`: wyłącznie istniejące tokeny i klasy `.df-*`, bez wartości ad hoc;
- `content`: komunikaty mówią, co skopiowano i co zastąpiono, zamiast ogólnego
  „gotowe”.

## Kontrakt operacji

- `scope=kind` z `kind=game|character` albo `scope=category` z `category_id`;
- wszystkie aktywne anotacje grupy na celu są oznaczane jako usunięte, a kopie
  źródła powstają jako ręczne (`source=manual`, bez confidence/observation);
- pusta grupa źródłowa jest poprawnym, atomowym wynikiem `copied=0`; nic na
  celu nie zostaje zastąpione;
- CAS używa `expected_version` klatki docelowej; całość jest jedną transakcją.
