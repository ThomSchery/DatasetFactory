import type { Material } from "../../api";

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes)}:${String(seconds).padStart(2, "0")}`;
}

export function formatSize(sizeBytes: number): string {
  const gigabytes = sizeBytes / 1024 ** 3;
  if (gigabytes >= 1) {
    return `${gigabytes.toFixed(2)} GB`;
  }
  return `${(sizeBytes / 1024 ** 2).toFixed(1)} MB`;
}

/** One line naming a material and its parameters, e.g. in the upload tile. */
export function materialSummary(material: Material): string {
  return `${material.basename} · ${String(material.width)}×${String(material.height)} · ${formatDuration(material.duration_ms)} · ${formatSize(material.size_bytes)}`;
}
