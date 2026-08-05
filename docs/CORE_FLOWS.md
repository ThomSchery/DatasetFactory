# Core Flows

## CF-01 — Utworzenie profilu gry

1. Użytkownik podaje nazwę gry i absolutną ścieżkę referencyjnego obrazu.
2. API waliduje istnienie, format obrazu i odczytuje wymiary; kopiuje obraz do
   kontrolowanego katalogu projektu pod wygenerowaną nazwą.
3. UI pobiera obraz przez opaque asset URL i pozwala narysować regiony HUD.
4. Użytkownik nazywa regiony i wybiera klasy bazowe/per gra.
5. Backend waliduje dodatni bbox mieszczący się w obrazie, unikalne nazwy
   regionów i klasy; zapisuje profil atomowo.
6. Sukces przekierowuje do importu materiału.

Błędy: brak pliku/nieobsługiwany obraz → błąd pola; region poza obrazem → błąd
regionu; konflikt nazwy profilu → `409`; błąd kopiowania → nic nie jest zapisane.

## CF-02 — Import materiału i start runu

1. Użytkownik podaje absolutną ścieżkę MP4/MKV/MOV, profil i interwał (domyślnie 1 s).
2. Backend używa `ffprobe`: waliduje format, czas ≤2 h, rozmiar ≤50 GB i wymaganą
   ilość wolnego miejsca; nie kopiuje wideo do workspace.
3. Powstają `VideoAsset` i `PipelineRun(status=queued)`.
4. Start runu pobiera globalną blokadę jednego aktywnego runu (`409`, jeśli zajęta).
5. Worker przetwarza klatki kolejno i zapisuje checkpoint po każdym etapie.

Błędy: plik zniknął → `failed/source_missing`; brak miejsca → `failed/disk_space`;
FFmpeg/Tesseract niedostępny → run nie startuje, dashboard podaje naprawę.

## CF-03 — Próbkowanie, regiony i OCR

Dla `frame_index = 0..N-1`:

1. Jeśli etap dla `(run_id, frame_index)` jest ukończony i artefakt istnieje,
   pomiń go (idempotency).
2. FFmpeg zapisuje jedną klatkę dla `timestamp_ms = index * interval_ms` do pliku
   tymczasowego; po sukcesie następuje atomowe przemianowanie.
3. OpenCV wycina regiony profilu; w v1 zgodność rozdzielczości z profilem jest
   wymagana, inna rozdzielczość kończy run błędem `profile_resolution_mismatch`.
4. Aktywny `OcrEngine` zwraca boksy pojedynczych znaków; adapter normalizuje
   współrzędne, confidence i pełne provenance (engine/build/model hash/config).
   Dla Tesseract zapisuje także `quality_gate=failed` i `experimental=true`.
5. `DatasetDefinitionEngine` odrzuca boksy poza cropem, niedozwolone klasy i
   wartości niepoprawne; pozostałe mapuje do globalnych współrzędnych klatki.
6. Propozycje i status `review_pending` są zapisywane w jednej transakcji.
7. Po ostatniej klatce run przechodzi do `review_ready`.

Nie ma automatycznego retry dla błędnego odczytu OCR. Adapter może ponowić
wyłącznie timeout lub faktyczne abnormal termination, maksymalnie raz; zwykły
błąd config/input jest non-retryable.

## CF-04 — Restart, pauza, anulowanie i wznowienie

- Startup zamienia osierocone `running` na `paused` po sprawdzeniu artefaktów.
- `resume` rozpoczyna od pierwszego nieukończonego etapu/klatki.
- `pause` kończy bieżący bezpieczny etap i nie pobiera następnej klatki.
- `cancel` kończy aktywny subprocess, zachowuje ukończone dane i ustawia
  `cancelled`; ponowne wznowienie tworzy kolejną próbę tego samego runu.
- Uszkodzony/brakujący artefakt cofa wyłącznie odpowiadający mu etap i jego
  zależne wyniki, nigdy zaakceptowane wcześniejsze klatki.

## CF-05 — Weryfikacja anotacji

1. UI pobiera stronicowaną listę klatek `review_pending` i obraz jednej klatki.
2. Renderuje bbox, klasę, confidence i region źródłowy.
3. Użytkownik może zmienić klasę na dozwoloną, usunąć propozycję, poprawić
   geometrię istniejącego boksu albo narysować nowy w dowolnym miejscu klatki.
4. Akceptacja klatki zapisuje snapshot aktualnych anotacji jako `accepted`;
   odrzucenie oznacza klatkę `rejected` i wyklucza wszystkie jej anotacje.
5. Mutacja używa `version` klatki; konflikt równoległej/starej edycji daje `409`
   i wymaga ponownego pobrania (bez optimistic update).
6. Klatka z decyzją jest zamrożona: `accepted` i `rejected` odrzucają edycję
   anotacji. Odrzuconą można otworzyć ponownie jawną akcją — status wraca do
   `pending`, anotacje i ich statusy pozostają nietknięte, a `review_revision`
   rośnie jak przy każdej mutacji weryfikacji. Dopiero wtedy klatka jest
   edytowalna. `accepted` pozostaje terminalne, żeby snapshot eksportu był
   trwały.
7. Lista klatek daje się filtrować po `review_status`, więc odrzucone są
   osiągalne — bez tego ponowne otwarcie byłoby funkcją bez wejścia.

Brak boksu OCR: użytkownik dorysowuje go ręcznie. Boks ręczny ma `source=manual`
i nie ma `confidence`; walidacja sprawdza wyłącznie granice klatki, nie regiony
HUD, bo źle wyznaczony region jest jedną z przyczyn braku odczytu.

Odczyty OCR i boksy ręczne wyglądają na klatce tak samo — to prostokąty z klasą.
Różni je pochodzenie i `confidence`, które ma tylko odczyt; UI musi je odróżniać
wizualnie. Wznowienie po awarii kasuje wyłącznie boksy pochodzące z OCR, gdy
przelicza uszkodzony etap; boksy narysowane ręcznie przetrwają i pozostają obok
świeżych propozycji.

## CF-06 — Eksport COCO

1. Eksport jest dostępny tylko dla runu z co najmniej jedną zaakceptowaną klatką.
2. `CocoExportEngine` deterministycznie porządkuje obrazy, kategorie i anotacje,
   generuje stabilne liczbowe ID i waliduje bbox w granicach obrazu.
3. Uwzględnia wyłącznie klatki/anotacje `accepted`; kopiuje odpowiadające obrazy
   do katalogu eksportu i zapisuje `annotations.json` atomowo.
4. Manifest zawiera wersję schematu aplikacji, run/profile ID, czas eksportu
   oraz liczbę anotacji według źródła (`ocr` i `manual`); pełne lokalne ścieżki
   źródłowe nie trafiają do COCO. Sam dokument COCO pozostaje standardowy —
   źródło anotacji nie jest w nim polem, bo po weryfikacji każdy boks jest
   zatwierdzony przez człowieka, a rozróżnienie służy ocenie jakości OCR.
5. Powtórzenie bez zmian nadpisuje ten sam draft eksportu atomowo; zatwierdzony
   artefakt ma nowy `export_id`.
6. Ukończony eksport jest niezmienny. Ponowne otwarcie i akceptacja klatki, która
   już w nim jest, nie poprawiają datasetu na dysku — ten pozostaje wierną
   migawką swojej rewizji. Nowy stan wymaga nowego eksportu.

## CF-07 — Dashboard i błędy systemowe

Dashboard pokazuje bieżący projekt, aktywny run, liczby klatek per status oraz
stan FFmpeg, Tesseract, workspace i GPU. SAM 3 widnieje jako „poza v1”, nie jako
działający etap. Błąd zawiera polski komunikat, stabilny `code`, `request_id` lub
`run_id` oraz zalecaną akcję; traceback pozostaje wyłącznie w logu.
