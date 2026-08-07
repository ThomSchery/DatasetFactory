import { useQuery } from "@tanstack/react-query";

import { describeApiError, listMaterials, queryKeys } from "../../api";
import type { Material } from "../../api";
import { Panel } from "../../components/common/Panel";
import { StatusBadge } from "../../components/common/StatusBadge";
import { Empty, FatalError, Loading } from "../../components/common/UiStates";
import "./MaterialsScreen.css";

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes)} min ${String(seconds).padStart(2, "0")} s`;
}

function formatSize(sizeBytes: number): string {
  const gigabytes = sizeBytes / 1024 ** 3;
  if (gigabytes >= 1) {
    return `${gigabytes.toFixed(2)} GB`;
  }
  return `${(sizeBytes / 1024 ** 2).toFixed(1)} MB`;
}

function MaterialRow({ material }: { material: Material }) {
  return (
    <li className="df-material-row">
      <div className="df-material-row__heading">
        <span className="df-material-row__name">{material.basename}</span>
        <StatusBadge
          srLabel="Plik źródłowy:"
          tone={material.available ? "success" : "error"}
        >
          {material.available ? "Dostępny" : "Brak pliku"}
        </StatusBadge>
      </div>
      <p className="df-material-row__meta">
        {String(material.width)}×{String(material.height)} · {formatDuration(material.duration_ms)}{" "}
        · {formatSize(material.size_bytes)}
      </p>
    </li>
  );
}

/** `GET /materials` with all four view states (FE-06). */
export function MaterialList() {
  const materials = useQuery({
    queryKey: queryKeys.materialList({ page: 1, page_size: 100 }),
    queryFn: ({ signal }) => listMaterials({ page: 1, page_size: 100 }, signal),
  });

  return (
    <Panel
      description="Materiały zaimportowane do tej instalacji."
      eyebrow="Materiały"
      title="Zaimportowane materiały"
    >
      {materials.isPending ? <Loading label="Ładowanie materiałów…" /> : null}

      {materials.isError ? (
        <FatalError
          description={(() => {
            const failure = describeApiError(materials.error);
            return `${failure.message} ${failure.action}`;
          })()}
          onRetry={() => void materials.refetch()}
          title="Nie udało się wczytać materiałów"
        />
      ) : null}

      {materials.isSuccess && materials.data.items.length === 0 ? (
        <Empty
          description="Zaimportuj pierwszy plik wideo, żeby móc uruchomić run."
          title="Brak materiałów"
        />
      ) : null}

      {materials.isSuccess && materials.data.items.length > 0 ? (
        <ul className="df-material-list">
          {materials.data.items.map((material) => (
            <MaterialRow key={material.id} material={material} />
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}
