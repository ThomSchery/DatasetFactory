import { useId, type KeyboardEvent, type ReactNode, type Ref } from "react";

import { Button } from "../Button";
import "./CollapsibleGroup.css";

export interface CollapsibleGroupProps {
  children: ReactNode;
  /** Accessible name of the group and the subject of its disclosure control. */
  label: string;
  onToggle: () => void;
  open: boolean;
  /**
   * Header content beside the triangle. Defaults to the label as a heading; a
   * caller with its own row — a checkbox, a count — passes it here.
   */
  summary?: ReactNode;
  toggleDisabled?: boolean;
  toggleKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  toggleRef?: Ref<HTMLButtonElement>;
  /** Set to `-1` where the control belongs to a roving tabindex, not to `Tab`. */
  toggleTabIndex?: number;
}

/**
 * One named group of rows that a triangle expands and collapses.
 *
 * It exists so the two places FE-018 B splits classes in — the annotation
 * panel's picker and the game profile screen — share one disclosure rather than
 * growing two triangles, two `aria-expanded` and two sets of keys.
 *
 * The content stays in the DOM with `hidden` rather than being unmounted, so
 * `aria-controls` never points at an element that is not there, and a collapsed
 * row is out of the accessibility tree and out of the tab order at the same
 * time. Callers that run their own roving tabindex must also drop collapsed
 * rows from it — otherwise an arrow key lands on something nobody can see.
 */
export function CollapsibleGroup({
  children,
  label,
  onToggle,
  open,
  summary,
  toggleDisabled = false,
  toggleKeyDown,
  toggleRef,
  toggleTabIndex,
}: CollapsibleGroupProps) {
  const contentId = useId();

  return (
    <div aria-label={label} className="df-collapsible-group" role="group">
      <div className="df-collapsible-group__header">
        <Button
          aria-controls={contentId}
          aria-expanded={open}
          aria-label={`${open ? "Zwiń" : "Rozwiń"} grupę ${label}`}
          className="df-collapsible-group__toggle"
          disabled={toggleDisabled}
          onClick={onToggle}
          onKeyDown={toggleKeyDown}
          ref={toggleRef}
          size="sm"
          tabIndex={toggleTabIndex}
          variant="muted"
        >
          {/*
            A glyph, not a triangle assembled from borders: borders would need
            pixel values outside the token scale, while the glyph scales with
            `--font-size-xs` like the label it sits beside.
          */}
          <span aria-hidden="true" className="df-collapsible-group__marker">
            {open ? "▾" : "▸"}
          </span>
        </Button>
        {summary ?? <p className="df-collapsible-group__title">{label}</p>}
      </div>
      <div className="df-collapsible-group__content" hidden={!open} id={contentId}>
        {children}
      </div>
    </div>
  );
}
