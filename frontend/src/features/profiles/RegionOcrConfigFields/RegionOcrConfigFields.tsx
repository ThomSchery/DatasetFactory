import { SelectField } from "../../../components/common/SelectField";
import { TextField } from "../../../components/common/TextField";
import { OCR_PAGE_SEGMENTATION_OPTIONS } from "../schemas";
import "./RegionOcrConfigFields.css";

export interface RegionOcrConfigFieldsProps {
  allowedChars: string;
  allowedCharsError?: string;
  characterClasses: readonly string[];
  disabled?: boolean;
  onAllowedCharsChange: (value: string) => void;
  onPageSegmentationModeChange: (value: number) => void;
  pageSegmentationMode: number;
  pageSegmentationModeError?: string;
}

export function RegionOcrConfigFields({
  allowedChars,
  allowedCharsError,
  characterClasses,
  disabled = false,
  onAllowedCharsChange,
  onPageSegmentationModeChange,
  pageSegmentationMode,
  pageSegmentationModeError,
}: RegionOcrConfigFieldsProps) {
  const classSummary = characterClasses.length === 0 ? "brak" : characterClasses.join("");

  return (
    <div className="df-region-ocr-fields">
      <TextField
        autoComplete="off"
        description={`Dozwolone są wyłącznie znakowe klasy profilu: ${classSummary}. Zakres nie rozszerzy się automatycznie po dodaniu klasy.`}
        disabled={disabled}
        error={allowedCharsError}
        label="Dozwolone znaki OCR"
        onChange={(event) => onAllowedCharsChange(event.target.value)}
        spellCheck={false}
        value={allowedChars}
      />
      <SelectField
        description="Wybierz sposób, w jaki Tesseract ma czytać układ regionu. Tryb 0 nie rozpoznaje znaków i dlatego nie jest dostępny."
        disabled={disabled}
        error={pageSegmentationModeError}
        label="Układ tekstu OCR"
        onChange={(event) => onPageSegmentationModeChange(Number(event.target.value))}
        options={OCR_PAGE_SEGMENTATION_OPTIONS}
        value={String(pageSegmentationMode)}
      />
    </div>
  );
}
