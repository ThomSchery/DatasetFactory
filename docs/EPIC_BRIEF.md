# DatasetFactory — Epic Brief MVP

## Wynik

Lokalna aplikacja zamienia nagranie gameplay w zweryfikowany dataset COCO:
użytkownik raz definiuje profil gry i regiony HUD, aplikacja pobiera klatkę co
sekundę, wymienialny `OcrEngine` proponuje boksy znaków, człowiek zatwierdza wynik, a system
eksportuje wyłącznie zaakceptowane anotacje.

## Użytkownik i problem

Jeden autor datasetu pracujący lokalnie na własnym komputerze. Dzisiejszy koszt
to ręczne rysowanie każdego boksu; MVP skraca pracę, ale nie traktuje OCR jako
ground truth i nie usuwa obowiązkowej weryfikacji człowieka.

## Sukces MVP

- Dla fixture wideo pionowy przepływ działa od profilu do poprawnego COCO bez
  ręcznej ingerencji w pliki lub bazę.
- Materiał do 2 h / 50 GB jest przetwarzany przyrostowo bez ładowania całości
  do RAM i może wznowić się po restarcie od checkpointu.
- Każda zaakceptowana anotacja ma klasę, bbox, źródło i provenance OCR; żadna
  odrzucona lub nieweryfikowana klatka nie trafia do eksportu.
- UI używa baseline'u `Home — Impeccable`, pięciu ustalonych destynacji oraz
  polskich tekstów interfejsu.

## Zakres v1

F01, F03–F09, F11–F16 z wiążącej tabeli w `docs/CONTEXT.md`: tworzenie profilu,
lokalny materiał, FFmpeg 1 fps, cropy HUD, Tesseract, mapowanie znaków,
weryfikacja z ręczną korektą boksów (F09), COCO, dashboard, materiały, polling
pipeline'u, SQLite i powłoka UI.

## Poza zakresem

- edycja/lista wielu profili po utworzeniu (F02),
- SAM 3, maski i tracking (F10),
- chmura, konta, role, współpraca, upload 50 GB przez HTTP,
- train/val split, YOLO, automatyczny backup, mobile i pełne WCAG AA.

## Wiążące decyzje

- Strategia: Pragmatyczna; architektura 1 Client / 1 Manager / 3 Engine / 4 Access.
- Stack: React/Vite/TypeScript + FastAPI/Python + SQLite/SQLAlchemy/Alembic +
  FFmpeg/OpenCV + wymienialny `OcrEngine`. Tesseract jest tylko adapterem experimental.
- Wszystkie nowe zależności, cache i modele na `D:`; bazowy Python pozostaje na `C:`.
- Jeden aktywny run, polling co 2 s, przyrostowy checkpoint per klatka.
- API tylko na `127.0.0.1`; brak auth jest decyzją jawnie ograniczoną do loopback.

## Źródła prawdy

- Zakres i decyzje: `docs/CONTEXT.md`
- Moduły, zależności, estymacja: `docs/MODULES.md`
- Świadome uproszczenia: `docs/TECH_DEBT.md`
- Design: `designs/baseline-impeccable/`
