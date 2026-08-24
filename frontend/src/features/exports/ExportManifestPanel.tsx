import type { Export } from "../../api";
import { DataList } from "../../components/common/DataList";
import { Notice } from "../../components/common/Notice";
import { Panel } from "../../components/common/Panel";
import { InlineError } from "../../components/common/UiStates";
import { formatExportedAt, safeWorkspaceRelativePath } from "./exportPresentation";

export function ExportManifestPanel({ completedExport }: { completedExport: Export }) {
  const manifest = completedExport.manifest;
  const outputPath = safeWorkspaceRelativePath(completedExport.output_relpath);
  const annotationsPath = safeWorkspaceRelativePath(manifest?.annotations ?? null);
  const imagesPath = safeWorkspaceRelativePath(manifest?.images ?? null);

  if (manifest === null || outputPath === null || annotationsPath === null || imagesPath === null) {
    return (
      <Panel eyebrow="Manifest" title="Wynik eksportu">
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
