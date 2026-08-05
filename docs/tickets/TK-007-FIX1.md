# TK-007-FIX1 — domknięcie ochrony ręcznych boksów

Status: WYKONANY (2026-08-05)

## Powód

Cold review TK-007 (werdykt `REVISE`, finding CRITICAL). Predykat
`Annotation.source == 'ocr'` trafił do `checkpoints.py:298`, ale nie do
`frames.py:224`. Anotacje kasują dwa writery; poprawiony został jeden.

Pełna ścieżka utraty danych, ta sama, dla której powstał TK-007:

1. Odrzucenie, `reopen`, klatka `pending`, użytkownik rysuje ręczny boks.
2. Awaria. Rekoncyliacja unieważnia etap `ocr` — działa poprawnie, ręczny boks
   zostaje, klatka wraca do `cropped`.
3. Worker wznawia pracę, widzi `stage_status='cropped'`, wykonuje OCR i wywołuje
   `commit_ocr`, który kasuje **wszystkie** anotacje klatki. Ręczny boks ginie.

Test dodany w TK-007 nie wykrywa tego, bo wywołuje `recover_startup()` dwa razy
i nigdy nie wznawia workera.

Drugie wejście nie wymaga awarii: `create_manual` sprawdza wyłącznie
`review_status`, więc boks można dodać do klatki przed jej pierwszym OCR —
zwykły `commit_ocr` go skasuje. Ta sama luka otwiera hazard z `frames.py:284`,
gdzie `commit_ocr` bezwarunkowo ustawia `review_status='pending'` i cicho cofa
akceptację klatki zaakceptowanej na etapie `cropped`.

## Zakres

1. `frames.py:224` — kasować wyłącznie anotacje `source='ocr'`, tak jak robi to
   `checkpoints.py`. Test musi wznowić workera po sekwencji reopen i rysowania.
2. Ręczny boks wolno dodać wyłącznie do klatki na etapie `review_pending`, czyli
   po zakończonym OCR. Wcześniejsza próba dostaje stabilny kod błędu. Zamyka to
   drugie wejście oraz hazard cichego cofnięcia akceptacji, bo klatka bez OCR
   nie może mieć żadnej anotacji, a więc i zostać zaakceptowana.
3. Unieważnienie etapu `sample` może zmienić wymiary klatki, przez co zachowany
   ręczny boks przestaje się mieścić. Nie kasujemy go — `accept` ma zwracać
   `400 bbox_invalid` z listą identyfikatorów niemieszczących się anotacji
   w `details`, żeby użytkownik wiedział, co poprawić.
4. Usunąć martwy kod dodany w TK-007: `AnnotationRepository.update_category`
   bez wywołań oraz nieosiągalną gałąź w `engine.py:153-155`.
5. `update()` z obydwoma argumentami `None` nie może podbijać `version` ani
   `review_revision`. Guard ma działać w transakcji, nie wyłącznie w engine.
6. Zastąpić placeholder `annotation_id="manual"` w `review_use_cases.py:114`.

## Poza zakresem

Zmiany w mechanizmie snapshotu eksportu, CAS rewizji, atomowej publikacji
i rekoncyliacji startowej. Cokolwiek z FE-001 i F10.

## Done Criteria

- Test pełnej sekwencji: reject, reopen, ręczny boks, awaria, rekoncyliacja,
  **wznowienie workera**, drugi restart. Ręczny boks istnieje po każdym kroku,
  `review_revision` bez zmian, rekoncyliacja idempotentna.
- Test wariantu, w którym po skasowaniu odczytów OCR klatka ma wyłącznie boksy
  ręczne: `accept` przechodzi, bo aktywna anotacja istnieje.
- Próba dodania ręcznego boksu do klatki przed zakończeniem OCR jest odrzucana
  stabilnym kodem; po `review_pending` przechodzi.
- Zwykły pierwszy `commit_ocr` nie kasuje żadnej anotacji `manual`.
- `accept` klatki z boksem wykraczającym poza zmienione wymiary zwraca
  `400 bbox_invalid` z identyfikatorami w `details`.
- Brak martwego kodu; pusty `PATCH` nie podbija żadnego licznika także wtedy,
  gdy ominie się engine.
- Pełne bramki backendu zielone: ruff, mypy strict, cały pytest.
