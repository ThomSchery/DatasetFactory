# FE-001-F4-FIX1 — domknięcie workflow weryfikacji

Status: WYKONANY (2026-08-24)

> Domknięty implementacją FIX1 oraz uzupełniającym FIX2 po niezależnym
> re-review. Finalny acceptance review całego otwartego zakresu: `ACCEPT`.

## Powód

Cold review FE-001-F4 zakończył się werdyktem `REVISE`. Bazowa implementacja
jest kierunkowo zgodna i ma zielone bramki, ale dwa błędy HIGH mogą zapisać
geometrię do niewłaściwej anotacji albo ukryć nadal niepoprawne bboxy. Review
ujawnił też brak kontraktu profilu historycznego runu. Użytkownik rozstrzygnął,
że deep-link historycznego runu ma pozostać w pełni weryfikowalny przez nowy
read-only `GET /profiles/{profile_id}`.

Źródło findings:
`artifacts/fe-001-f4-annotation-review-cold-review/index.md` w epicu Traycer.

## Zakres

1. Zastąpić niezależne `drawTargetId`/`selectedId` jednoznacznym trybem redraw.
   Zmiana zaznaczenia musi jawnie przełączyć target albo anulować redraw; UI
   nazywa target. Gest nigdy nie może PATCH-ować innej anotacji niż wskazana.
2. Zachować `bbox_invalid.details.annotation_ids` do czasu naprawy każdego ID.
   Nie czyścić zbioru przed odpowiedzią. Sukces geometry/delete usuwa tylko
   zmienione ID; unrelated mutation i 409 nie ukrywają pozostałych.
3. Dodać `GET /profiles/{profile_id}` zwracający pełny `GameProfile`, ze stabilnym
   `404 profile_not_found`; statyczne `/profiles/current` nie może zostać
   przechwycone przez trasę dynamiczną. Frontend używa `run.profile_id`, dodaje
   centralny query key i nie pobiera kategorii historycznego runu przez current.
4. Po refetchu pustej dalszej strony z `total>0` automatycznie clampować `page`
   do istniejącego zakresu albo zachować działającą nawigację do poprzedniej.
5. Serializować zapis względem całego ekranu runu: podczas pending mutation
   zablokować filtr, paginację i wybór klatki, aby A → B → A nie tworzyło drugiej
   mutacji ze starego DTO ani nie gubiło wyniku pierwszej.
6. Dodać jawny tryb draw/redraw do `RegionOverlay`, w którym drag może zacząć się
   wewnątrz istniejącego bbox. Poza tym trybem zachować selekcję i zachowanie F3.
7. Dodać retry obrazu: remount/ponowne żądanie oraz reset błędu po udanym load,
   bez zmiany geometrii źródłowej.
8. Uzupełnić testy o realne sekwencje success → refetch nowego DTO → następna
   mutacja z nową wersją oraz regresje punktów 1–7. Fixture może podawać kolejne
   jawne DTO; nie może implementować logiki backendu.

## Poza zakresem

Zmiana modelu danych profilu, snapshot kategorii w runie, optimistic update,
SAM 3, maski, eksport i funkcje późniejsze. Brak nowych zależności bez osobnej
zgody.

## Done Criteria

- Test redraw A → select B → draw dowodzi jednoznacznego targetu i payloadu.
- Test `bbox_invalid` z co najmniej dwoma ID zachowuje nienaprawione ID po
  sukcesie i po 409 poprawki jednego bbox.
- Test `/profiles/current` != `run.profile_id` kończy się pobraniem
  `/profiles/{run.profile_id}` i działającym edytorem; 404 ma centralne copy.
- Test ostatniej klatki na stronie 2 wraca do poprawnej strony.
- Test nierozwiązanej mutacji blokuje filtr, stronę i wybór klatki; brak drugiego
  requestu.
- Test draw/redraw zaczyna drag wewnątrz istniejącego bbox bez regresji selekcji
  F3.
- Test image error → retry → load usuwa komunikat i zachowuje viewBox/geometrię.
- Testy sekwencyjne używają nowych wersji po refetchu dla annotation i frame.
- Pełne Vitest, architecture.test.ts, typecheck, build i audit są zielone.
- Log FE-001 zapisuje findings, decyzję kontraktową i finalne wyniki fixupu.
