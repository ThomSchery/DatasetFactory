import { ocrProvenanceOf, requiresOcrWarning } from "../../api";
import type { PipelineRun } from "../../api";
import { Notice } from "../../components/common/Notice";

export interface OcrQualityWarningProps {
  run: PipelineRun | null | undefined;
}

/**
 * The persistent warning required by FE-001-F2 §Logika.5.
 *
 * Rendered on both the dashboard and the materials screen, from one component,
 * so the two cannot drift into saying different things. It has no dismiss
 * control and no local state: as long as the active run reports
 * `experimental=true` or a `quality_gate` other than `passed`, this stays on
 * screen. With Tesseract that is always (CF-03.4), which is the point — it is
 * the user's only signal that the proposals are proposals.
 *
 * The copy deliberately never says the annotations are correct or verified.
 */
export function OcrQualityWarning({ run }: OcrQualityWarningProps) {
  const provenance = ocrProvenanceOf(run);
  if (!requiresOcrWarning(provenance)) {
    return null;
  }

  return (
    <Notice title="Propozycje OCR wymagają sprawdzenia" tone="warning">
      <p>
        Silnik <strong>{run?.ocr_engine}</strong> jest oznaczony jako eksperymentalny albo nie
        przeszedł bramki jakości, więc jego odczyty są propozycjami, a nie gotowymi
        anotacjami. Zweryfikuj każdą klatkę przed eksportem.
      </p>
      {run?.warning === undefined || run.warning === "" ? null : (
        <p className="df-ocr-warning__detail">{run.warning}</p>
      )}
    </Notice>
  );
}
