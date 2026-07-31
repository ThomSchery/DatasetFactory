# TK-003 — log implementacji

## Zakres wykonany

- `MediaProcessingAccess`: pojedyncza klatka FFmpeg, walidacja OpenCV, atomowa
  publikacja i cropy regionów pod kontrolą `Workspace`.
- wydzielony `OcrEngine` oraz eksperymentalny adapter Tesseract: natywne char
  boxes + hOCR confidence, provenance, timeout i ograniczony retry.
- czyste mapowanie bbox lokalnego cropu do globalnego bbox klatki.
- jawnie syntetyczne fixtures: lossless wideo, klatka, **11 cropów / 59 znaków
  GT**, w tym `/` w `77/100`.
- `ocr-evaluator-v2` oraz wersjonowany raport z manifestem SHA-256 GT i wszystkich
  referencjonowanych cropów.

## Fixupy po review

### TK-003-F1

- confinement absolute/symlink przed efektem ubocznym;
- retry tylko timeout/udowodnione abnormal termination;
- pinowane runtime/model hashes i pełne provenance;
- trwała klasyfikacja quality FAIL, geometry metrics i klasa `/`.

### TK-003-F2

- przed hashowaniem i subprocess wymagane jest
  `runtime.model.name == f"{language}.traineddata"`; mismatch kończy się
  `ocr_provenance_mismatch` bez wywołania runnera;
- alignment najpierw minimalizuje koszt Levenshteina, a przy remisie maksymalizuje
  łączny IoU same-char/order-preserving matches; regresje obejmują `AA/AAA`,
  `77/100` i `100`;
- raport v2 pinuje SHA-256 ground truth i każdego z 11 cropów, więc podmiana PNG
  bez zmiany JSON jest wykrywana;
- ograniczenie v1: tylko jeden model `{language}.traineddata`; przyszłe
  `eng+...` wymaga mapy hashy wszystkich faktycznie ładowanych modeli.

## Interpretacje i trade-offy

- Brak materiału w `doc/Materials for analyze/` wymusił wariant syntetyczny
  dopuszczony przez ticket.
- Confidence pochodzi z `x_conf` znaku w hOCR; geometria z natywnego `.box`.
  Adapter nie estymuje char boxes z boksów słów.
- Geometry-aware tie-break zmienił semantykę evaluatora, dlatego wersję podniesiono
  z `ocr-evaluator-v1` do `ocr-evaluator-v2` i odtworzono raport realnym runtime.
- Przeliczenie v2 **nie zmieniło metryk fixture**; nie wygładzano wyniku.

## Audyt odpowiedzialności klas

| Klasa/moduł | Werdykt | Uzasadnienie |
|---|---|---|
| `MediaProcessingAccess` | Healthy | Operacje jednego adaptera FFmpeg/OpenCV; brak DB/HTTP/workflow. |
| `TesseractRuntimeIdentity` | Healthy | Wyłącznie pinning runtime/modelu i budowa provenance. |
| `TesseractProcessRunner` | Healthy | Uruchomienie i terminacja jednego drzewa procesu. |
| `TesseractOutputParser` | Healthy | Łączenie `.box` i hOCR; brak persistence. |
| `TesseractOcrEngine` | Healthy | Orkiestracja jednego wywołania portu bez reguł datasetu. |
| `ocr_evaluation` | Healthy | Czysta, wersjonowana ewaluacja tekstu i geometrii. |

Brak pozycji `Review` ani `Split required`. Granica OCR pozostaje:
kontrolowany input → pinowany provider → parser → walidacja → domain candidate →
czysty evaluator/mapping.

## Wynik Gate 2

**Quality FAIL pozostaje obowiązujący:** 59 znaków GT, 60 obserwacji, 4 edycje,
**93,22% char accuracy**, **7/11 exact**, bbox precision 91,67%, recall 93,22%
i minimum IoU 0.

Po domknięciu technicznego review TK-003-F2, TK-004 jest odblokowany wyłącznie z
Tesseract jako `experimental` oraz obowiązkowym `quality_gate=failed`. Tesseract
nie jest zatwierdzonym silnikiem docelowym; pozostaje TD-014. TK-004 nie został
rozpoczęty w ramach TK-003-F2.
