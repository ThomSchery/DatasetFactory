import type { BBox } from "../../api";

export type PopoverSide = "above" | "below" | "left" | "right";

export interface PopoverPlacement {
  left: number;
  side: PopoverSide;
  top: number;
}

interface Size {
  height: number;
  width: number;
}

interface Bounds extends Size {
  left: number;
  top: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function overlaps(anchor: Bounds, candidate: Bounds): boolean {
  return !(
    candidate.left + candidate.width <= anchor.left ||
    candidate.left >= anchor.left + anchor.width ||
    candidate.top + candidate.height <= anchor.top ||
    candidate.top >= anchor.top + anchor.height
  );
}

/** Chooses a side in rendered CSS pixels; source-space conversion happens once at the caller. */
export function resolvePopoverPlacement(
  anchor: Bounds,
  container: Size,
  popover: Size,
  gap: number,
): PopoverPlacement {
  const candidates: Array<PopoverPlacement & { bounds: Bounds }> = [
    {
      bounds: {
        height: popover.height,
        left: anchor.left + anchor.width + gap,
        top: clamp(anchor.top, 0, container.height - popover.height),
        width: popover.width,
      },
      left: anchor.left + anchor.width + gap,
      side: "right",
      top: clamp(anchor.top, 0, container.height - popover.height),
    },
    {
      bounds: {
        height: popover.height,
        left: anchor.left - gap - popover.width,
        top: clamp(anchor.top, 0, container.height - popover.height),
        width: popover.width,
      },
      left: anchor.left - gap - popover.width,
      side: "left",
      top: clamp(anchor.top, 0, container.height - popover.height),
    },
    {
      bounds: {
        height: popover.height,
        left: clamp(anchor.left, 0, container.width - popover.width),
        top: anchor.top + anchor.height + gap,
        width: popover.width,
      },
      left: clamp(anchor.left, 0, container.width - popover.width),
      side: "below",
      top: anchor.top + anchor.height + gap,
    },
    {
      bounds: {
        height: popover.height,
        left: clamp(anchor.left, 0, container.width - popover.width),
        top: anchor.top - gap - popover.height,
        width: popover.width,
      },
      left: clamp(anchor.left, 0, container.width - popover.width),
      side: "above",
      top: anchor.top - gap - popover.height,
    },
  ];

  const fitting = candidates.find(({ bounds }) =>
    bounds.left >= 0 &&
    bounds.top >= 0 &&
    bounds.left + bounds.width <= container.width &&
    bounds.top + bounds.height <= container.height &&
    !overlaps(anchor, bounds),
  );
  if (fitting !== undefined) {
    return { left: fitting.left, side: fitting.side, top: fitting.top };
  }

  const available: Array<{ side: PopoverSide; space: number }> = [
    { side: "right", space: container.width - anchor.left - anchor.width },
    { side: "left", space: anchor.left },
    { side: "below", space: container.height - anchor.top - anchor.height },
    { side: "above", space: anchor.top },
  ];
  available.sort((first, second) => second.space - first.space);
  const preferred = available[0]?.side ?? "right";
  const fallback = candidates.find((candidate) => candidate.side === preferred) ?? candidates[0];
  return {
    left: clamp(fallback.left, 0, container.width - popover.width),
    side: fallback.side,
    top: clamp(fallback.top, 0, container.height - popover.height),
  };
}

export function sourceBoxToRendered(
  bbox: BBox,
  source: Size,
  rendered: Size,
): Bounds {
  return {
    height: (bbox.height / source.height) * rendered.height,
    left: (bbox.x / source.width) * rendered.width,
    top: (bbox.y / source.height) * rendered.height,
    width: (bbox.width / source.width) * rendered.width,
  };
}
