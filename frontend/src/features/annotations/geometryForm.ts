import type { Annotation, BBox } from "../../api";

export interface GeometryDraft {
  height: string;
  width: string;
  x: string;
  y: string;
}

export const EMPTY_GEOMETRY_DRAFT: GeometryDraft = {
  x: "",
  y: "",
  width: "",
  height: "",
};

export function geometryDraft(annotation: Annotation): GeometryDraft {
  return {
    x: String(annotation.x),
    y: String(annotation.y),
    width: String(annotation.width),
    height: String(annotation.height),
  };
}

export function parseGeometryDraft(
  draft: GeometryDraft,
  frameSize: { width: number; height: number },
): { bbox: BBox | null; error: string | null } {
  const values = [draft.x, draft.y, draft.width, draft.height].map(Number);
  if (values.some((value) => !Number.isInteger(value))) {
    return { bbox: null, error: "Współrzędne bbox muszą być liczbami całkowitymi." };
  }
  const [x, y, width, height] = values as [number, number, number, number];
  if (x < 0 || y < 0 || width <= 0 || height <= 0) {
    return { bbox: null, error: "Początek nie może być ujemny, a rozmiar musi być dodatni." };
  }
  if (x + width > frameSize.width || y + height > frameSize.height) {
    return { bbox: null, error: "Bbox musi mieścić się w granicach całej klatki." };
  }
  return { bbox: { x, y, width, height }, error: null };
}
