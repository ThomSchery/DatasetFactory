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
| `pipeline_runs` | `id`, `profile_id`, `video_id`, `interval_ms`, `status`, `error_code`, `last_heartbeat_at`, `attempt`, `total_frames`, `version`, `review_revision` |
| `frames` | `id`, `run_id`, `frame_index`, `timestamp_ms`, `image_relpath`, `stage_status`, `review_status`, `width`, `height`, `version`; `UNIQUE(run_id,frame_index)` |
| `region_samples` | `id`, `frame_id`, `region_id`, `crop_relpath`, `stage_status`; `UNIQUE(frame_id,region_id)` |
| `ocr_observations` | `id`, `sample_id`, `char`, local `x,y,width,height`, `confidence`, `engine`, `engine_version`, `config_hash`, `valid`, `rejection_code` |
| `annotations` | `id`, `frame_id`, `category_id`, global `x,y,width,height`, `confidence NULL`, `source=ocr/manual`, `observation_id NULL`, `status=proposed/accepted/deleted`, `version` |
| `stage_checkpoints` | `run_id`, `frame_index`, `stage`, `attempt`, `status`, `artifact_relpath`, `artifact_hash`, `error_code`; composite unique `(run_id,frame_index,stage)` |
| `exports` | `id`, `run_id`, `status`, `output_relpath`, `input_revision`, `error_code`, `manifest_json`; partial `UNIQUE(run_id) WHERE status IN ('queued','running')` |

`review_revision` to licznik monotoniczny per run, startujący od `0`. Zwiększa go
dokładnie jedna transakcja każdej mutacji weryfikacji — korekta klasy anotacji,
tombstone anotacji oraz accept/reject klatki — obok inkrementu `version` samego
agregatu. `version` służy optimistic concurrency pojedynczej encji, a
`review_revision` identyfikuje stan całego zbioru anotacji runu; te dwa liczniki
nie zastępują się nawzajem. Etapy workera nie ruszają `review_revision`.

Równoległy eksport tego samego runu blokuje partial unique index, nie tylko
sprawdzenie w kodzie: drugi `POST /exports` przegrywa na `IntegrityError`
mapowanym na `409 export_running`. Nieudany eksport zapisuje stabilny
`error_code` jako kolumnę, nie jako pole opisowe manifestu.

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
| `GET /dashboard` | — | `DashboardResponse` — kształt poniżej tabeli | `500` |
| `GET /assets/references/{asset_id}` | opaque UUID zapisany w profilu | stream obrazu z relpath z bazy | `404`; nigdy arbitrary path |
| `POST /profiles/reference-preview` | `{reference_image_path}` | `201 {asset_id, width, height}` | `400 reference_path_not_absolute`, `404 source_missing`, `502 reference_asset_copy_failed` |
| `POST /profiles/reference-frame` | `{video_id,timestamp_ms}` | `201 {asset_id,width,height}` | `400/404/409/502/503/504` |
| `POST /profiles` | `{name, reference_image_path xor reference_asset_id, regions[], categories[]}` | `201 GameProfile` | `400 validation`, `404 source_missing/asset_not_found`, `409 profile_name_exists` |
| `GET /profiles` | — | lista podsumowań profili z licznikami i `active` | `500` |
| `GET /profiles/current` | — | profil albo `null` | `500` |
| `POST /profiles/{profile_id}/activate` | — | wybrany `GameProfile` | `404 profile_not_found`, `409 active_run` |
| `GET /profiles/{profile_id}` | — | dokładny `GameProfile` przypisany do runu | `404 profile_not_found` |
| `POST /materials` | `{local_path}` | `201 VideoAsset` | `400 unsupported/too_large/too_long/disk_space`, `404`, `503 ffprobe_unavailable`, `504 ffprobe_timeout` |
| `GET /materials` | `page,page_size<=100` | paged list | `400` |
| `POST /runs` | `{profile_id,video_id,interval_ms=1000}` | `201 PipelineRun(queued)` | `400 resolution/interval`, `404` |
| `GET /runs` | `page,page_size<=100` | paged global list with profile, review/annotation counts, export flag | `400` |
| `POST /runs/{id}/start` | `{expected_version}` | `202 running` | `409 active_run/version/invalid_transition/source_missing/source_changed` |
| `POST /runs/{id}/pause` | `{expected_version}` | `202` | `409 invalid_transition` |
| `POST /runs/{id}/resume` | `{expected_version}` | `202` | `409 active_run/invalid_transition/version/source_missing/source_changed` |
| `POST /runs/{id}/cancel` | `{expected_version}` | `202` | `409 invalid_transition` |
| `POST /runs/{id}/complete` | `{expected_version}` | `202 completed` | `404`; `409 invalid_transition/version` |
| `GET /runs/{id}` | — | status, progress, error, version | `404` |
| `GET /runs/{id}/frames` | `review_status,page,page_size<=100` | paged summaries | `404/400` |
| `GET /frames/{id}/image` | — | image stream z kontrolowanego relpath | `404`; nigdy arbitrary path |
| `GET /frames/{id}` | — | frame + jedna lista `annotations` + version | `404` |
| `POST /frames/{id}/annotations` | `{category_id,bbox:{x,y,width,height},expected_version}` | `201 Annotation` | `400 category/bbox_invalid`, `404`, `409 version/review_locked/frame_not_reviewable` |
| `PATCH /annotations/{id}` | `{category_id?,bbox?,expected_version}`; co najmniej jedno pole zmiany | annotation | `400 category/bbox_invalid/empty_patch`, `404`, `409 version/review_locked` |
| `DELETE /annotations/{id}` | `expected_version` query | `204` | `404`, `409` |
| `POST /frames/{id}/review` | `{decision:accept|reject|reopen,expected_version}` | frame review snapshot | `400 no_annotations/bbox_invalid` z `details.annotation_ids`, `404`, `409 version/review_locked/frame_not_reviewable/invalid_review_transition` |
| `POST /exports` | `{run_id}` | `202 Export` | `400 no_accepted_frames`, `404`, `409 export_running` |
| `GET /exports/latest` | `run_id` query | najnowszy `Export` runu albo `null`; porządek `created_at DESC, id DESC` | `400/500` |
| `GET /exports/{id}` | — | status, `input_revision`, `error_code`, manifest, relative output | `404` |

`GET /dashboard` (F12, CF-07) jest wyłącznie do odczytu i zwraca `200` także dla
pustej instalacji — brak projektu, profilu i runu to poprawny stan początkowy,
nie błąd. Odpowiedź ma postać:

```json
{
  "project": {"id": "uuid", "name": "DatasetFactory"},
  "profile": {
    "id": "uuid",
    "name": "Gra",
    "source_width": 1920,
    "source_height": 1080,
    "version": 1,
    "reference_asset_url": "/api/v1/assets/references/uuid"
  },
  "run": "PipelineRun — ten sam obiekt co GET /runs/{id}, albo null",
  "frame_counts": {"pending": 12, "accepted": 30, "rejected": 3, "total": 45},
  "system": "HealthResponse — ten sam obiekt co GET /health"
}
```

`project`, `profile` i `run` są niezależnie nullowalne; `frame_counts` i `system`
są zawsze obecne. `project` nie zawiera `workspace_path` — żadna lokalna ścieżka
nie wychodzi w odpowiedzi. `profile` jest skrótem: regiony i klasy pozostają w
`GET /profiles/current`, dashboard nazywa profil i linkuje jego obraz
referencyjny.

`run` to dokładnie to samo DTO co `GET /runs/{id}`, renderowane tą samą funkcją,
więc `experimental`, `quality_gate` i `warning` docierają na pierwszy ekran w tej
samej postaci co na ekran runu. `system` to dokładnie `HealthResponse` z tego
samego `SystemStatusAccess`, którego używa `GET /health`; dashboard nie duplikuje
sond i nie zwraca `503` — krytyczna niedostępność jest widoczna w polach
`database`/`workspace` i w `system.status`.

Aktywny run to najnowszy run w statusie nonterminal, przy czym pierwszeństwo ma
posiadacz `workflow_slot`. Nonterminal wynika z `RUN_TRANSITIONS`: terminalny
jest ten status, z którego nie ma już przejścia, czyli wyłącznie `completed`.
`failed` i `cancelled` prowadzą z powrotem do `running` przez wznowienie, więc
run w tym stanie to niedokończona praca, którą dashboard ma pokazać wraz z
`error_code` (CF-07). To inna definicja niż frontendowy zbiór „terminalnych”
statusów pollingu z `FE-03`, który odpowiada na węższe pytanie, czy status
zmieni się bez akcji użytkownika.

`frame_counts` liczy wiersze `frames` aktywnego runu jednym zapytaniem
grupującym po `review_status`; `total` to suma trzech pól, czyli liczba
istniejących klatek, a nie planowane `run.total_frames`. Bez aktywnego runu
wszystkie cztery pola są zerami.

`POST /runs/{id}/complete` jest jawną, wersjonowaną granicą końca pracy nad
runem. Przejście jest dozwolone wyłącznie z `review_ready` i wymaga co najmniej
jednego rekordu eksportu tego runu w statusie `completed`; brak takiego eksportu
jest `409 invalid_transition`. Sprawdzenie statusu, `expected_version` i eksportu
oraz zapis `completed` odbywają się w jednej transakcji. Operacja zwiększa tylko
`pipeline_runs.version`: nie zmienia klatek, anotacji, eksportów ani
`review_revision`. Istniejąca definicja `NONTERMINAL_RUN_STATUSES` sprawia, że
zamknięty run znika z dashboardu bez osobnej ścieżki specjalnej.

`GET /exports/latest?run_id=` jest minimalnym, read-only mechanizmem odzyskania
stanu ekranu eksportu i nie jest historią eksportów. Statyczna trasa jest
deklarowana przed `GET /exports/{id}`. Dla runu bez eksportów zwraca `200 null`;
przy remisie czasu utworzenia nowszy rekord wyznacza malejące `id`. Frontend
utrwala wybrany eksport jako `export_id` w query URL: z tym parametrem najpierw
pobiera eksport, a dopiero z jego `run_id` pobiera run; bez parametru korzysta z
runu dashboardu i pojedynczego lookupu `latest`. Żaden z tych odczytów nie
uruchamia zastępczego `POST /exports`.

Geometria jest asymetryczna między żądaniem a odpowiedzią: `POST` i `PATCH`
przyjmują ją zagnieżdżoną w `bbox`, natomiast `AnnotationResponse` zwraca płaskie
`x`, `y`, `width`, `height`. `GET /frames/{id}` zwraca jedną listę `annotations`,
nie dwie — pochodzenie niesie `source` (`ocr` albo `manual`), a cykl życia
`status` (`proposed`, `accepted`, `deleted`). Klient filtruje, nie oczekuje
osobnych kolekcji.

Anotacja ręczna ma `source='manual'`, `confidence=NULL` i `observation_id=NULL`;
schemat już to przewiduje, więc F09 nie wymaga migracji. Geometria — nowa i
poprawiana — przechodzi przez jedną walidację `AnnotationReviewEngine`
sprawdzającą wyłącznie granice klatki; regiony HUD nie ograniczają boksu
ręcznego, bo źle wyznaczony region jest jedną z przyczyn braku odczytu.
`reopen` jest dozwolone tylko z `rejected` do `pending` i nie zmienia anotacji
ani ich statusów; `accepted` pozostaje terminalne, żeby snapshot eksportu był
trwały. Każda z tych mutacji podbija `version` agregatu oraz `review_revision`.

`GET /profiles/{profile_id}` jest read-only i zwraca ten sam pełny kontrakt
`GameProfile` co niepuste `GET /profiles/current`, łącznie z kategoriami i
regionami. Ekran weryfikacji najpierw pobiera run, a następnie profil dokładnie
po `run.profile_id`; `/profiles/current` pozostaje skrótem dla bieżącego profilu
używanym przez pozostałe przepływy. Statyczna trasa `/profiles/current` musi być
rozwiązywana przed dynamiczną `/{profile_id}`. Brak rekordu zwraca stabilne
`404 profile_not_found` i nigdy nie powoduje podstawienia bieżącego profilu.

Klatka z decyzją review jest zamrożona: `accepted` i `rejected` odpowiadają
`409 review_locked` na `POST /frames/{id}/annotations`, `PATCH` i `DELETE`.
Edycję odrzuconej klatki odblokowuje dopiero `reopen`. To zaostrza zachowanie
z TK-005-F1, gdzie blokowane było wyłącznie `accepted`, i jest częścią TK-007.

Ręczny boks wolno dodać wyłącznie do klatki na etapie `review_pending`, czyli po
zakończonym OCR; wcześniejsza próba dostaje `409 frame_not_reviewable`. Kod jest
`409`, bo to konflikt ze stanem agregatu, tak samo jak `review_locked`: to samo
żądanie przechodzi, gdy klatka dojdzie do `review_pending`. Bez tej bramki boks
narysowany przed pierwszym OCR kasowałby `commit_ocr`.

Ten sam etap jest wymagany dla decyzji `accept` i `reject`, bo `commit_ocr`
bezwarunkowo ustawia `review_status='pending'`: decyzja podjęta przed końcem OCR
zostałaby cicho cofnięta, gdy worker dojdzie do klatki. `reopen` nie podlega tej
bramce — wychodzi wyłącznie z `rejected`, a taka klatka ma OCR za sobą. Obie
bramki działają w engine i wewnątrz transakcji zapisu, żeby wyścig z workerem
nie prześlizgnął się na odczycie etapu z innej sesji.

Rekoncyliacja przy wznowieniu nigdy nie kasuje pracy człowieka. Unieważnienie
etapu OCR usuwa wyłącznie anotacje `source='ocr'`; `source='manual'` przetrwają
i współistnieją ze świeżo policzonymi propozycjami. Ta sama reguła obowiązuje
`commit_ocr`, który przepisuje wyłącznie własne propozycje etapu — inaczej worker
wznowiony po rekoncyliacji kasowałby boks, który rekoncyliacja właśnie ocaliła.
Guard z TK-005-F1 chroni klatki z decyzją review, ale `reopen` wraca do
`pending`, więc bez tej reguły ręczne boksy na klatce ponownie otwartej byłyby
kasowalne przez restart.

Zachowany ręczny boks może przestać się mieścić, gdy unieważnienie etapu
`sample` zmieni wymiary klatki. Nie kasujemy go: `accept` zwraca wtedy
`400 bbox_invalid` z `details.annotation_ids` wskazującymi wszystkie
niemieszczące się anotacje, żeby użytkownik poprawił je zamiast szukać po jednej.

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
- Eksport czyta `pipeline_runs.review_revision` razem ze snapshotem accepted
  frames w jednej transakcji i zapisuje go jako `input_revision`. Dokument COCO
  powstaje poza transakcją, na temp katalogu. Przed atomic rename krótka
  transakcja odczytuje `review_revision` ponownie; różnica kończy eksport jako
  `failed` z `export_revision_conflict`, kasuje temp i nie publikuje niczego.
  Użytkownik ponawia eksport świadomie; nie ma cichego retry ani wyniku
  mieszającego dwie rewizje.
- Manifest raportuje liczbę anotacji według `source` obiektem
  `annotation_sources` o dokładnie dwóch kluczach całkowitych, `ocr` i `manual`;
  oba są zawsze obecne, także gdy wynoszą zero, a ich suma równa się liczbie
  anotacji w dokumencie. Sam dokument COCO pozostaje standardowy i nie niesie
  tego pola. Licznik mierzy pochodzenie boksu, nie trafność OCR: anotacja
  odczytana przez OCR i poprawiona ręcznie zachowuje `source='ocr'`.
- Ukończony eksport jest niezmienny. Późniejszy `reopen` i ponowna akceptacja
  zmieniają wyłącznie stan bieżący; dataset leżący na dysku pozostaje wierną
  migawką swojej `input_revision` i nie jest wstecznie poprawiany. Nowy stan
  wymaga nowego eksportu z nowym `export_id`.
- Ten sam `input_revision` daje bajtowo identyczny dokument: sortowanie jest
  deterministyczne, a numeryczne ID `images`/`annotations` nadaje engine po
  posortowaniu, nigdy z UUID ani kolejności bazy.

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

`POST /profiles/reference-preview` staguje i publikuje ręcznie wskazany obraz,
a `POST /profiles/reference-frame` wycina klatkę z zapisanego materiału. Oba
zwracają `asset_id` i wymiary do rysowania regionów w UI bez tworzenia profilu.
`POST /profiles` może atomowo utrwalić podgląd przez `reference_asset_id` albo
zachować zgodną ścieżkę ręczną przez `reference_image_path`; podglądowy asset, jeśli użytkownik porzuci
formularz, staje się orphanem i ginie przy najbliższym startup reconciliation
— nie wymaga osobnego mechanizmu czyszczenia.

Podgląd nie tworzy rekordu `reference_assets`: po publikacji trafia do
procesowego rejestru `asset_id → {relpath, content_type}`. Odczyt
`GET /assets/references/{asset_id}` sprawdza najpierw trwały rekord w DB, a po
jego braku rejestr procesowy, nadal rozwiązując wyłącznie kontrolowany relpath
w workspace. Restart podczas wypełniania formularza unieważnia podgląd; plik
bez rekordu DB i bez nowego rejestru staje się orphanem usuwanym przez istniejący
startup reconciliation. To świadomy koszt dla lokalnej, jednoprokcesowej
aplikacji zamiast migracji schematu i nowego statusu trwałości.

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
- F01, F03–09, F11–16 mają pokrycie; F02/F10 pozostają jawnie poza v1.

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
