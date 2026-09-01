/*
 * The five FE-04 destinations and the five pipeline stages, in one place, so
 * the shell and the router cannot drift apart.
 */

export interface NavDestination {
  path: string;
  label: string;
  description: string;
  /** Match the path exactly rather than by prefix. */
  end?: boolean;
}

export const NAV_DESTINATIONS: readonly NavDestination[] = [
  {
    path: "/",
    label: "Dashboard",
    description: "Aktywny run i stan systemu",
    end: true,
  },
  {
    path: "/profiles",
    label: "Profil gry",
    description: "Obraz referencyjny, regiony HUD i klasy",
  },
  {
    path: "/materials",
    label: "Materiały",
    description: "Import wideo i uruchomienie runu",
  },
  {
    path: "/annotations",
    label: "Anotacje",
    description: "Weryfikacja klatek wybranego runu",
  },
  {
    path: "/exports",
    label: "Eksporty",
    description: "Generowanie datasetu COCO",
  },
];

export interface PipelineStage {
  label: string;
  description: string;
  /** `false` marks a stage that is explicitly not part of v1. */
  inV1: boolean;
}

/**
 * SAM 3 is listed because it is part of the planned pipeline, and marked as out
 * of v1 rather than faked: showing it as a working stage would promise output
 * the backend never produces (FE-11).
 */
export const PIPELINE_STAGES: readonly PipelineStage[] = [
  { label: "Próbkowanie", description: "Klatki co zadany interwał", inV1: true },
  { label: "Regiony HUD", description: "Crop regionów z profilu", inV1: true },
  { label: "OCR", description: "Propozycje znaków z Tesseractu", inV1: true },
  { label: "SAM 3", description: "Segmentacja — planowana po v1", inV1: false },
  { label: "Weryfikacja", description: "Decyzja człowieka na klatce", inV1: true },
];

export function annotationsPath(runId: string): string {
  return `/annotations/${encodeURIComponent(runId)}`;
}
