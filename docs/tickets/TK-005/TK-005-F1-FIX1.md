# TK-005-F1-FIX1 — rozdzielenie ostrzeżenia recovery od provenance

Status: WYKONANY (2026-08-04)

## Powód

Cold review TK-005-F1 (werdykt `REVISE`, finding High). Recovery zapisuje swoje
ostrzeżenie do `pipeline_runs.warning`, czyli do pola pełniącego rolę
niezmiennego provenance OCR porównywanego z checkpointami, a
`_checkpoint_is_valid` odcina sufiks `Recovery warning:` wyłącznie po stronie
runu.

Skutki:

1. Checkpoint zapisany po pominięciu recovery zawiera pełny sufiks. Przy
   kolejnym restarcie nie zgadza się z odciętym warningiem runu, więc poprawna
   klatka `pending` zostaje unieważniona i przebudowana. Rekoncyliacja przestaje
   być idempotentna, a propozycje OCR znikają bez powodu.
2. Legalne ostrzeżenie OCR zawierające literał `Recovery warning:` jest obcinane
   jeszcze zanim jakiekolwiek ostrzeżenie recovery powstanie; jego checkpoint
   pozostaje trwale nieważny.

## Zakres

Rozdzielić dwa niezależne kanały informacji. Provenance porównywane z
checkpointami musi wrócić do porównania wprost, bez `split` i bez żadnego
sentinela w treści.

1. Rozszerzyć migrację `0005` w miejscu — nie jest zmergowana ani wypchnięta,
   więc nie tworzymy `0006`. Dodać na `pipeline_runs` osobne pole stanu recovery
   (licznik pominiętych klatek i/lub własna kolumna ostrzeżenia).
2. `pipeline_runs.warning` wraca do roli wyłącznie provenance OCR;
   `_checkpoint_is_valid` porównuje je równością.
3. Ostrzeżenie recovery jest wyprowadzane z nowego pola i wystawiane w statusie
   runu tak samo jak dotąd — kontrakt API i widoczność dla użytkownika bez zmian.
4. Recovery nadal nie rusza `review_revision` ani stanu review.

## Poza zakresem

Cokolwiek z TK-005-F2. Zmiana semantyki pominięć uzgodnionej w TK-005-F1.

## Done Criteria

- Test regresji: pominięcie recovery, potem resume zapisujący nowy checkpoint,
  potem drugi restart — poprawna klatka `pending` nie zostaje unieważniona,
  a liczba unieważnień w drugim przebiegu wynosi zero.
- Test regresji: ostrzeżenie OCR zawierające literał `Recovery warning:` nie
  unieważnia własnego checkpointu.
- Rekoncyliacja powtórzona bez zmian w środowisku daje identyczny wynik.
- Ostrzeżenie o pominiętych klatkach nadal widoczne w statusie runu.
- `review_revision` nietknięty przez recovery.
- Pełne bramki backendu zielone: ruff, mypy strict, cały pytest.

## Wynik wykonania

Commit `24ee3d2`. Stan recovery trzymany jako licznik
`pipeline_runs.recovery_skipped_frames` (NOT NULL DEFAULT 0) dopisany do
migracji `0005`; tekst ostrzeżenia wyliczany przy serializacji w `api/runs.py`,
nie utrwalany. `_checkpoint_is_valid` porównuje `checkpoint.warning ==
run.warning` wprost; w ścieżce provenance nie został żaden sentinel.

Licznik jest nadpisywany przy każdym zastosowanym planie, także zerem — to
migawka ostatniej rekoncyliacji, nie historia. Przebieg bez uszkodzonych klatek
z decyzją review czyści ostrzeżenie.

Weryfikacja: ruff 0, mypy strict 0/83, 3 regresje FIX1, pakiet migracje/
composition/boundary 22, pełny pytest 221 w 26:41. Niezależne cold re-review:
`ACCEPT`, brak blokerów.
