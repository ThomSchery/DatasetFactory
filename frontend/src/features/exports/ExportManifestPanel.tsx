import type { Export, ExportManifest } from "../../api";
import { DataList } from "../../components/common/DataList";
import { Notice } from "../../components/common/Notice";
import { Panel } from "../../components/common/Panel";
import { InlineError } from "../../components/common/UiStates";
import { formatExportedAt, safeWorkspaceRelativePath } from "./exportPresentation";

type RoboflowManifest = ExportManifest &
  Required<Pick<ExportManifest, "format" | "seed" | "split_ratios" | "splits">>;

function isRoboflowManifest(manifest: ExportManifest): manifest is RoboflowManifest {
  return (
    manifest.schema === "datasetfactory-roboflow-coco-export-v1" &&
    manifest.format === "roboflow_coco" &&
    manifest.seed !== undefined &&
    manifest.split_ratios !== undefined &&
    manifest.splits !== undefined
  );
}

export function ExportManifestPanel({ completedExport }: { completedExport: Export }) {
  const manifest = completedExport.manifest;
  const outputPath = safeWorkspaceRelativePath(completedExport.output_relpath);

  if (manifest === null || outputPath === null) {
    return (
      <Panel eyebrow="Manifest" title="Wynik eksportu">
        <InlineError message="Ukończony eksport nie zawiera bezpiecznej relatywnej ścieżki lub kompletnego manifestu. Odśwież status; jeżeli problem wraca, sprawdź logi backendu." />
      </Panel>
    );
  }

  if (isRoboflowManifest(manifest)) {
    const splitPaths = Object.fromEntries(
      (["train", "valid", "test"] as const).map((name) => [
        name,
        {
          annotations: safeWorkspaceRelativePath(manifest.splits[name].annotations),
          images: safeWorkspaceRelativePath(manifest.splits[name].images),
        },
      ]),
    ) as Record<"train" | "valid" | "test", { annotations: string | null; images: string | null }>;
    if (
      Object.values(splitPaths).some(
        (paths) => paths.annotations === null || paths.images === null,
      )
    ) {
      return (
        <Panel eyebrow="Manifest" title="Wynik eksportu Roboflow COCO">
          <InlineError message="Manifest zawiera niebezpieczną albo niepełną ścieżkę części datasetu. Odśwież status; jeżeli problem wraca, sprawdź logi backendu." />
        </Panel>
      );
    }

    return (
      <Panel
        description="Manifest opisuje niezmienną migawkę oraz deterministyczny podział po klatkach."
        eyebrow="Manifest"
        title="Wynik eksportu Roboflow COCO"
      >
        <div className="df-exports__manifest">
          <DataList
            items={[
              { label: "Schemat", value: manifest.schema },
              { label: "Run", value: manifest.run_id },
              { label: "Profil", value: manifest.profile_id },
              { label: "Rewizja wejścia", value: manifest.input_revision },
              { label: "Czas eksportu", value: formatExportedAt(manifest.exported_at) },
              { label: "Ziarno podziału", value: manifest.seed },
              {
                label: "Proporcje train / valid / test",
                value: `${String(manifest.split_ratios.train * 100)}% / ${String(manifest.split_ratios.valid * 100)}% / ${String(manifest.split_ratios.test * 100)}%`,
              },
              {
                hint: "Wartość pochodzi z API i jest względna wobec skonfigurowanego workspace.",
                label: "Ścieżka względem workspace",
                value: <code className="df-exports__path">{outputPath}</code>,
              },
            ]}
            layout="columns"
          />

          <section aria-labelledby="dataset-splits-title" className="df-exports__sources">
            <h3 id="dataset-splits-title">Podział datasetu</h3>
            <DataList
              items={(["train", "valid", "test"] as const).map((name) => ({
                hint: `${splitPaths[name].annotations} · obrazy: ${splitPaths[name].images}`,
                label: name,
                value: `${String(manifest.splits[name].frame_count)} klatek · ${String(manifest.splits[name].annotation_count)} anotacji`,
              }))}
              layout="columns"
            />
            <p>Każda klatka i wszystkie jej boksy występują dokładnie w jednej części.</p>
          </section>

          <Notice title="Niezmienna migawka">
            Ten eksport pozostaje migawką rewizji {manifest.input_revision}. Późniejsza zmiana
            klasy lub klatki nie aktualizuje paczki.
          </Notice>
        </div>
      </Panel>
    );
  }

  const annotationsPath = safeWorkspaceRelativePath(manifest.annotations ?? null);
  const imagesPath = safeWorkspaceRelativePath(manifest.images ?? null);
  if (annotationsPath === null || imagesPath === null) {
    return (
      <Panel eyebrow="Manifest" title="Wynik eksportu COCO">
        <InlineError message="Ukończony eksport nie zawiera bezpiecznej relatywnej ścieżki lub kompletnego manifestu. Odśwież status; jeżeli problem wraca, sprawdź logi backendu." />
      </Panel>
    );
  }

  return (
    <Panel
      description="Manifest opisuje niezmienną migawkę zaakceptowanych klatek i anotacji."
      eyebrow="Manifest"
      title="Wynik eksportu COCO"
    >
      <div className="df-exports__manifest">
        <DataList
          items={[
            { label: "Schemat", value: manifest.schema },
            { label: "Run", value: manifest.run_id },
            { label: "Profil", value: manifest.profile_id },
            { label: "Rewizja wejścia", value: manifest.input_revision },
            { label: "Czas eksportu", value: formatExportedAt(manifest.exported_at) },
            { label: "Plik anotacji", value: annotationsPath },
            { label: "Katalog obrazów", value: imagesPath },
            {
              hint: "Wartość pochodzi z API i jest względna wobec skonfigurowanego workspace.",
              label: "Ścieżka względem workspace",
              value: <code className="df-exports__path">{outputPath}</code>,
            },
          ]}
          layout="columns"
        />

        <section aria-labelledby="annotation-sources-title" className="df-exports__sources">
          <h3 id="annotation-sources-title">Pochodzenie anotacji</h3>
          <DataList
            items={[
              { label: "OCR", value: manifest.annotation_sources.ocr },
              { label: "manual", value: manifest.annotation_sources.manual },
            ]}
            layout="columns"
          />
          <p>To licznik pochodzenia boksów, nie ocena trafności OCR.</p>
        </section>

        <Notice title="Niezmienna migawka">
          Ten eksport pozostaje migawką rewizji {manifest.input_revision}. Późniejsza zmiana
          klatki nie aktualizuje tego wyniku — aktualny stan wymaga uruchomienia nowego eksportu.
        </Notice>
      </div>
    </Panel>
  );
}
