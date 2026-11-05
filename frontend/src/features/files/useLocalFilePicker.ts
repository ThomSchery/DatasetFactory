import { useMutation } from "@tanstack/react-query";

import { describeApiError, pickLocalFile } from "../../api";
import type { ErrorPresentation, LocalFileKind } from "../../api";

/*
 * Opens the native "open file" dialog through the local backend (FE-022) and
 * hands the chosen absolute path on. Cancelling the dialog is a clean "no
 * choice": nothing is called and nothing is reported.
 */
export interface LocalFilePicker {
  error: ErrorPresentation | null;
  pick: () => void;
  picking: boolean;
  reset: () => void;
}

export function useLocalFilePicker(
  kind: LocalFileKind,
  onPicked: (path: string) => void,
): LocalFilePicker {
  const mutation = useMutation({
    mutationFn: () => pickLocalFile(kind),
    onSuccess: (picked) => {
      if (picked.path !== null) {
        onPicked(picked.path);
      }
    },
  });
  return {
    error: mutation.isError ? describeApiError(mutation.error) : null,
    pick: () => {
      mutation.mutate();
    },
    picking: mutation.isPending,
    reset: mutation.reset,
  };
}
