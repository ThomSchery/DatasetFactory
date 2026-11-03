/*
 * The product's destinations and the five pipeline stages, in one place, so
 * the shell and the router cannot drift apart.
 *
 * FE-021 splits the list in two. The Figma document puts three destinations in
 * a switch at the top of the workspace — Upload, Profil, Run — and everything
 * else behind a menu. Both lists are navigation, both are rendered by the
 * shell, and `NAV_DESTINATIONS` stays the complete map: a destination that
 * exists must be reachable, whether or not the design drew a tab for it.
 */

export type NavDestinationIcon = "upload" | "profile" | "run";

export interface NavDestination {
  path: string;
  label: string;
  description: string;
  /** Match the path exactly rather than by prefix. */
  end?: boolean;
  icon?: NavDestinationIcon;
}

/** The three workspace steps the Figma switch shows, in its order. */
export const WORKSPACE_DESTINATIONS: readonly NavDestination[] = [
  {
    path: "/materials",
    label: "Upload",
    description: "Import wideo i lista materiałów",
    icon: "upload",
  },
  {
    path: "/profiles",
    label: "Profil",
    description: "Zrzut referencyjny, regiony HUD i klasy",
    icon: "profile",
  },
  {
    path: "/run",
    label: "Run",
    description: "Wybór materiału, profilu i interwału",
    icon: "run",
  },
];

/**
 * Every destination the application serves. The three above are repeated here
 * on purpose: this is the list the menu renders, and leaving them out would
 * make the menu an incomplete answer to "where can I go".
 */
export const NAV_DESTINATIONS: readonly NavDestination[] = [
  {
    path: "/",
    label: "Dashboard",
    description: "Aktywny run i stan systemu",
    end: true,
  },
  ...WORKSPACE_DESTINATIONS,
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
