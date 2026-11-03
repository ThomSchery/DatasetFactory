import { OcrQualityWarning } from "../dashboard/OcrQualityWarning";
import { useDashboard } from "../dashboard/dashboardQuery";
import { MaterialImportForm } from "./MaterialImportForm";
import { MaterialList } from "./MaterialList";
import "./MaterialsScreen.css";

/**
 * Upload: bringing a video into the workspace and seeing what is already there.
 *
 * FE-021 split CF-02 in two along the line the Figma document draws. Starting
 * a run moved to `RunSetupScreen`, which is what the `Run` step of the switch
 * opens; this screen stops at the material list. Nothing was removed — the
 * same forms run, one step apart.
 *
 * The OCR warning stays here even though the run does not: it has to be
 * visible wherever the operator works, and a screen that quietly drops it is
 * exactly how an `experimental` engine gets forgotten (FE-06).
 */
export function MaterialsScreen() {
  const dashboard = useDashboard();

  return (
    <div className="df-materials">
      <OcrQualityWarning run={dashboard.data?.run} />

      <MaterialImportForm />

      <MaterialList />
    </div>
  );
}
