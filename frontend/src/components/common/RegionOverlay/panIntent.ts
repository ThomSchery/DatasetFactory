/*
 * A pan starts in RegionOverlay but the annotation panel's outside-dismiss
 * listener sees that same native pointerdown later, on document. Recording the
 * event itself gives both components an exact, one-gesture contract without a
 * persistent DOM flag that could leak into the next interaction.
 */
const overlayPanPointerDownEvents = new WeakSet<Event>();

export function markOverlayPanPointerDown(event: Event): void {
  overlayPanPointerDownEvents.add(event);
}

export function isOverlayPanPointerDown(event: Event): boolean {
  return overlayPanPointerDownEvents.has(event);
}
