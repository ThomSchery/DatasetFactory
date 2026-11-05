/*
 * The product's destinations in one place, so the shell and the router cannot
 * drift apart.
 *
 * FE-022 follows the Figma document of 2026-11-05: the four sections of the
 * workflow live in the side bar (`SECTION_DESTINATIONS`), the three workspace
 * steps keep the Upload / Profile / Run switch, and what neither shows is in
 * the ⋮ menu. The Dashboard is gone: `/` opens Upload, the active run lives on
 * Run and the frame counts live in the Review filters.
 */

import type { IconName } from "../components/common/Icon";

export interface NavDestination {
  path: string;
  label: string;
  description: string;
  /** Match the path exactly rather than by prefix. */
  end?: boolean;
  icon: IconName;
}

/** The four sections of the Figma side bar, in its order. */
export const SECTION_DESTINATIONS: readonly NavDestination[] = [
  {
    path: "/materials",
    label: "Upload",
    description: "Choose a video to import",
    icon: "upload",
  },
  {
    path: "/profiles",
    label: "Setup for scan",
    description: "Reference screenshot, HUD regions and classes",
    icon: "profile",
  },
  {
    path: "/run",
    label: "Review for scan",
    description: "Source file, profile and sample rate",
    icon: "scan",
  },
  {
    path: "/annotations",
    label: "Annotations",
    description: "Runs and frame review",
    icon: "edit",
  },
];

/** The three workspace steps the Figma switch shows, in its order. */
export const WORKSPACE_DESTINATIONS: readonly NavDestination[] = [
  { path: "/materials", label: "Upload", description: "Choose a video to import", icon: "upload" },
  {
    path: "/profiles",
    label: "Profile",
    description: "Reference screenshot, HUD regions and classes",
    icon: "profile",
  },
  { path: "/run", label: "Run", description: "Source file, profile and sample rate", icon: "run" },
];

/** Routes on which the switch is drawn (Figma: Upload, Profile and Run frames). */
export const WORKSPACE_SWITCH_PATHS: readonly string[] = [
  "/materials",
  "/profiles",
  "/profiles/new",
  "/run",
];

/**
 * Everything the side bar does not show, behind ⋮. With the sections above,
 * every route the application serves is reachable.
 */
export const MENU_DESTINATIONS: readonly NavDestination[] = [
  {
    path: "/exports",
    label: "Exports",
    description: "Generate the COCO dataset",
    icon: "folder",
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
  { label: "Sampling", description: "Frames at the chosen interval", inV1: true },
  { label: "HUD regions", description: "Crops of the profile regions", inV1: true },
  { label: "OCR", description: "Character proposals from Tesseract", inV1: true },
  { label: "SAM 3", description: "Segmentation — planned after v1", inV1: false },
  { label: "Review", description: "A human decision per frame", inV1: true },
];

export function annotationsPath(runId: string): string {
  return `/annotations/${encodeURIComponent(runId)}`;
}

/** Run Setup with a profile already chosen (Profile → Run, FE-022). */
export function runSetupPath(profileId?: string | null): string {
  return profileId === undefined || profileId === null
    ? "/run"
    : `/run?profile=${encodeURIComponent(profileId)}`;
}
