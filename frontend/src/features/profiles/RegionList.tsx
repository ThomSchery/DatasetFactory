import { Button } from "../../components/common/Button";
import { Empty } from "../../components/common/UiStates";
import type { RegionValue } from "./schemas";

/**
 * The textual twin of the drawing surface.
 *
 * Gate 3 asks that every v1 operation be reachable without hitting a rectangle
 * precisely. The overlay is keyboard-navigable on its own, but this list is
 * what makes a region *findable*: it names the geometry, and its controls are
 * ordinary buttons in the tab order.
 */
export function RegionList({
  disabled = false,
  onRemove,
  onSelect,
  regions,
  selectedId,
}: {
  disabled?: boolean;
  onRemove: (id: string) => void;
  onSelect: (id: string) => void;
  regions: readonly RegionValue[];
  selectedId: string | null;
}) {
  if (regions.length === 0) {
    return (
      <Empty
        description="Przeciągnij prostokąt na obrazie referencyjnym, żeby zaznaczyć fragment HUD, z którego OCR ma czytać."
        title="Nie ma jeszcze żadnego regionu"
      />
    );
  }

  return (
    <ul className="df-profiles__rows">
      {regions.map((region) => (
        <li
          className="df-profiles__row"
          data-selected={region.id === selectedId || undefined}
          key={region.id}
        >
          <div className="df-profiles__row-text">
            <span className="df-profiles__row-name">{region.name}</span>
            <span className="df-profiles__row-meta">
              x {region.x}, y {region.y}, {region.width} × {region.height} px
            </span>
          </div>
          <div className="df-profiles__row-actions">
            {/* The visible label is short because the column is narrow; the
                accessible name carries which region it acts on, so a screen
                reader user is not left with a column of identical buttons. */}
            <Button
              aria-label={`Zaznacz region ${region.name}`}
              disabled={disabled}
              onClick={() => {
                onSelect(region.id);
              }}
              size="sm"
              variant="muted"
            >
              Zaznacz
            </Button>
            <Button
              aria-label={`Usuń region ${region.name}`}
              disabled={disabled}
              onClick={() => {
                onRemove(region.id);
              }}
              size="sm"
              variant="secondary"
            >
              Usuń
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
