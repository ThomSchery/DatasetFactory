import { describeApiError, requiresOcrWarning, ocrProvenanceOf } from "../api";
import { Button } from "../components/common/Button";
import { DataList } from "../components/common/DataList";
import { Dialog } from "../components/common/Dialog";
import { StatusBadge } from "../components/common/StatusBadge";
import { FatalError, Loading } from "../components/common/UiStates";
import { useDashboard } from "../features/dashboard/dashboardQuery";

export interface OcrEngineDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * "OCR engine" from the ⋮ menu (FE-022).
 *
 * `docs/CONTEXT.md` (OCR revision after Gate 2) requires the interface to
 * disclose the engine id, its version and hashes, `quality_gate=failed` and
 * that the output needs full manual review. The Figma screens carry no
 * warning blocks, so the disclosure lives here, one click away on every
 * screen, and every OCR proposal stays "Pending" in Review until a person
 * accepts it.
 */
export function OcrEngineDialog({ open, onClose }: OcrEngineDialogProps) {
  const dashboard = useDashboard(open);
  const run = dashboard.data?.run ?? null;
  const provenance = ocrProvenanceOf(run);
  const needsReview = run === null || requiresOcrWarning(provenance);

  return (
    <Dialog
      actions={
        <Button onClick={onClose} variant="secondary">
          Close
        </Button>
      }
      description="OCR reads characters inside the profile's HUD regions and proposes annotations."
      onClose={onClose}
      open={open}
      title="OCR engine"
    >
      {dashboard.isPending ? <Loading label="Loading the OCR engine status…" /> : null}
      {dashboard.isError ? (
        <FatalError
          description={(() => {
            const failure = describeApiError(dashboard.error);
            return `${failure.message} ${failure.action}`;
          })()}
          onRetry={() => void dashboard.refetch()}
          title="The OCR engine status could not be loaded"
        />
      ) : null}
      {dashboard.isSuccess ? (
        <>
          {run === null ? (
            <DataList
              items={[
                { label: "Engine", value: "Tesseract" },
                { label: "Status", value: dashboard.data.system.tesseract.detail },
              ]}
            />
          ) : (
            <DataList
              items={[
                { label: "Engine id", value: run.ocr_engine },
                { label: "Version", value: run.ocr_engine_version },
                { label: "Runtime SHA-256", value: run.ocr_runtime_sha256 },
                { label: "Model SHA-256", value: run.ocr_model_sha256 },
                { label: "Quality gate", value: run.quality_gate },
                { label: "Experimental", value: run.experimental ? "yes" : "no" },
              ]}
            />
          )}
          {needsReview ? (
            <p className="df-ocr-engine__note">
              OCR output is a proposal, not an annotation. Every frame needs a full manual review
              before export — proposals stay Pending in Review until you accept them.
            </p>
          ) : null}
          {run !== null && run.warning !== "" ? (
            <p className="df-ocr-engine__note">{run.warning}</p>
          ) : null}
          {/* With the Dashboard gone (FE-022), the state of the local
              dependencies is reported here, beside the OCR engine. */}
          <h3 className="df-ocr-engine__subtitle">Local dependencies</h3>
          <ul className="df-ocr-engine__dependencies">
            {(
              [
                ["Tesseract", dashboard.data.system.tesseract],
                ["FFmpeg", dashboard.data.system.ffmpeg],
                ["Workspace", dashboard.data.system.workspace],
                ["Database", dashboard.data.system.database],
                ["GPU", dashboard.data.system.gpu],
              ] as const
            ).map(([name, status]) => (
              <li key={name}>
                <span>{name}</span>
                <StatusBadge srLabel={`${name}:`} tone={status.available ? "success" : status.critical ? "error" : "warning"}>
                  {status.available ? "Available" : "Unavailable"}
                </StatusBadge>
                <span className="df-ocr-engine__detail">{status.detail}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Dialog>
  );
}
