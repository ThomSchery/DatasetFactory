# OCR Spike — Gate 2

Data wykonania i stabilizacji: 2026-07-30.

## Werdykt

**Quality Gate 2: FAIL.** Techniczny kontrakt FFmpeg → OpenCV → `OcrEngine`
działa: adapter zwraca natywne boksy pojedynczych znaków, confidence i pełne
provenance. Tesseract nie osiąga jednak progów jakości nawet na prostym materiale
syntetycznym. Pozostaje wyłącznie adapterem `experimental` z
`quality_gate=failed`; docelowy silnik jest odroczony jako TD-014.

Negatywny werdykt jest trwałą, oczekiwaną klasyfikacją testu, a nie czerwonym
testem. `backend/tests/fixtures/expected-ocr/tesseract-5.5.3-evaluation-v2.json`
zapisuje obserwacje i wynik, a `ocr-evaluator-v2` przelicza go niezależnie od
lokalnej binarki. Regresja potwierdza też, że wcześniejsze **94,34%** jest FAIL
wobec progu 98%.

## Materiał i metoda

`doc/Materials for analyze/` nie zawierał cropów HUD ani gameplayu, dlatego użyto
jawnie syntetycznego minimum:

- 11 cropów, 59 znaków, Consolas Bold 56 px, białe glify na czarnym tle;
- klasy `-`, `/`, `0–9`, `A–Z`, w tym osobny crop `77/100`;
- lossless MKV i odpowiadająca klatka PNG 1280×852;
- pikselowe ground truth każdego glifu w `synthetic-hud.json`.

Generator znajduje się w `backend/tests/fixtures/generate_tk003_fixtures.py`.
Obserwację adaptera odtwarza moduł
`backend.tests.fixtures.generate_tk003_ocr_observation`. Tesseract działa z
`--psm 7`, `-l eng`, pinowanym `--tessdata-dir`, pełną allowlistą,
`hocr_char_boxes=1` oraz rendererami `makebox` i `hocr` w jednym subprocessie.
Natywne `.box` jest konwertowane z bottom-left do top-left i łączone z
per-character `x_conf` po `(znak, bbox)` — nie ma równego dzielenia word boxes.

## Wersjonowane kryteria `ocr-evaluator-v2`

| Metryka | Próg |
|---|---:|
| Char accuracy (`1 − Levenshtein / znaki GT`) | ≥ 98% |
| Cropy z dokładnym tekstem | ≥ 90% |
| Bbox precision przy IoU ≥ 0,50 | ≥ 90% |
| Bbox recall przy IoU ≥ 0,50 | ≥ 90% |
| Cropy exact char + bbox przy IoU ≥ 0,90 | ≥ 90% |
| Znaki GT z IoU ≥ 0,90 | ≥ 90% |

Brakujący albo błędnie sklasyfikowany znak otrzymuje IoU 0. Nadmiarowe boksy
obniżają precision. Raport pokazuje minimum i percentyle, więc dobry średni IoU
nie może ukryć słabego pojedynczego boksu.

Alignment najpierw minimalizuje koszt Levenshteina, a wśród ścieżek o tym samym
koszcie maksymalizuje łączny IoU zgodnych znaków przy zachowaniu kolejności.
Zapobiega to arbitralnemu przypisaniu nadmiarowego `A`, `7` albo `0` do bboxu GT.
Manifest raportu pinuje SHA-256 pliku ground truth oraz każdego z 11
referencjonowanych cropów; zmiana obrazu bez zmiany JSON unieważnia manifest.

## Wynik aktualnego fixture (evaluator v2)

| Metryka | Wynik | Status |
|---|---:|---|
| Char accuracy | **93,22%** (4 edycje / 59) | FAIL |
| Dokładny tekst per crop | **63,64%** (7 / 11) | FAIL |
| Bbox precision | **91,67%** (55 / 60) | PASS |
| Bbox recall | **93,22%** (55 / 59) | PASS |
| Exact char + bbox per crop | **63,64%** (7 / 11) | FAIL |
| Odsetek znaków GT z IoU ≥ 0,90 | **93,22%** (55 / 59) | PASS |
| IoU minimum / p10 / p25 | **0,000 / 0,925 / 0,960** | ryzyko ujawnione |
| IoU p50 / p75 / p90 | **0,966 / 1,000 / 1,000** | informacyjne |

Aktualne błędy tekstu to `AR075→ARO75`, `-25→25`, `SCORE9→SCORE9Q` oraz
`LEVEL7→LEVEL/7`. Ostatni przypadek stał się widoczny po poprawnym dołączeniu `/`
do allowlisty. Osobny crop `77/100` jest rozpoznany dokładnie; `/` ma natywny bbox
`[149,14,25,45]`, confidence i pinowane provenance.

## Runtime i provenance

### Tesseract — tylko dev/spike

- Runtime: `D:\tools\tesseract-5.5.3\tesseract.exe`, pełna wersja raportowana
  przez hOCR: `v5.5.3.20260724`; SHA-256:
  `C66F0F12ED76F6AA455DAC97684BBC86756D6A732380BEE09122454CFDA3F420`.
- Model: `D:\tools\tesseract-5.5.3\tessdata\eng.traineddata`, upstream
  `tesseract-ocr/tessdata_fast`, commit
  `87416418657359cb625c412a48b6e1d6d41c29bd`; SHA-256:
  `7D4322BD2A7749724879683FC3912CB542F19906C83BCC1A52132556427170B2`.
- Źródło runtime: **zewnętrzna dystrybucja Windows
  [UB Mannheim](https://github.com/UB-Mannheim/tesseract/wiki)**, do której
  kieruje [oficjalna dokumentacja tessdoc](https://tesseract-ocr.github.io/tessdoc/Installation.html#windows);
  nie jest to binarka zbudowana ani
  wydana przez upstream Tesseract. Pobrany plik dystrybucji:
  `tesseract-ocr-w64-setup-5.5.3.20260724.exe`, zachowany w
  `D:\tools\downloads\`; SHA-256:
  `BEE9E3434BD94FD65387D9BE28CD467A41F61B1275383B55B0F59A1331270AE4`.
- Pakiet wyłącznie rozpakowano przez 7-Zip do `D:`. Instalatora nie uruchomiono;
  nie zmieniono globalnego PATH, rejestru ani plików na `C:`.
- Authenticode wskazuje `Universität Mannheim`, thumbprint
  `2F92CB990D57719BDCCA2D72134378614A040D9B`, lecz Windows zwraca `UnknownError`:
  certyfikat wygasł 2023-12-10, a timestamp pochodzi z 2026. Hash jest pinowany,
  ale podpis nie daje prawidłowej walidacji kryptograficznej — TD-015 pozostaje.
- Licencje: Tesseract Apache-2.0, Leptonica BSD-2-Clause; dystrybucja zawiera
  dodatkowe biblioteki z własnymi licencjami upstream.

Adapter przed utworzeniem temp i subprocess liczy SHA-256 runtime/modelu oraz
porównuje je z `DF_TESSERACT_RUNTIME_SHA256` i
`DF_TESSERACT_MODEL_SHA256`. `unknown`, brak pliku lub mismatch kończy się
stabilnym błędem. `OcrProvenance` zawiera pełny build, oba hashe, config hash,
`experimental=true` i `quality_gate=failed`.

Ograniczenie v1: adapter przyjmuje jeden język i wymaga dokładnej zgodności
`model.name == f"{language}.traineddata"` przed hashowaniem i subprocessem.
Konfiguracje wielomodelowe, np. `eng+pol`, są odrzucane; ich przyszła obsługa
wymaga mapy pinów SHA-256 wszystkich modeli faktycznie ładowanych przez `-l`.

### OpenCV

- `opencv-python-headless==4.13.0.92`, pośrednio `numpy==2.5.1`;
- OpenCV Apache-2.0, wrapper MIT; bez GUI i zależności desktopowych;
- audyt zależności pozostaje częścią pełnego gate repozytorium.

## Confinement, retry i efekty uboczne

- media i OCR przyjmują wyłącznie relpath artefaktu względem kontrolowanego
  `Workspace`; absolutny output/input i ucieczka przez symlink/junction są
  odrzucane przed `mkdir`, temp, replace i subprocess;
- temp pozostaje przy pliku docelowym, na tym samym wolumenie workspace;
- timeout lub wykryte abnormal termination (`returncode < 0` albo Windows
  NTSTATUS ≥ `0xC0000000`) ma najwyżej jeden retry;
- zwykły non-zero, w tym exit code 2, zwraca `ocr_process_failed` po jednym
  wywołaniu i nie jest nazywany crashem;
- malformed, niedozwolone i out-of-bounds char boxes są odrzucane, a pusty
  poprawny wynik pozostaje sukcesem.

## Decyzja

Gate 2 techniczny jest spełniony, natomiast Gate 2 jakości pozostaje **FAIL**.
TK-004 może używać Tesseract wyłącznie jako adaptera eksperymentalnego i musi
przenosić `quality_gate=failed`. Przed produkcyjnym autolabelingiem albo packaged
v1 trzeba wykonać TD-014 i TD-015 na reprezentatywnych cropach prawdziwych HUD-ów.

## Weryfikacja repozytorium po TK-003-F2

- backend `pytest`: **111 passed** na izolowanym basetemp (w tym realny
  FFmpeg/Tesseract, model/language mismatch, geometry-aware alignment i manifest);
- targeted OCR/evaluator: **24 passed**;
- `ruff format --check`: 165 plików; `ruff check`: PASS;
- `mypy --strict`: PASS dla 69 plików źródłowych;
- `uv lock --check`: PASS; `pip-audit`: brak znanych podatności;
- frontend bez zmian: Vitest **15 passed**, TypeScript PASS, Vite build PASS,
  `npm audit`: 0 podatności.
