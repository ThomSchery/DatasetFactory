# Tech Plan — DatasetFactory MVP

## 1. Topologia i uruchomienie

- `frontend/`: React/Vite/TypeScript; w dev `localhost:5173`, proxy `/api` do FastAPI.
- `backend/`: Python 3.12/FastAPI na `127.0.0.1:8000`; packaged-local serwuje
  zbudowane SPA oraz `/api` z jednego originu.
- Jeden proces backendu i jeden trwały worker `ThreadPoolExecutor(max_workers=1)`.
  Nie używamy Celery, brokera ani osobnego procesu modelowego w v1.
- Composition root tworzy engine'y, adaptery, repozytoria i `DatasetWorkflow`;
  test musi zbudować pełny graf z temp SQLite i atrapami subprocess/filesystem.
- Workspace i cache są konfigurowalne i domyślnie wskazują `D:`. Backend odmawia
  startu runu, jeśli katalog nie jest zapisywalny.

## 2. Granice pakietów

```text
backend/app/
  api/                 # cienkie routery, DTO Pydantic, error mapping
  managers/workflow/   # DatasetWorkflow
  engines/definition/  # DatasetDefinitionEngine
  engines/review/      # AnnotationReviewEngine
  engines/coco/        # CocoExportEngine
  access/media/        # FFmpeg/OpenCV
  access/ocr/          # OcrEngine protocol + Tesseract adapter
  access/store/        # SQLAlchemy repositories + workspace filesystem
  access/status/       # wymagania systemowe/GPU
  composition.py
frontend/src/
  app/ common/ api/
  features/{dashboard,profiles,materials,annotations,exports}/
```

Importy dozwolone wyłącznie Client/API → Manager → Engine/Access. Engine'y
używają własnych value objects i nie importują SQLAlchemy, FastAPI ani OpenCV.

## 3. Model danych SQLite

Wszystkie identyfikatory publiczne: UUID jako tekst; timestamps: UTC ISO 8601.
Wspólne pola encji trwałych: `created_at`, `updated_at`; wersjonowane agregaty
mają integer `version` do optimistic concurrency.

| Tabela | Kluczowe pola / ograniczenia |
|--------|-----------------------------|
| `projects` | `id`, `name`, `workspace_path`; v1 dokładnie jeden aktywny rekord |
| `reference_assets` | `id`, kontrolowany `relpath UNIQUE`, `content_type`, `size_bytes`, `status=ready/missing`; nigdy ścieżka źródłowa |
| `game_profiles` | `id`, `project_id`, `name`, `normalized_name UNIQUE`, `reference_asset_id`, `source_width`, `source_height`, `version` |
| `hud_regions` | `id`, `profile_id`, `name`, `x,y,width,height` integer; bbox dodatni i w granicach source; `UNIQUE(profile_id,name)` |
| `categories` | `id`, `profile_id`, `name`, `kind=character/game`, `ordinal`; `UNIQUE(profile_id,name)`, `UNIQUE(profile_id,ordinal)` |
| `video_assets` | `id`, `project_id`, `local_path`, `size_bytes`, `duration_ms`, `width`, `height`, `fingerprint(size+mtime)` |
| `pipeline_runs` | `id`, `profile_id`, `video_id`, `interval_ms`, `status`, `error_code`, `last_heartbeat_at`, `attempt`, `total_frames`, `version` |
| `frames` | `id`, `run_id`, `frame_index`, `timestamp_ms`, `image_relpath`, `stage_status`, `review_status`, `width`, `height`, `version`; `UNIQUE(run_id,frame_index)` |
| `region_samples` | `id`, `frame_id`, `region_id`, `crop_relpath`, `stage_status`; `UNIQUE(frame_id,region_id)` |
| `ocr_observations` | `id`, `sample_id`, `char`, local `x,y,width,height`, `confidence`, `engine`, `engine_version`, `config_hash`, `valid`, `rejection_code` |
| `annotations` | `id`, `frame_id`, `category_id`, global `x,y,width,height`, `confidence NULL`, `source=ocr/manual`, `observation_id NULL`, `status=proposed/accepted/deleted`, `version` |
| `stage_checkpoints` | `run_id`, `frame_index`, `stage`, `attempt`, `status`, `artifact_relpath`, `artifact_hash`, `error_code`; composite unique `(run_id,frame_index,stage)` |
| `exports` | `id`, `run_id`, `status`, `output_relpath`, `input_revision`, `manifest_json` |

SQLite: WAL mode, foreign keys ON, transakcje krótkie. Worker nie trzyma
transakcji podczas FFmpeg/Tesseract. Najpierw powstaje temp artefakt, następnie
atomic rename, potem krótki commit checkpointu.

## 4. Kontrakty domenowe

```text
BBox(x:int, y:int, width:int, height:int)  # top-left, pixels, width/height > 0
OcrCandidate(char, bbox_local, confidence:0..1, provenance)
OcrProvenance(engine_id, engine_version, runtime_sha256, model_sha256,
              config_hash, quality_gate:passed|failed|unknown, experimental:bool)
AnnotationDraft(category_id, bbox_global, confidence, source, observation_id)
RunStatus = queued|running|paused|review_ready|completed|failed|cancelled
FrameStage = pending|sampled|cropped|ocr_complete|review_pending
ReviewStatus = pending|accepted|rejected
```

Współrzędne COCO są globalne względem pełnej klatki w formacie `[x,y,w,h]`.
Każdy adapter odpowiada za konwersję własnego układu współrzędnych na top-left.
Tesseract jest adapterem `experimental`; brak/`unknown` hash runtime/modelu jest
błędem konfiguracji, nie akceptowanym provenance produkcyjnym.
W v1 `model.name` musi być dokładnie `{language}.traineddata` przed hashowaniem;
`eng+...` wymaga przyszłej mapy pinów wszystkich ładowanych modeli i jest obecnie
odrzucane jako `ocr_provenance_mismatch`.
Engine definicji translatuje bbox cropu o offset regionu i ponownie waliduje.

## 5. API HTTP `/api/v1`

Wszystkie DTO Pydantic mają `extra='forbid'`. Błąd ma postać:

```json
{"error":{"code":"profile_resolution_mismatch","message":"...","details":{},"request_id":"uuid"}}
```

| Metoda i ścieżka | Request | Sukces | Błędy |
|------------------|---------|--------|-------|
| `GET /health` | — | wersja, DB, workspace, FFmpeg, Tesseract, GPU | `503 dependency_unavailable` tylko dla krytycznych DB/workspace |
| `GET /dashboard` | — | aktywny projekt/run, counts per status, system status | `500` |
| `GET /assets/references/{asset_id}` | opaque UUID zapisany w profilu | stream obrazu z relpath z bazy | `404`; nigdy arbitrary path |
| `POST /profiles` | `{name, reference_image_path, regions[], categories[]}` | `201 GameProfile` | `400 validation`, `404 source_missing`, `409 profile_name_exists` |
| `GET /profiles/current` | — | profil albo `null` | `500` |
| `POST /materials` | `{local_path}` | `201 VideoAsset` | `400 unsupported/too_large/too_long/disk_space`, `404` |
| `GET /materials` | `page,page_size<=100` | paged list | `400` |
| `POST /runs` | `{profile_id,video_id,interval_ms=1000}` | `201 PipelineRun(queued)` | `400 resolution/interval`, `404` |
| `POST /runs/{id}/start` | `{expected_version}` | `202 running` | `409 active_run/version/invalid_transition/source_missing/source_changed` |
| `POST /runs/{id}/pause` | `{expected_version}` | `202` | `409 invalid_transition` |
| `POST /runs/{id}/resume` | `{expected_version}` | `202` | `409 active_run/invalid_transition/version/source_missing/source_changed` |
| `POST /runs/{id}/cancel` | `{expected_version}` | `202` | `409 invalid_transition` |
| `GET /runs/{id}` | — | status, progress, error, version | `404` |
| `GET /runs/{id}/frames` | `review_status,page,page_size<=100` | paged summaries | `404/400` |
| `GET /frames/{id}/image` | — | image stream z kontrolowanego relpath | `404`; nigdy arbitrary path |
| `GET /frames/{id}` | — | frame + proposed/current annotations + version | `404` |
| `PATCH /annotations/{id}` | `{category_id,expected_version}` | annotation | `400 category`, `404`, `409 version/review_locked` |
| `DELETE /annotations/{id}` | `expected_version` query | `204` | `404`, `409` |
| `POST /frames/{id}/review` | `{decision:accept|reject,expected_version}` | frame review snapshot | `400 no_annotations`, `404`, `409` |
| `POST /exports` | `{run_id}` | `202 Export` | `400 no_accepted_frames`, `404`, `409 export_running` |
| `GET /exports/{id}` | — | status, manifest, relative output | `404` |

Endpointy są jawnie `local-public`; FastAPI binduje loopback. Dev CORS dopuszcza
wyłącznie skonfigurowany origin Vite. Nie ma endpointu przyjmującego upload ani
dowolną ścieżkę wyjściową.

## 6. Worker, idempotency i błędy

- Dispatcher w transakcji rezerwuje jedyny run; częściowy unique index lub
  blokada aplikacyjna + transakcja zapewnia max 1 status `running`.
- Worker heartbeat co maks. 5 s / po etapie. Startup uznaje `running` ze starym
  heartbeat za osierocony, weryfikuje hashe artefaktów i ustawia `paused`.
- Klucz idempotency etapu: `(run_id, frame_index, stage)`. `completed` + poprawny
  hash = skip; brak/uszkodzenie = ponowienie etapu i invalidacja zależnych draftów.
- FFmpeg: bez automatycznego retry dla błędnego pliku; adapter OCR: 1 retry po
  1 s wyłącznie dla timeoutu lub wykrytego abnormal termination. Błąd config,
  input i zwykły non-zero exit są non-retryable; pusty wynik jest sukcesem.
- Timeouty konfigurowalne: ffprobe 30 s, ekstrakcja pojedynczej klatki 60 s,
  Tesseract crop 30 s. Timeout zabija drzewo subprocess i zapisuje stabilny code.
- `ffprobe` zwraca i normalizuje `format_name`; zestaw aliasów demuxera
  `mov/mp4/m4a/3gp/3g2/mj2` mapuje do rodziny `mp4_mov`, a `matroska/webm` do
  `matroska`. Tylko te rodziny są dopuszczone i suffix nie zastępuje walidacji.
- Nieznany znak/pusty OCR nie zatrzymuje runu: zapisuje observation rejected albo
  klatkę bez propozycji do odrzucenia. Błąd infrastruktury zatrzymuje run.
- Operacje akceptacji i eksportu są transakcyjne; eksport używa `input_revision`
  i nie miesza wyników ze zmianą review w trakcie generowania.

## 7. Filesystem

```text
workspace/
  project.db
  assets/references/{asset_uuid}.{ext}
  runs/{run_uuid}/frames/{index}.jpg
  runs/{run_uuid}/regions/{index}/{region_uuid}.png
  exports/{export_uuid}/images/*.jpg
  exports/{export_uuid}/annotations.json
  exports/{export_uuid}/manifest.json
  logs/app.jsonl
```

W bazie przechowujemy tylko relpath kontrolowanych artefaktów. Wszystkie joiny
muszą po `resolve()` pozostawać pod workspace. Lokalna ścieżka źródłowego wideo
jest absolutna, walidowana przy każdym wznowieniu, ale nigdy serwowana przez API.
Przy intake materiału rezerwowany budżet to 512 MiB oraz estymata pełnych klatek
dla próbkowania 1 fps (128 KiB–4 MiB na klatkę zależnie od rozdzielczości).
Obraz referencyjny jest najpierw kopiowany do temp na wolumenie workspace, potem
w całości dekodowany przez Pillow i dopiero publikowany przez atomic rename.
Startup usuwa stare temp i finalne orphany, zachowuje committed valid assety oraz
oznacza rekordy bez pliku jako `missing`; reconciliation jest idempotentne.

## 8. Konfiguracja

`.env.example`: `DF_WORKSPACE_DIR`, `DF_CACHE_DIR`, `DF_FFMPEG_PATH`,
`DF_FFPROBE_PATH`, `DF_TESSERACT_PATH`, `DF_TESSERACT_MODEL_PATH`,
`DF_TESSERACT_VERSION`, pinowane `DF_TESSERACT_RUNTIME_SHA256` i
`DF_TESSERACT_MODEL_SHA256`, `DF_HOST=127.0.0.1`, `DF_PORT=8000`,
`DF_LOG_LEVEL`, `DF_DEV_CORS_ORIGIN`, timeouty. Host inny niż loopback kończy
startup błędem w v1. Brak sekretów.

## 9. Strategia testów i gate'y

- Engine: unit/property tests granic bbox, mapowania klas, przejść review i
  deterministycznego COCO.
- Access: integracyjne testy temp SQLite/Alembic, fixture wideo FFmpeg/OpenCV,
  adapter OCR na fixture/stub oraz bezwzględny path confinement przed mkdir,
  subprocess i replace. Adapter przyjmuje kontrolowany root/relpath, nie dowolny output.
- Manager/API: testy przejść statusów, jednego aktywnego runu, restartu,
  idempotency i standardowego error envelope.
- Frontend: Testing Library krytycznych formularzy/review; Playwright pionowego
  flow z backendem używającym deterministic `OcrEngine` stub.
- Gate 1: bootstrap, migracja, health i composition-root smoke test.
- Gate 2: profil + materiał + pojedyncza klatka przechodzą FFmpeg i techniczny
  kontrakt OCR (char boxes, confinement, retry, hashes, wersjonowana ewaluacja).
  Evaluator minimalizuje edit cost i rozstrzyga remisy maksymalnym łącznym IoU;
  manifest raportu pinuje ground truth oraz każdy referencjonowany crop.
  Tesseract quality FAIL jest jawnie utrwalony i klasyfikowany jako TD-014.
- Gate 3: pełen workflow API z restartem/checkpointem i poprawnym COCO.
- Gate 4: lint, format, typecheck, wszystkie testy, build SPA, Playwright i render
  1440 px; brak nierozwiązanych `var()` i brak poziomego overflow przy ≥1280 px.

## 10. Walidacja

### 3.1 PRD / Flow

- CF-01…07 mają endpointy, statusy, błędy i właścicieli modułowych.
- F01, F03–08, F11–16 mają pokrycie; F02/F09/F10 pozostają jawnie poza v1.

### 3.2 Stress-test

- Brak zewnętrznego API/429. Koszt chroni blokada jednego runu.
- Restart workera jest obsłużony heartbeat + checkpoint + idempotency.
- Race review/export jest chroniony `version` i `input_revision`.
- 50 GB nie przechodzi przez HTTP; payloady JSON są małe, listy stronicowane.
- Brak dysku i zniknięcie źródła dają kontrolowany błąd bez utraty checkpointu.

### 3.3 Spójność artefaktów

- Nazwy statusów, modułów, tras i ograniczeń są zgodne z `CONTEXT`, `MODULES`,
  `CORE_FLOWS` oraz tabelą v1.
- Design Impeccable, desktop-first i polling 2 s są propagowane do planu.

### 3.4 Strategia Pragmatyczna

- Client → Manager → Engine/Access; brak komunikacji w górę.
- Jeden manager eliminuje Manager↔Manager; engine'y nie znają zasobów.
- Brak sekretów; endpointy mają jawny model uprawnień i Pydantic validation.
- Każdy OcrEngine jest niezaufanym wejściem rozdzielonym od walidacji i zapisu;
  Tesseract jest jawnie experimental, z zaakceptowanym quality FAIL.
