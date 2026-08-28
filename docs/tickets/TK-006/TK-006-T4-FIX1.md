# TK-006-T4-FIX1 — uczciwość na ostatnim metrze prezentacji

Status: GOTOWY

## Powód

Niezależny zimny review dał `ACCEPT` i odtworzył bramkę co do jednego testu:
pytest 319/319, Vitest 440/440, Playwright 4/4. Bezpieczeństwo trybu spakowanego
potwierdzone empirycznie — siedem wariantów traversal przeciw sekretom w katalogu
SPA i nad nim, żaden plik nie wyciekł. Odmowa runu bez OCR działa poprawnie:
`create_run` → `describe()` → `ocr_provenance_unknown` z `retryable=False`,
HTTP 400, run nie powstaje.

Trzy findingi P2 dotyczą warstwy prezentacji i spójności kontraktu. Wszystkie
są w zakresie T4, bo to ten ticket otworzył stany, których wcześniej nie było.

Review: `artifacts/review-tk-006-t4-packaged-local/index.md`.

## Zakres

### F1 — komunikat odmowy nie może radzić rzeczy niemożliwej

`frontend/src/api/messages.ts` nie ma copy dla `ocr_provenance_unknown`,
`ocr_provenance_mismatch` ani `ocr_configuration_invalid`, więc odmowa startu
runu bez OCR trafia w fallback: *„Spróbuj ponownie; jeśli błąd wraca, zajrzyj
do logów backendu."* Ta rada jest nieprawdziwa — ponowienie nigdy nie zadziała,
bo błąd ma `retryable=False`, a przyczyna jest widoczna dwa panele wyżej.

Przed T4 bootstrap twardo blokował ten stan, więc użytkownik nie mógł go
zobaczyć. T4 go otworzył i copy nie dołożył. Kontrakt T4 punkt 2 wymaga
widoczności braku OCR „w statusie systemu **i w UI**".

1. Dodaj copy dla trzech kodów. Ma mówić, czego brakuje i co zrobić —
   z odwołaniem do TD-015 i do instalacji Tesseracta, bez sugerowania ponowienia.
2. Dopisz kody do `REQUIRED_ERROR_CODES` w `coverage.test.ts`, żeby brak copy
   dla kolejnego kodu OCR czerwienił bramkę.

### F2 — `degraded` znaczy „brakuje czegoś potrzebnego", nie „brakuje OCR"

Rozstrzygnięcie na pytanie recenzenta. `health.py` warunkuje degradację
wyłącznie na `tesseract.available`, więc host bez FFmpega raportuje `ok`
i badge „Sprawny" — mimo że `bootstrap.ps1` traktuje FFmpeg jako twardo
wymagany, a bez niego nie da się pobrać ani jednej klatki.

To nie jest regresja, przed T4 było tak samo. Ale to właśnie T4 wprowadził
pojęcie stanu zdegradowanego i zielony badge przy niedziałającym rdzeniu
pipeline'u przeczy temu, co ten ticket miał osiągnąć.

1. `degraded` obejmuje każdą brakującą zależność operacyjną, nie tylko OCR.
   Brak FFmpeg lub ffprobe ma dawać `degraded`, tak samo jak brak Tesseracta.
2. `degraded`, nie `503`. Aplikacja bez FFmpega nadal pozwala przeglądać
   i eksportować istniejące runy, więc odcięcie całości byłoby nieuczciwe
   w drugą stronę. Krytyczne pozostają baza i workspace.
3. `detail` ma nazywać konkretną brakującą zależność. Użytkownik ma wiedzieć,
   czego brakuje, a nie że „coś jest ograniczone".
4. Regresja: host bez FFmpeg raportuje `degraded` i UI pokazuje `Ograniczony`
   z nazwą zależności.

### F3 — packaged i dev mają zwracać ten sam kontrakt błędu

Nieznana trasa `/api/*` dla metod innych niż GET: dev zwraca `404`
`route_not_found`, packaged `405` `http_error`. Bezpieczeństwo nietknięte —
w obu wypadkach koperta JSON, nigdy `index.html` — ale dryf między trybami
jest pułapką przy diagnozowaniu.

1. Doprowadź oba tryby do tego samego kodu i tej samej koperty.
2. Rozszerz `test_packaged_local.py` poza samo GET: co najmniej POST i jedna
   inna metoda na nieznanej trasie `/api/*`.

### F4 — dwie drobne poprawki poprawności

1. `status` w typach frontendu jest `str`, a wyszukiwanie idzie po
   trzykluczowym obiekcie bez fallbacku. Zamień na `Literal` z trzema
   wartościami — nieznany stan ma być błędem typów, nie cichym `undefined`.
2. Audyt pokrycia cytuje `test_durable_workflow.py:730` jako blokadę złego
   provenance, a pod tą linią jest inny test. Właściwe referencje to `:309`
   i `:1338`. Popraw w logu — audyt, który myli referencje, podważa pozostałe.

## Poza zakresem

- decyzja o niedołączaniu binarki OCR — zamknięta, nie otwieraj;
- serwowanie SPA i traversal — potwierdzone empirycznie, nie ruszaj;
- bootstrap w zakresie SHA-256 i wymagalności FFmpeg — potwierdzony;
- przeniesienie `OcrProcessError` — potwierdzone jako mechaniczne.

## Świadomie przyjęte, bez zmian

- Niekompletna instalacja Tesseracta omija sumę pliku, który jest obecny;
  ryzyko niskie, bo runtime liczy sumy przed każdym OCR.
- `.env.example` niesie ścieżki przykładowe, które trzeba dopasować do hosta;
  to natura pliku przykładowego. Upewnij się tylko, że README mówi to wprost.
- Montaż obsługuje `index.html` i `/assets`; przyszły plik w `frontend/public`
  wymagałby rozszerzenia. Zapisz jako znaną granicę.

## Done Criteria

- Trzy kody błędów OCR mają copy bez sugestii ponowienia; `coverage.test.ts`
  pilnuje kompletności.
- Host bez FFmpeg raportuje `degraded` z nazwą zależności, a UI pokazuje
  `Ograniczony`; baza i workspace nadal krytyczne.
- Dev i packaged zwracają identyczny kod i kopertę dla nieznanej trasy `/api/*`
  przy co najmniej trzech metodach, z testem.
- `status` jest typem zamkniętym.
- Referencje w audycie poprawione.
- `check.ps1` przechodzi w całości jednym przebiegiem.
- `git status` czysty, bez push i merge.
