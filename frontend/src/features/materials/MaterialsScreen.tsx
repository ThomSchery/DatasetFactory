import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { createMaterial, describeApiError, invalidateFor } from "../../api";
import type { Material } from "../../api";
import { FilePickerTile } from "../../components/common/FilePickerTile";
import { useLocalFilePicker } from "../files";
import { materialImportSchema } from "./schemas";
import { materialSummary } from "./materialFormat";
import "./MaterialsScreen.css";

/**
 * Upload, as the Figma 360 frame draws it (FE-022): the Upload / Profile / Run
 * switch and one "Upload Video" tile.
 *
 * Click, Enter or Space opens the system dialog through the local backend; the
 * chosen path goes to the existing `POST /materials`, which reads the file in
 * place and never copies it. "Enter path" is the fallback when no dialog can
 * open. After the import the tile names the material — the API has no preview
 * image for a video, so it shows the name and parameters instead.
 *
 * The material list and the OCR warning left this screen: a material is
 * chosen in Run → Source file, and the OCR disclosure lives under ⋮.
 */
export function MaterialsScreen() {
  const queryClient = useQueryClient();
  const [imported, setImported] = useState<Material | null>(null);
  const [pathError, setPathError] = useState<string | undefined>(undefined);

  const importMaterial = useMutation({
    mutationFn: (localPath: string) => createMaterial({ local_path: localPath }),
    onSuccess: async (material) => {
      setImported(material);
      await invalidateFor(queryClient, { type: "material-imported" });
    },
  });

  function importPath(path: string) {
    const parsed = materialImportSchema.safeParse({ local_path: path });
    if (!parsed.success) {
      setPathError(parsed.error.issues[0]?.message);
      return;
    }
    setPathError(undefined);
    picker.reset();
    importMaterial.mutate(parsed.data.local_path);
  }

  const picker = useLocalFilePicker("video", importPath);
  const failure = importMaterial.isError ? describeApiError(importMaterial.error) : null;
  const error =
    pathError ??
    (failure !== null
      ? `${failure.message} ${failure.action} Code: ${failure.code}.`
      : picker.error !== null
        ? `${picker.error.message} ${picker.error.action}`
        : undefined);

  return (
    <div className="df-upload">
      <FilePickerTile
        busy={picker.picking || importMaterial.isPending}
        busyLabel={importMaterial.isPending ? "Importing the video…" : "Waiting for the file dialog…"}
        error={error}
        icon="video"
        label="Upload Video"
        onPath={importPath}
        onPick={picker.pick}
        pathLabel="Video file path"
        pathPlaceholder="D:\videos\match.mp4"
      >
        {imported === null ? undefined : materialSummary(imported)}
      </FilePickerTile>
    </div>
  );
}
