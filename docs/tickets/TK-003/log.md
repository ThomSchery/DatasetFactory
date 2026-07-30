# TK-003 — log implementacji

## Zakres wykonany

- `MediaProcessingAccess`: pojedyncza klatka FFmpeg, walidacja OpenCV, atomowa
  publikacja i cropy regionów.
- `OcrEngine` oraz adapter Tesseract: natywne char boxes + hOCR char confidence,
  whitelist, provenance, timeout i ograniczony retry.
- czyste mapowanie bbox lokalnego cropu do globalnego bbox klatki.
- jawnie syntetyczne fixtures: lossless wideo, klatka, 10 cropów i ground truth.
- realny spike oraz werdykt w `docs/OCR_SPIKE.md`.

## Interpretacje i trade-offy

- Brak materiału w `doc/Materials for analyze/` wymusił wariant syntetyczny
  dopuszczony przez ticket.
- Confidence pochodzi z `x_conf` znaku w hOCR; geometria z natywnego `.box`.
  Adapter nie estymuje char boxes z boksów słów.
- OpenCV przypięto do 4.13.0.92, ponieważ 5.0.0.93 jest świeżym major release.
- Portable Tesseract rozpakowano na `D:` bez uruchamiania instalatora. Niepoprawna
  walidacja czasowa podpisu jest opisana w spike'u.

## Audyt odpowiedzialności klas

Przed zmianą moduł media zawierał osobne `ReferenceImageProbe`,
`FfprobeMediaProbe` i `ProcessTreeRunner`; żaden nie mieszał OCR ani reguł
domenowych. Po zmianie:

| Klasa | Werdykt | Uzasadnienie |
|---|---|---|
| `MediaProcessingAccess` | Healthy | Dwie operacje jednego adaptera FFmpeg/OpenCV; brak DB/HTTP/workflow. |
| `TesseractProcessRunner` | Healthy | Wyłącznie uruchomienie i terminacja jednego drzewa procesu. |
| `TesseractOutputParser` | Healthy | Jeden algorytm połączenia `.box` i hOCR; brak I/O i persistence. |
| `_HocrCharacterParser` | Healthy | Prywatny stan parsera jednego formatu. |
| `TesseractOcrEngine` | Healthy | Jedno publiczne API portu; koordynuje input, provider i parser bez reguł datasetu/persistence. |
| `DatasetDefinitionEngine` | Healthy | Mapowanie OCR pozostaje regułą definicji datasetu; szczegółowy algorytm jest w czystej funkcji. |

Nie ma pozycji `Review` ani `Split required`; publiczne API nowych klas jest
wąskie. Porównanie grafu importów nie wykazało zależności engine → OpenCV /
Tesseract / SQLAlchemy ani przeniesienia hotspotu do koordynatora.

## Wynik gate'u

Implementacja techniczna i testy są domknięte, ale Gate 2 jakości OCR ma wynik
**FAIL**: 94,34% char accuracy i 7/10 dokładnych cropów. TK-004 pozostaje
zablokowany do decyzji `OcrEngine` / nowego reprezentatywnego spike'u.
