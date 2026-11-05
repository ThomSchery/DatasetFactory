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
      <Panel title="Export result">
        <InlineError message="The finished export has no safe relative path or no complete manifest. Refresh the status; if the problem returns, check the backend logs." />
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
        <Panel title="Roboflow COCO export result">
          <InlineError message="The manifest holds an unsafe or incomplete dataset part path. Refresh the status; if the problem returns, check the backend logs." />
        </Panel>
      );
    }

    return (
      <Panel
        title="Roboflow COCO export result"
      >
        <div className="df-exports__manifest">
          <DataList
            items={[
              { label: "Schema", value: manifest.schema },
              { label: "Run", value: manifest.run_id },
              { label: "Profile", value: manifest.profile_id },
              { label: "Input revision", value: manifest.input_revision },
              { label: "Exported at", value: formatExportedAt(manifest.exported_at) },
              { label: "Split seed", value: manifest.seed },
              {
                label: "Train / valid / test ratios",
                value: `${String(manifest.split_ratios.train * 100)}% / ${String(manifest.split_ratios.valid * 100)}% / ${String(manifest.split_ratios.test * 100)}%`,
              },
              {
                hint: "From the API, relative to the configured workspace.",
                label: "Path relative to the workspace",
                value: <code className="df-exports__path">{outputPath}</code>,
              },
            ]}
            layout="columns"
          />

          <section aria-labelledby="dataset-splits-title" className="df-exports__sources">
            <h3 id="dataset-splits-title">Dataset split</h3>
            <DataList
              items={(["train", "valid", "test"] as const).map((name) => ({
                hint: `${splitPaths[name].annotations} · images: ${splitPaths[name].images}`,
                label: name,
                value: `${String(manifest.splits[name].frame_count)} frames · ${String(manifest.splits[name].annotation_count)} annotations`,
              }))}
              layout="columns"
            />
            <p>Every frame and all its boxes are in exactly one part.</p>
          </section>

          <Notice title="Immutable snapshot">
            This export stays a snapshot of revision {manifest.input_revision}. A later change
            to a class or a frame does not update the package.
          </Notice>
        </div>
      </Panel>
    );
  }

  const annotationsPath = safeWorkspaceRelativePath(manifest.annotations ?? null);
  const imagesPath = safeWorkspaceRelativePath(manifest.images ?? null);
  if (annotationsPath === null || imagesPath === null) {
    return (
      <Panel title="COCO export result">
        <InlineError message="The finished export has no safe relative path or no complete manifest. Refresh the status; if the problem returns, check the backend logs." />
      </Panel>
    );
  }

  return (
    <Panel
      title="COCO export result"
    >
      <div className="df-exports__manifest">
        <DataList
          items={[
            { label: "Schema", value: manifest.schema },
            { label: "Run", value: manifest.run_id },
            { label: "Profile", value: manifest.profile_id },
            { label: "Input revision", value: manifest.input_revision },
            { label: "Exported at", value: formatExportedAt(manifest.exported_at) },
            { label: "Annotations file", value: annotationsPath },
            { label: "Images folder", value: imagesPath },
            {
              hint: "From the API, relative to the configured workspace.",
              label: "Path relative to the workspace",
              value: <code className="df-exports__path">{outputPath}</code>,
            },
          ]}
          layout="columns"
        />

        <section aria-labelledby="annotation-sources-title" className="df-exports__sources">
          <h3 id="annotation-sources-title">Annotation sources</h3>
          <DataList
            items={[
              { label: "OCR", value: manifest.annotation_sources.ocr },
              { label: "manual", value: manifest.annotation_sources.manual },
            ]}
            layout="columns"
          />
          <p>A count of where boxes came from, not a measure of OCR accuracy.</p>
        </section>

        <Notice title="Immutable snapshot">
          This export stays a snapshot of revision {manifest.input_revision}. A later frame
          change does not update it — the current state needs a new export.
        </Notice>
      </div>
    </Panel>
  );
}
