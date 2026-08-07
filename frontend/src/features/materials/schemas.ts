import { z } from "zod";

/*
 * Client-side validation only (FE-05). It exists to catch a mistake before a
 * round trip, never to replace the backend's own checks: Pydantic validates the
 * same contract independently and its verdict is the one that counts. Nothing
 * here reinterprets a backend error code — those go through `api/messages.ts`
 * verbatim.
 *
 * Deliberately weaker than the backend in one respect: this does not try to
 * decide whether a file exists, is a supported container, is short enough or
 * fits on disk. Only `ffprobe` can answer that, and guessing would produce a
 * second, quieter contract.
 */

/** Matches `C:\dir\file.mp4`, `\\server\share\file.mkv` and `/home/u/f.mov`. */
const ABSOLUTE_PATH = /^([a-zA-Z]:[\\/]|\\\\|\/)/;

export const materialImportSchema = z.object({
  local_path: z
    .string()
    .trim()
    .min(1, "Podaj ścieżkę do pliku wideo.")
    .regex(ABSOLUTE_PATH, "Ścieżka musi być bezwzględna, np. D:\\wideo\\mecz.mp4."),
});

export type MaterialImportValues = z.infer<typeof materialImportSchema>;

/** `interval_ms` mirrors `Field(default=1000, gt=0)` in `backend/app/api/runs.py`. */
export const DEFAULT_INTERVAL_MS = 1000;

export const runLaunchSchema = z.object({
  profile_id: z.string().min(1, "Wybierz profil gry."),
  video_id: z.string().min(1, "Wybierz materiał."),
  interval_ms: z.coerce
    .number<number>()
    .int("Interwał musi być liczbą całkowitą milisekund.")
    .positive("Interwał musi być większy od zera."),
});

export type RunLaunchValues = z.infer<typeof runLaunchSchema>;
