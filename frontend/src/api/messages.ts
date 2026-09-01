import { annotationIdsFromError, isApiError, isApiTransportError } from "./errors";
import type { ErrorDetails } from "./errors";
import type { ExportStatus, RunStatus } from "./types";

/*
 * Central translation of backend error codes into Polish copy plus a suggested
 * action (FE-001-F1 §Logika.6). No feature invents its own wording, and no
 * feature reinterprets a code into its own domain meaning
 * (`react-coding-standards.md` §3).
 *
 * Two sources feed this one dictionary:
 *   1. `error.code` from the TECH_PLAN §5 envelope,
 *   2. `error_code` on a finished export from `GET /exports/{id}` —
 *      `export_revision_conflict`, `export_source_missing` and
 *      `export_process_interrupted` are never envelope codes.
 * Both render identically because both go through `describeErrorCode`.
 */

export interface ErrorCopy {
  message: string;
  action: string;
}

const ERROR_COPY: Readonly<Record<string, ErrorCopy>> = {
  // --- optimistic concurrency and review gates (TK-005, TK-007) ---
  version_conflict: {
    message: "Dane zmieniły się w międzyczasie i Twoja wersja jest nieaktualna.",
    action: "Odśwież widok i wykonaj operację ponownie na aktualnym stanie.",
  },
  review_locked: {
    message: "Klatka ma już decyzję weryfikacji i jest zamrożona.",
    action:
      "Zaakceptowanej klatki nie da się zmienić. Odrzuconą odblokujesz decyzją „otwórz ponownie”.",
  },
  frame_not_reviewable: {
    message: "Klatka nie zakończyła jeszcze OCR, więc nie można jej weryfikować.",
    action: "Poczekaj, aż klatka osiągnie etap review_pending, i spróbuj ponownie.",
  },
  invalid_review_transition: {
    message: "Ta decyzja weryfikacji jest niedozwolona w bieżącym stanie klatki.",
    action: "Ponownie otworzyć można wyłącznie klatkę odrzuconą.",
  },
  bbox_invalid: {
    message: "Część boksów wykracza poza granice klatki.",
    action: "Popraw geometrię wskazanych boksów i powtórz operację.",
  },
  no_annotations: {
    message: "Klatka nie ma żadnej anotacji, więc nie da się jej zaakceptować.",
    action: "Dodaj przynajmniej jeden boks albo odrzuć klatkę.",
  },
  empty_patch: {
    message: "Żądanie zmiany anotacji nie zawiera żadnego pola do zmiany.",
    action: "Zmień klasę albo geometrię boksu przed zapisem.",
  },
  category_not_allowed: {
    message: "Wybrana klasa nie należy do profilu tego runu.",
    action: "Wybierz klasę zdefiniowaną w profilu gry.",
  },

  // --- run lifecycle ---
  active_run: {
    message: "Inny run jest już aktywny.",
    action: "Zatrzymaj lub dokończ bieżący run, zanim uruchomisz kolejny.",
  },
  invalid_transition: {
    message: "Ta operacja jest niedozwolona w bieżącym statusie runu.",
    action: "Odśwież status runu i wybierz operację dostępną dla tego stanu.",
  },
  source_missing: {
    message: "Plik źródłowy nie istnieje pod zapisaną ścieżką.",
    action: "Przywróć plik w tym samym miejscu albo zaimportuj materiał ponownie.",
  },
  source_changed: {
    message: "Plik źródłowy zmienił się od czasu importu.",
    action: "Zaimportuj materiał ponownie, żeby run pracował na spójnym pliku.",
  },
  invalid_interval: {
    message: "Interwał próbkowania jest poza dozwolonym zakresem.",
    action: "Podaj interwał większy od zera.",
  },
  profile_resolution_mismatch: {
    message: "Rozdzielczość materiału nie zgadza się z rozdzielczością profilu.",
    action: "Wybierz materiał o rozdzielczości profilu albo utwórz profil dla tej rozdzielczości.",
  },
  worker_unavailable: {
    message: "Worker przetwarzający run jest niedostępny.",
    action: "Sprawdź, czy backend działa, i spróbuj ponownie.",
  },
  ocr_provenance_unknown: {
    message:
      "Nie można uruchomić runu, ponieważ brakuje zweryfikowanego runtime’u lub modelu Tesseracta.",
    action:
      "Zainstaluj Tesseracta zgodnie z TD-015 i ustaw jego ścieżki oraz sumy SHA-256 w konfiguracji.",
  },
  ocr_provenance_mismatch: {
    message:
      "Nie można uruchomić runu, ponieważ runtime lub model Tesseracta nie zgadza się z przypiętą sumą SHA-256.",
    action:
      "Zainstaluj zweryfikowaną wersję Tesseracta zgodną z TD-015 albo popraw przypięte sumy w konfiguracji.",
  },
  ocr_configuration_invalid: {
    message: "Nie można uruchomić runu, ponieważ konfiguracja Tesseracta jest niepełna albo niepoprawna.",
    action:
      "Zainstaluj Tesseracta zgodnie z TD-015 i uzupełnij ścieżki, wersję oraz sumy SHA-256 w konfiguracji.",
  },

  // --- profiles ---
  profile_name_exists: {
    message: "Profil o tej nazwie już istnieje.",
    action: "Podaj inną nazwę profilu.",
  },
  regions_required: {
    message: "Profil musi mieć przynajmniej jeden region HUD.",
    action: "Zaznacz region na obrazie referencyjnym.",
  },
  categories_required: {
    message: "Profil musi mieć przynajmniej jedną klasę.",
    action: "Dodaj klasę bazową albo klasę specyficzną dla gry.",
  },
  region_out_of_bounds: {
    message: "Region wykracza poza obraz referencyjny.",
    action: "Zmieść region w granicach obrazu.",
  },
  unsupported_reference_image: {
    message: "Format obrazu referencyjnego nie jest wspierany.",
    action: "Wskaż obraz w obsługiwanym formacie.",
  },
  // Added in FE-001-F3. `POST /profiles` answers with every code
  // `DatasetDefinitionEngine.validate_profile`, `ReferenceImageProbe` and
  // `ProfileUseCases.create_profile` can raise, and each one names a different
  // repair — folding them into the generic fallback would hide which.
  reference_path_not_absolute: {
    message: "Ścieżka do obrazu referencyjnego musi być bezwzględna.",
    action: "Podaj pełną ścieżkę lokalną do pliku obrazu.",
  },
  invalid_reference_image: {
    message: "Wskazany plik nie jest poprawnym obrazem.",
    action: "Wskaż nieuszkodzony plik obrazu klatki referencyjnej.",
  },
  reference_image_unreadable: {
    message: "Nie udało się odczytać obrazu referencyjnego z dysku.",
    action: "Sprawdź uprawnienia do pliku i spróbuj ponownie.",
  },
  invalid_source_dimensions: {
    message: "Obraz referencyjny ma niepoprawne wymiary.",
    action: "Wskaż obraz o dodatniej szerokości i wysokości.",
  },
  profile_name_required: {
    message: "Profil musi mieć nazwę.",
    action: "Podaj nazwę profilu.",
  },
  profile_name_too_long: {
    message: "Nazwa profilu jest za długa.",
    action: "Skróć nazwę do 200 znaków.",
  },
  invalid_region_name: {
    message: "Nazwa regionu jest pusta albo za długa.",
    action: "Nazwij region tekstem o długości od 1 do 200 znaków.",
  },
  invalid_region_bbox: {
    message: "Region ma niepoprawną geometrię.",
    action: "Region musi mieć dodatnią szerokość i wysokość oraz nieujemny początek.",
  },
  duplicate_region_name: {
    message: "Dwa regiony mają tę samą nazwę.",
    action: "Nazwy regionów muszą być unikalne w profilu.",
  },
  invalid_category_name: {
    message: "Nazwa klasy jest pusta albo za długa.",
    action: "Nazwij klasę tekstem o długości od 1 do 200 znaków.",
  },
  invalid_category_kind: {
    message: "Rodzaj klasy nie jest rozpoznawany.",
    action: "Wybierz klasę bazową albo klasę specyficzną dla gry.",
  },
  invalid_character_category: {
    message: "Klasa bazowa nie należy do alfabetu OCR.",
    action: "Klasa bazowa to jeden znak ze zbioru A–Z, 0–9, „-” i „/”.",
  },
  duplicate_category_name: {
    message: "Dwie klasy mają tę samą nazwę.",
    action: "Nazwy klas muszą być unikalne w profilu.",
  },
  reference_asset_copy_failed: {
    message: "Nie udało się skopiować obrazu referencyjnego do katalogu roboczego.",
    action: "Sprawdź miejsce na dysku i uprawnienia katalogu roboczego, po czym powtórz zapis.",
  },
  reference_source_required: {
    message: "Nie wskazano źródła obrazu referencyjnego.",
    action: "Wybierz materiał i moment albo użyj bezwzględnej ścieżki do obrazu.",
  },
  invalid_frame_timestamp: {
    message: "Wybrany moment nie mieści się w czasie trwania materiału.",
    action: "Podaj moment od początku materiału do jego czasu końcowego.",
  },
  ffmpeg_unavailable: {
    message: "FFmpeg jest niedostępny, więc nie da się wyciąć klatki referencyjnej.",
    action: "Zainstaluj FFmpeg albo popraw jego ścieżkę w konfiguracji i spróbuj ponownie.",
  },
  frame_extraction_timeout: {
    message: "Wycinanie klatki referencyjnej przekroczyło limit czasu.",
    action: "Sprawdź materiał i spróbuj ponownie z innym momentem.",
  },
  reference_frame_extraction_failed: {
    message: "Nie udało się wyciąć poprawnej klatki referencyjnej z materiału.",
    action: "Wybierz inny moment albo użyj alternatywnej ścieżki do obrazu.",
  },
  reference_frame_resolution_mismatch: {
    message: "Wycięta klatka ma inne wymiary niż zaimportowany materiał.",
    action: "Zaimportuj materiał ponownie, a następnie ponów wybór klatki.",
  },
  profile_persistence_failed: {
    message: "Zapis profilu nie powiódł się i nic nie zostało utrwalone.",
    action: "Spróbuj ponownie; jeśli błąd wraca, zajrzyj do logów backendu.",
  },

  // --- materials ---
  unsupported_media: {
    message: "Format pliku wideo nie jest wspierany.",
    action: "Użyj pliku z rodziny mp4/mov albo matroska/webm.",
  },
  media_too_large: {
    message: "Plik wideo przekracza dopuszczalny rozmiar.",
    action: "Wskaż mniejszy plik albo przytnij materiał przed importem.",
  },
  media_too_long: {
    message: "Materiał jest dłuższy niż dopuszczalny czas.",
    action: "Skróć nagranie i zaimportuj je ponownie.",
  },
  disk_space: {
    message: "Na dysku brakuje miejsca na przetworzenie tego materiału.",
    action: "Zwolnij miejsce w katalogu roboczym i powtórz import.",
  },
  media_path_not_absolute: {
    message: "Ścieżka do pliku musi być bezwzględna.",
    action: "Podaj pełną ścieżkę lokalną do pliku wideo.",
  },
  // TECH_PLAN §5 lists only 400/404 for `POST /materials`; the backend also
  // answers 503 and 504 here (`backend/app/api/materials.py`).
  ffprobe_unavailable: {
    message: "FFmpeg/ffprobe jest niedostępny, więc nie da się sprawdzić materiału.",
    action: "Zainstaluj FFmpeg albo popraw jego ścieżkę w konfiguracji i spróbuj ponownie.",
  },
  ffprobe_timeout: {
    message: "Analiza materiału przez ffprobe przekroczyła limit czasu.",
    action: "Sprawdź, czy plik nie jest uszkodzony, i powtórz import.",
  },

  // --- exports ---
  export_running: {
    message: "Eksport tego runu już trwa.",
    action: "Poczekaj na jego zakończenie, zanim uruchomisz kolejny.",
  },
  no_accepted_frames: {
    message: "Run nie ma żadnej zaakceptowanej klatki do wyeksportowania.",
    action: "Zaakceptuj przynajmniej jedną klatkę w weryfikacji.",
  },
  export_revision_conflict: {
    message: "Stan weryfikacji zmienił się w trakcie eksportu, więc nic nie zostało zapisane.",
    action: "Uruchom eksport ponownie, żeby objął aktualną rewizję.",
  },
  export_source_missing: {
    message: "Podczas eksportu zabrakło pliku źródłowego klatki.",
    action: "Przywróć brakujące artefakty runu i powtórz eksport.",
  },
  export_process_interrupted: {
    message: "Proces eksportu został przerwany przed zakończeniem.",
    action: "Uruchom eksport ponownie; niedokończony wynik nie został opublikowany.",
  },
  export_unavailable: {
    message: "Usługa eksportu jest niedostępna.",
    action: "Sprawdź, czy backend działa, i spróbuj ponownie.",
  },

  // --- not found ---
  run_not_found: { message: "Nie znaleziono runu.", action: "Wróć do listy i wybierz istniejący run." },
  frame_not_found: { message: "Nie znaleziono klatki.", action: "Odśwież listę klatek." },
  frame_image_not_found: {
    message: "Nie znaleziono obrazu klatki.",
    action: "Sprawdź katalog roboczy albo uruchom run ponownie.",
  },
  annotation_not_found: {
    message: "Nie znaleziono anotacji.",
    action: "Odśwież klatkę — anotacja mogła zostać usunięta.",
  },
  profile_not_found: { message: "Nie znaleziono profilu.", action: "Wybierz istniejący profil gry." },
  video_not_found: { message: "Nie znaleziono materiału.", action: "Wybierz istniejący materiał." },
  export_not_found: { message: "Nie znaleziono eksportu.", action: "Wróć do listy eksportów." },
  asset_not_found: {
    message: "Nie znaleziono obrazu referencyjnego.",
    action: "Utwórz profil ponownie z dostępnym obrazem.",
  },
  route_not_found: {
    message: "Ten adres API nie istnieje.",
    action: "Zgłoś problem — frontend odpytał nieistniejący endpoint.",
  },

  // --- generic ---
  validation_error: {
    message: "Żądanie nie przeszło walidacji po stronie API.",
    action: "Popraw zaznaczone pola i wyślij formularz ponownie.",
  },
  dependency_unavailable: {
    message: "Krytyczna zależność lokalna jest niedostępna.",
    action: "Sprawdź stan bazy i katalogu roboczego na ekranie startowym.",
  },
  internal_error: {
    message: "Wystąpił nieoczekiwany błąd aplikacji.",
    action: "Spróbuj ponownie; jeśli błąd wraca, zajrzyj do logów backendu.",
  },
};

const FALLBACK_COPY: ErrorCopy = {
  message: "Operacja nie powiodła się.",
  action: "Spróbuj ponownie; jeśli błąd wraca, zajrzyj do logów backendu.",
};

const TRANSPORT_COPY: ErrorCopy = {
  message: "Nie udało się porozumieć z lokalnym API.",
  action: "Sprawdź, czy backend DatasetFactory działa, i spróbuj ponownie.",
};

/** Copy for a bare code, e.g. the `error_code` field of a failed export. */
export function describeErrorCode(code: string | null | undefined): ErrorCopy {
  if (code === null || code === undefined || code === "") {
    return FALLBACK_COPY;
  }
  return ERROR_COPY[code] ?? FALLBACK_COPY;
}

export function hasErrorCopy(code: string): boolean {
  return code in ERROR_COPY;
}

/*
 * Run status and stage copy lives here rather than in a feature for a
 * structural reason, not an editorial one: `src/test/architecture.test.ts`
 * keeps run status literals inside `src/api/`, so any table keyed by them has
 * to live in this layer. The tones are `StatusBadge` tones.
 */

export interface RunStatusCopy {
  label: string;
  tone: "neutral" | "brand" | "success" | "warning" | "error";
}

const RUN_STATUS_COPY: Readonly<Record<RunStatus, RunStatusCopy>> = {
  queued: { label: "W kolejce", tone: "neutral" },
  running: { label: "W toku", tone: "brand" },
  paused: { label: "Wstrzymany", tone: "warning" },
  review_ready: { label: "Gotowy do weryfikacji", tone: "brand" },
  completed: { label: "Ukończony", tone: "success" },
  failed: { label: "Nieudany", tone: "error" },
  cancelled: { label: "Anulowany", tone: "neutral" },
};

export function describeRunStatus(status: RunStatus): RunStatusCopy {
  return RUN_STATUS_COPY[status];
}

const EXPORT_STATUS_COPY: Readonly<Record<ExportStatus, RunStatusCopy>> = {
  running: { label: "W toku", tone: "brand" },
  completed: { label: "Ukończony", tone: "success" },
  failed: { label: "Nieudany", tone: "error" },
};

export function describeExportStatus(status: ExportStatus): RunStatusCopy {
  return EXPORT_STATUS_COPY[status];
}

/**
 * `PipelineRun.current_stage` is a free-form string the worker writes
 * (`backend/app/access/store/repositories/{runs,checkpoints}.py`), not a closed
 * enum in the contract. Known values get Polish copy; anything else is shown
 * verbatim rather than hidden, so a new worker stage stays visible.
 */
const RUN_STAGE_COPY: Readonly<Record<string, string>> = {
  sampling: "Próbkowanie",
  sample: "Próbkowanie",
  crop: "Regiony HUD",
  ocr: "OCR",
  review: "Weryfikacja",
};

export function describeRunStage(stage: string | null): string | null {
  if (stage === null || stage === "") {
    return null;
  }
  return RUN_STAGE_COPY[stage] ?? stage;
}

export interface ErrorPresentation extends ErrorCopy {
  code: string;
  /** Untouched `details` from the envelope; never flattened on the way here. */
  details: ErrorDetails;
  /** `details.annotation_ids` for `bbox_invalid`; empty otherwise. */
  annotationIds: string[];
  requestId: string | null;
}

/**
 * The one function a UI layer calls to render any thrown error. Preserves
 * `details` so a screen can act on it — the review screen highlights exactly
 * the boxes named by `annotationIds` rather than showing a generic message.
 */
export function describeApiError(error: unknown): ErrorPresentation {
  if (isApiError(error)) {
    return {
      ...describeErrorCode(error.code),
      code: error.code,
      details: error.details,
      annotationIds: annotationIdsFromError(error),
      requestId: error.requestId === "" ? null : error.requestId,
    };
  }
  if (isApiTransportError(error)) {
    return {
      ...TRANSPORT_COPY,
      code: "transport_error",
      details: {},
      annotationIds: [],
      requestId: null,
    };
  }
  return {
    ...FALLBACK_COPY,
    code: "unknown_error",
    details: {},
    annotationIds: [],
    requestId: null,
  };
}
