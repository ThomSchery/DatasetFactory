# TK-006-T4-FIX2 — szczelność kontraktu packaged i dowodu Gate 4

Status: W TRAKCIE

## Powód

Niezależny re-review FIX1 dał `ACCEPT` i odtworzył bramkę co do jednego testu,
ale wykrył trzy P2 oraz jedną ślepą plamkę testową P3. Artefakt źródłowy:
`artifacts/review-tk-006-t4-fix1/index.md`.

## Zakres

1. Znana trasa `/api/*` wywołana metodą GET niedozwoloną przez jej kontrakt
   zwraca w dev i packaged to samo 405 `http_error`; nieznana trasa pozostaje
   404 `route_not_found` dla GET/POST/PATCH.
2. Test przechodzi po efektywnych ścieżkach API z OpenAPI i dowodzi, że
   `_matches_declared_api_path` rozpoznaje każdą z nich, również po przyszłym
   `include_router(prefix=...)`.
3. Brakujący test `_require_provenance` podaje stubowi istniejący parametr
   `provenance` i dowodzi kontrolowanego `ocr_provenance_mismatch`; bez zmiany
   kodu produkcyjnego i bez przebudowy stuba.
4. Audyt persystencji rozdziela dowód ujawniania słabego provenance od dowodu
   blokowania niedopasowanego provenance i cytuje testy zgodnie z ich treścią.
5. User-facing `detail` statusu ma poprawne polskie znaki, a test backendu i
   fixture Dashboardu porównują tekst rzeczywiście emitowany przez API.
6. Pozostałe kody `ocr_*` na fallbacku zostają świadomie bez zmian: timeout
   i abnormal są retryable, a reszta dotyczy awarii już zweryfikowanego runtime,
   nie braku OCR objętego T4.

## Warunki zatrzymania

- Jeśli pokrycie `_require_provenance` wymaga zmiany produkcji albo przebudowy
  `StubOcrEngine`, przerwać i wrócić do koordynatora.
- Jeśli poprawiane ciągi statusu trafiają poza JSON/UI do strumienia, który nie
  gwarantuje UTF-8, przerwać i wrócić do koordynatora.

## Done Criteria

- Macierz dev/package dla znanej i nieznanej trasy przy GET/POST/PATCH jest
  zgodna: odpowiednio 405 i 404 z tą samą kopertą.
- Predykat rozpoznaje wszystkie efektywne ścieżki `/api/*` z OpenAPI.
- Nowy test guardu provenance jest zielony, a audyt opisuje dokładnie dowody.
- Backend i fixture UI używają identycznej, poprawnej polszczyzny.
- Pełny `scripts/check.ps1` przechodzi jednym nieprzerwanym przebiegiem.
- `git status` jest czysty; `.env` usunięty; brak push i merge.
