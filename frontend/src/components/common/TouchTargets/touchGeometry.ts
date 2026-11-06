/** Viewport rectangle math for the invisible coarse-pointer hit areas (FE-022). */
export interface Rect { left: number; right: number; top: number; bottom: number }

export const UNBOUNDED: Rect = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };

export const overlaps = (a: Rect, b: Rect) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** Keep the expansion inside the clip; the control's own box is never cut. */
export function clampToClip(hit: Rect, box: Rect, clip: Rect): void {
  hit.left = Math.max(hit.left, Math.min(clip.left, box.left));
  hit.top = Math.max(hit.top, Math.min(clip.top, box.top));
  hit.right = Math.min(hit.right, Math.max(clip.right, box.right));
  hit.bottom = Math.min(hit.bottom, Math.max(clip.bottom, box.bottom));
}

/** Retract the expansion from an interactive surface (FE-022 FIX2 N2). A
 * control painted over the surface keeps only its visible box on the sides
 * that face it; a control beside it stops at the surface's edge. */
export function avoid(hit: Rect, box: Rect, obstacle: Rect): void {
  if (!overlaps(hit, obstacle)) return;
  if (overlaps(box, obstacle)) {
    if (overlaps({ ...hit, right: box.left }, obstacle)) hit.left = box.left;
    if (overlaps({ ...hit, left: box.right }, obstacle)) hit.right = box.right;
    if (overlaps({ ...hit, bottom: box.top }, obstacle)) hit.top = box.top;
    if (overlaps({ ...hit, top: box.bottom }, obstacle)) hit.bottom = box.bottom;
    return;
  }
  const xGap = Math.max(obstacle.left - box.right, box.left - obstacle.right);
  const yGap = Math.max(obstacle.top - box.bottom, box.top - obstacle.bottom);
  if (xGap >= 0 && (yGap < 0 || xGap >= yGap)) {
    if (box.right <= obstacle.left) hit.right = Math.min(hit.right, obstacle.left);
    else hit.left = Math.max(hit.left, obstacle.right);
  } else if (box.bottom <= obstacle.top) hit.bottom = Math.min(hit.bottom, obstacle.top);
  else hit.top = Math.max(hit.top, obstacle.bottom);
}
