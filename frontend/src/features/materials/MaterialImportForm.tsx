import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import { createMaterial, describeApiError, invalidateFor } from "../../api";
import type { Material } from "../../api";
import { Button } from "../../components/common/Button";
import { Panel } from "../../components/common/Panel";
import { TextField } from "../../components/common/TextField";
import { InlineError } from "../../components/common/UiStates";
import { materialImportSchema, type MaterialImportValues } from "./schemas";
import "./MaterialsScreen.css";

/**
 * `POST /materials` from a local path (CF-02.1). The backend does not accept an
 * upload and never copies the video, so this is a path field, not a file input.
 *
 * Backend validation is rendered through the central dictionary exactly as the
 * backend classified it. `503 ffprobe_unavailable` and `504 ffprobe_timeout`
 * arrive here alongside the `400` family and are not folded into a generic
 * "import failed" — they mean different repairs.
 */
export function MaterialImportForm({ onImported }: { onImported?: (material: Material) => void }) {
  const queryClient = useQueryClient();
  const form = useForm<MaterialImportValues>({
    resolver: zodResolver(materialImportSchema),
    defaultValues: { local_path: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: MaterialImportValues) => createMaterial({ local_path: values.local_path }),
    onSuccess: async (material) => {
      await invalidateFor(queryClient, { type: "material-imported" });
      form.reset();
      onImported?.(material);
    },
  });

  const failure = mutation.isError ? describeApiError(mutation.error) : null;

  return (
    <Panel
      description="Wskaż plik na dysku. DatasetFactory czyta go w miejscu i nie kopiuje do katalogu roboczego."
      eyebrow="Materiały"
      title="Import materiału"
    >
      <form
        noValidate
        onSubmit={form.handleSubmit((values) => {
          mutation.mutate(values);
        })}
      >
        <TextField
          {...form.register("local_path")}
          autoComplete="off"
          description="Bezwzględna ścieżka do pliku mp4/mov albo matroska/webm."
          error={form.formState.errors.local_path?.message}
          label="Ścieżka pliku wideo"
          placeholder="D:\wideo\mecz.mp4"
          spellCheck={false}
        />

        <div className="df-materials__actions">
          <Button
            loading={mutation.isPending}
            loadingLabel="Importowanie materiału…"
            type="submit"
          >
            Zaimportuj materiał
          </Button>
        </div>
      </form>

      {failure === null ? null : (
        <div className="df-materials__feedback">
          <InlineError message={`${failure.message} ${failure.action}`} />
          <p className="df-materials__code">
            Kod błędu: <code>{failure.code}</code>
          </p>
        </div>
      )}
    </Panel>
  );
}
