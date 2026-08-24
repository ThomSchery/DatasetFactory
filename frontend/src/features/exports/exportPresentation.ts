const WINDOWS_DRIVE_PATH = /^[a-zA-Z]:/;

/**
 * The API contract returns a workspace-relative path. Refuse to display a
 * value that would leak a host path if a future backend regressed that guard.
 */
export function safeWorkspaceRelativePath(value: string | null): string | null {
  if (value === null || value.trim() === "") {
    return null;
  }
  const normalized = value.replaceAll("\\", "/");
  if (
    normalized.startsWith("/") ||
    normalized.startsWith("//") ||
    WINDOWS_DRIVE_PATH.test(value) ||
    normalized.split("/").includes("..")
  ) {
    return null;
  }
  return normalized;
}

export function formatExportedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}
