import { useMemo, useRef, useState, type KeyboardEvent } from "react";

import { TextField } from "../TextField";
import "./GroupedOptionList.css";

/**
 * Marks a subtree whose keystrokes belong to the list, not to the screen.
 *
 * A native `<select>` gave this away: a shortcut handler skipped it by tag
 * name. A custom listbox has to say so itself, and the screen has to ask.
 */
export const SHORTCUT_SCOPE_ATTRIBUTE = "data-shortcut-scope";

export interface GroupedOption {
  id: string;
  label: string;
}

export interface GroupedOptionGroup {
  id: string;
  label: string;
  options: readonly GroupedOption[];
}

export interface GroupedOptionListProps {
  /** Moves focus into the filter as the list appears. */
  autoFocus?: boolean;
  disabled?: boolean;
  /** Shown when the filter matches nothing. */
  emptyMessage: string;
  /** Label of the filter control; it is this component's own text input. */
  filterLabel: string;
  groups: readonly GroupedOptionGroup[];
  /** Accessible name of the collection. */
  label: string;
  /** `multiple` makes group rows tri-state toggles; `single` leaves them labels. */
  mode: "single" | "multiple";
  onChange: (selectedIds: readonly string[]) => void;
  /** `Enter` on a row, with the selection that keystroke implies. */
  onConfirm?: (selectedIds: readonly string[]) => void;
  selectedIds: readonly string[];
}

interface GroupRow {
  group: GroupedOptionGroup;
  id: string;
  kind: "group";
  /** Only the options the filter left visible; the checkbox acts on these. */
  visibleOptions: readonly GroupedOption[];
}

interface OptionRow {
  id: string;
  kind: "option";
  option: GroupedOption;
}

type Row = GroupRow | OptionRow;

interface VisibleGroup {
  group: GroupedOptionGroup;
  options: readonly GroupedOption[];
}

const GROUP_ROW_PREFIX = "group:";

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("pl");
}

function visibleGroups(
  groups: readonly GroupedOptionGroup[],
  query: string,
): readonly VisibleGroup[] {
  const needle = normalize(query);
  return groups
    .map((group) => {
      // A group whose own name matches keeps all of its options: filtering by
      // "Znaki" is a request for the group, not for a class called "Znaki".
      const options =
        needle === "" || normalize(group.label).includes(needle)
          ? group.options
          : group.options.filter((option) => normalize(option.label).includes(needle));
      return { group, options };
    })
    .filter((entry) => entry.options.length > 0);
}

/**
 * A two-level list of options with an inline filter.
 *
 * It replaces the native `<select>` in the two places a class is chosen, and
 * with it three things the native element gave away for free:
 *
 *  1. **Levels and checkboxes.** A group row toggles every option it shows in
 *     one click, and reports a partial selection as `aria-checked="mixed"`
 *     rather than as a shade of a colour.
 *  2. **Keyboard.** Roving tabindex over the visible rows, arrows to walk them,
 *     `Home`/`End` for the ends, `Enter`/`Space` to activate, and the filter
 *     field as the entry point in both directions.
 *  3. **Shortcut containment.** The root carries `data-shortcut-scope`, so a
 *     screen that binds bare letter keys can tell that this keystroke is not
 *     for it.
 *
 * Selection never follows focus. Walking the list with arrows chooses nothing,
 * which is what lets a freshly drawn box open with no class picked at all.
 */
export function GroupedOptionList({
  autoFocus = false,
  disabled = false,
  emptyMessage,
  filterLabel,
  groups,
  label,
  mode,
  onChange,
  onConfirm,
  selectedIds,
}: GroupedOptionListProps) {
  const [query, setQuery] = useState("");
  const [requestedActiveId, setRequestedActiveId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const filterRef = useRef<HTMLInputElement | null>(null);

  const shown = useMemo(() => visibleGroups(groups, query), [groups, query]);
  const rows = useMemo(() => {
    const collected: Row[] = [];
    for (const { group, options } of shown) {
      if (mode === "multiple") {
        collected.push({
          group,
          id: `${GROUP_ROW_PREFIX}${group.id}`,
          kind: "group",
          visibleOptions: options,
        });
      }
      for (const option of options) {
        collected.push({ id: option.id, kind: "option", option });
      }
    }
    return collected;
  }, [mode, shown]);

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const rowIndexById = useMemo(
    () => new Map(rows.map((row, index) => [row.id, index])),
    [rows],
  );
  // The active row is derived, not stored: filtering may remove the row the
  // user last touched, and the list still has to have exactly one tab stop.
  const activeId =
    rows.find((row) => row.id === requestedActiveId)?.id ?? rows[0]?.id ?? null;

  function focusRow(id: string): void {
    setRequestedActiveId(id);
    rowRefs.current.get(id)?.focus();
  }

  function toggleOption(optionId: string): readonly string[] {
    if (mode === "single") {
      return [optionId];
    }
    const next = new Set(selected);
    if (next.has(optionId)) {
      next.delete(optionId);
    } else {
      next.add(optionId);
    }
    return [...next];
  }

  function toggleGroup(row: GroupRow): readonly string[] {
    const next = new Set(selected);
    const everyVisibleSelected = row.visibleOptions.every((option) => next.has(option.id));
    for (const option of row.visibleOptions) {
      if (everyVisibleSelected) {
        next.delete(option.id);
      } else {
        next.add(option.id);
      }
    }
    return [...next];
  }

  function activate(row: Row, confirm: boolean): void {
    if (disabled) {
      return;
    }
    const next = row.kind === "group" ? toggleGroup(row) : toggleOption(row.option.id);
    onChange(next);
    if (confirm) {
      onConfirm?.(next);
    }
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLDivElement>, index: number): void {
    const row = rows[index];
    if (row === undefined) {
      return;
    }
    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        const next = rows[Math.min(index + 1, rows.length - 1)];
        if (next !== undefined) {
          focusRow(next.id);
        }
        return;
      }
      case "ArrowUp": {
        event.preventDefault();
        if (index === 0) {
          filterRef.current?.focus();
          return;
        }
        const previous = rows[index - 1];
        if (previous !== undefined) {
          focusRow(previous.id);
        }
        return;
      }
      case "Home": {
        event.preventDefault();
        const first = rows[0];
        if (first !== undefined) {
          focusRow(first.id);
        }
        return;
      }
      case "End": {
        event.preventDefault();
        const last = rows[rows.length - 1];
        if (last !== undefined) {
          focusRow(last.id);
        }
        return;
      }
      case "Enter":
        event.preventDefault();
        activate(row, true);
        return;
      case " ":
        event.preventDefault();
        activate(row, false);
        return;
      default:
    }
  }

  function handleFilterKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const first = rows[0];
      if (first !== undefined) {
        focusRow(first.id);
      }
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const last = rows[rows.length - 1];
      if (last !== undefined) {
        focusRow(last.id);
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const active = rows.find((row) => row.id === activeId);
      if (active !== undefined) {
        activate(active, true);
      }
    }
  }

  return (
    <div className="df-grouped-options" data-shortcut-scope="list">
      <TextField
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        label={filterLabel}
        onChange={(event) => {
          setQuery(event.target.value);
          setRequestedActiveId(null);
        }}
        onKeyDown={handleFilterKeyDown}
        ref={filterRef}
        value={query}
      />
      <div
        aria-label={label}
        className="df-grouped-options__list"
        role={mode === "single" ? "listbox" : "group"}
      >
        {shown.map(({ group, options }) => (
          <div
            aria-label={group.label}
            className="df-grouped-options__group"
            key={group.id}
            role="group"
          >
            {mode === "multiple" ? (
              <OptionRowElement
                active={activeId === `${GROUP_ROW_PREFIX}${group.id}`}
                checked={checkedState(options, selected)}
                disabled={disabled}
                index={rowIndexById.get(`${GROUP_ROW_PREFIX}${group.id}`) ?? 0}
                key={`${GROUP_ROW_PREFIX}${group.id}`}
                label={group.label}
                mode={mode}
                onActivate={activate}
                onKeyDown={handleRowKeyDown}
                refCallback={(element) => {
                  registerRow(rowRefs.current, `${GROUP_ROW_PREFIX}${group.id}`, element);
                }}
                row={{
                  group,
                  id: `${GROUP_ROW_PREFIX}${group.id}`,
                  kind: "group",
                  visibleOptions: options,
                }}
              />
            ) : (
              <p aria-hidden="true" className="df-grouped-options__group-title">
                {group.label}
              </p>
            )}
            {options.map((option) => (
              <OptionRowElement
                active={activeId === option.id}
                checked={selected.has(option.id) ? "true" : "false"}
                disabled={disabled}
                index={rowIndexById.get(option.id) ?? 0}
                key={option.id}
                label={option.label}
                mode={mode}
                onActivate={activate}
                onKeyDown={handleRowKeyDown}
                refCallback={(element) => {
                  registerRow(rowRefs.current, option.id, element);
                }}
                row={{ id: option.id, kind: "option", option }}
              />
            ))}
          </div>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="df-grouped-options__empty" role="status">
          {emptyMessage}
        </p>
      ) : null}
    </div>
  );
}

function registerRow(
  registry: Map<string, HTMLDivElement>,
  id: string,
  element: HTMLDivElement | null,
): void {
  if (element === null) {
    registry.delete(id);
  } else {
    registry.set(id, element);
  }
}

/** `mixed` is a state of its own, not a shade: a screen reader announces it. */
function checkedState(
  options: readonly GroupedOption[],
  selected: ReadonlySet<string>,
): "true" | "false" | "mixed" {
  const count = options.filter((option) => selected.has(option.id)).length;
  if (count === 0) {
    return "false";
  }
  return count === options.length ? "true" : "mixed";
}

interface OptionRowElementProps {
  active: boolean;
  checked: "true" | "false" | "mixed";
  disabled: boolean;
  index: number;
  label: string;
  mode: "single" | "multiple";
  onActivate: (row: Row, confirm: boolean) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>, index: number) => void;
  refCallback: (element: HTMLDivElement | null) => void;
  row: Row;
}

function OptionRowElement({
  active,
  checked,
  disabled,
  index,
  label,
  mode,
  onActivate,
  onKeyDown,
  refCallback,
  row,
}: OptionRowElementProps) {
  const single = mode === "single";
  const classes = [
    "df-grouped-options__row",
    `df-grouped-options__row--${row.kind}`,
    checked === "false" ? null : "df-grouped-options__row--checked",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      aria-checked={single ? undefined : checked}
      aria-disabled={disabled || undefined}
      aria-selected={single ? checked === "true" : undefined}
      className={classes}
      data-checked={checked}
      onClick={() => {
        onActivate(row, false);
      }}
      onKeyDown={(event) => {
        onKeyDown(event, index);
      }}
      ref={refCallback}
      role={single ? "option" : "checkbox"}
      tabIndex={active && !disabled ? 0 : -1}
    >
      <span aria-hidden="true" className="df-grouped-options__mark" />
      <span className="df-grouped-options__label">{label}</span>
    </div>
  );
}
