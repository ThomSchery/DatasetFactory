import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { Button } from "../Button";
import { CollapsibleGroup } from "../CollapsibleGroup";
import { Icon, type IconName } from "../Icon";
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
  /**
   * A short trailing fact about this option, shown at the end of its row.
   *
   * Deliberately not part of `label`: the filter matches labels, and a count
   * folded into the label would make typing `3` select classes by how many
   * annotations they happen to have. It is still inside the row, so it joins
   * the option's accessible name — which is the point, since the number is
   * information and not decoration.
   */
  detail?: string;
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
  /** Opens the choices on mount; the resting form-field state stays collapsed. */
  defaultOpen?: boolean;
  /** Groups that start collapsed (by group id). */
  initiallyCollapsedGroupIds?: readonly string[];
  /**
   * FE-022: the rows are always on screen, with no filter control above them —
   * the Figma class groups of the profile screen. Keyboard entry is the first
   * row; Tab leaves the list as before.
   */
  inline?: boolean;
  disabled?: boolean;
  /** Shown when the filter matches nothing. */
  emptyMessage: string;
  /**
   * Marks this control's own DOM as one a global outside-pointerdown handler
   * (e.g. a popover's close-on-outside-click) should treat as inside its own
   * UI, even when this control renders outside that handler's subtree.
   * Scoped to the control itself, not a container around it: a caller who
   * wraps this in other interactive chrome (buttons, forms) does not get
   * those exempted for free.
   */
  exemptFromOutsideClick?: boolean;
  /** Optional explicit action derived from the current filter value. */
  filterAction?: ReactNode;
  /** Label of the filter control; it is this component's own text input. */
  filterLabel: string;
  /** 24 px glyph at the start of the control (Figma `search-profile`). */
  icon?: IconName;
  /** Text in the empty filter; defaults to `filterLabel`. A single choice
   * passes the chosen name here, so the closed control shows the selection. */
  placeholder?: string;
  /** Maximum Unicode code points; unlike native maxLength, astral characters count once. */
  filterMaxCodePoints?: number;
  filterMaxLength?: number;
  /** Makes the filter controlled when recovery needs to reveal a server-selected option. */
  filterValue?: string;
  groups: readonly GroupedOptionGroup[];
  /** Accessible name of the collection. */
  label: string;
  /** `multiple` makes group rows tri-state toggles; `single` leaves them labels. */
  mode: "single" | "multiple";
  onChange: (selectedIds: readonly string[]) => void;
  /** `Enter` on a row, with the selection that keystroke implies. */
  onConfirm?: (selectedIds: readonly string[]) => void;
  onFilterChange?: (value: string) => void;
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
  groupId: string;
  id: string;
  kind: "option";
  option: GroupedOption;
}

/** The disclosure control of a group whose header is not a checkbox row. */
interface DisclosureRow {
  group: GroupedOptionGroup;
  id: string;
  kind: "disclosure";
}

type Row = GroupRow | OptionRow | DisclosureRow;

interface VisibleGroup {
  group: GroupedOptionGroup;
  /** Collapse gives way to the filter; this is the state actually rendered. */
  open: boolean;
  options: readonly GroupedOption[];
}

const GROUP_ROW_PREFIX = "group:";
const DISCLOSURE_ROW_PREFIX = "disclosure:";

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("pl");
}

function limitCodePoints(value: string, maximum: number | undefined): string {
  return maximum === undefined ? value : [...value].slice(0, maximum).join("");
}

function visibleGroups(
  groups: readonly GroupedOptionGroup[],
  query: string,
  collapsed: ReadonlySet<string>,
  keepEmpty = false,
): readonly VisibleGroup[] {
  const needle = normalize(query);
  const filtering = needle !== "";
  return groups
    .map((group) => {
      // A group whose own name matches keeps all of its options: filtering by
      // "Litery" is a request for the group, not for a class called "Litery".
      const options =
        !filtering || normalize(group.label).includes(needle)
          ? group.options
          : group.options.filter((option) => normalize(option.label).includes(needle));
      /*
       * Filtering wins over collapsing, always. Typing `8` while `Liczby` is
       * collapsed has to show `8` — collapsing is for browsing, and a search
       * that hides its own results is broken. The remembered state comes back
       * the moment the filter is cleared.
       */
      return { group, open: filtering || !collapsed.has(group.id), options };
    })
    // The inline class groups are always on screen, even with nothing in them
    // (FE-022); an empty group is still a place the operator can look for.
    .filter((entry) => keepEmpty || entry.options.length > 0);
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
  defaultOpen = false,
  initiallyCollapsedGroupIds,
  inline = false,
  disabled = false,
  emptyMessage,
  exemptFromOutsideClick,
  filterAction,
  filterLabel,
  filterMaxCodePoints,
  filterMaxLength,
  filterValue,
  groups,
  icon,
  label,
  mode,
  onChange,
  onConfirm,
  onFilterChange,
  placeholder,
  selectedIds,
}: GroupedOptionListProps) {
  const listId = useId();
  const combobox = mode === "single" && !inline;
  const [editing, setEditing] = useState(false);
  const [uncontrolledQuery, setUncontrolledQuery] = useState("");
  const [openState, setOpen] = useState(defaultOpen);
  const open = inline || openState;
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const [requestedActiveId, setRequestedActiveId] = useState<string | null>(null);
  // Groups open by default: the panel is autofocused and used under time
  // pressure, so nothing starts hidden. The state is per mount, which is why
  // every box opens its picker the same way.
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(
    () => new Set(initiallyCollapsedGroupIds ?? []),
  );
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const tagRefs = useRef(new Map<string, HTMLElement>());
  const filterRef = useRef<HTMLInputElement | null>(null);
  // Index the removed tag held, so focus can land on whichever tag slides
  // into that slot once the shorter list re-renders — or on the filter, if
  // none is left. A ref rather than state: it is read-and-cleared inside an
  // effect, never rendered.
  const pendingTagFocusIndex = useRef<number | null>(null);

  const query = combobox && !editing ? "" : filterValue ?? uncontrolledQuery;
  const filtering = normalize(query) !== "";
  const shown = useMemo(
    () => visibleGroups(groups, query, collapsedIds, inline),
    [collapsedIds, groups, inline, query],
  );
  const rows = useMemo(() => {
    const collected: Row[] = [];
    for (const { group, open, options } of shown) {
      if (mode === "multiple") {
        collected.push({
          group,
          id: `${GROUP_ROW_PREFIX}${group.id}`,
          kind: "group",
          visibleOptions: options,
        });
      } else if (!filtering) {
        // Filtering disables disclosure controls because it temporarily forces
        // matching groups open. Disabled buttons cannot receive focus, so they
        // must also leave the roving keyboard model while the filter is active.
        collected.push({
          group,
          id: `${DISCLOSURE_ROW_PREFIX}${group.id}`,
          kind: "disclosure",
        });
      }
      if (!open) {
        // A collapsed row is `hidden`, so it must not be in the roving
        // tabindex either — otherwise an arrow key lands on nothing.
        continue;
      }
      for (const option of options) {
        collected.push({ groupId: group.id, id: option.id, kind: "option", option });
      }
    }
    return collected;
  }, [filtering, mode, shown]);

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const optionsById = useMemo(
    () => new Map(groups.flatMap((group) => group.options).map((option) => [option.id, option])),
    [groups],
  );
  const selectedOptions = useMemo(
    () =>
      selectedIds.flatMap((id) => {
        const option = optionsById.get(id);
        return option === undefined ? [] : [option];
      }),
    [optionsById, selectedIds],
  );
  const rowIndexById = useMemo(
    () => new Map(rows.map((row, index) => [row.id, index])),
    [rows],
  );
  const defaultRow =
    mode === "single" ? (rows.find((row) => row.kind === "option") ?? rows[0]) : rows[0];
  // The active row is derived, not stored: filtering may remove the row the
  // user last touched, and the list still has to have exactly one tab stop.
  const activeId =
    rows.find((row) => row.id === requestedActiveId)?.id ?? defaultRow?.id ?? null;

  useEffect(() => {
    if (!open || pendingFocusId === null) {
      return;
    }
    rowRefs.current.get(pendingFocusId)?.focus();
    setPendingFocusId(null);
  }, [open, pendingFocusId]);

  // Removing a tag unmounts the button that held focus, which would
  // otherwise drop it to `body` and start the next Tab over from the top of
  // the document. The slot it left is filled by whichever tag follows, so
  // that slot is where focus goes; past the end of the shorter list, the
  // filter is the nearest stable control.
  useEffect(() => {
    const index = pendingTagFocusIndex.current;
    if (index === null) {
      return;
    }
    pendingTagFocusIndex.current = null;
    if (index >= 0 && index < selectedOptions.length) {
      tagRefs.current.get(selectedOptions[index].id)?.focus();
      return;
    }
    if (index >= 0 && selectedOptions.length > 0) {
      tagRefs.current.get(selectedOptions[selectedOptions.length - 1].id)?.focus();
      return;
    }
    filterRef.current?.focus();
  }, [selectedOptions]);

  function focusRow(id: string): void {
    setRequestedActiveId(id);
    rowRefs.current.get(id)?.focus();
  }

  function openAndFocusRow(id: string): void {
    setOpen(true);
    setRequestedActiveId(id);
    setPendingFocusId(id);
  }

  function groupIdOf(row: Row): string {
    return row.kind === "option" ? row.groupId : row.group.id;
  }

  function setCollapsed(groupId: string, collapsed: boolean): void {
    setCollapsedIds((current) => {
      if (current.has(groupId) === collapsed) {
        return current;
      }
      const next = new Set(current);
      if (collapsed) {
        next.add(groupId);
      } else {
        next.delete(groupId);
      }
      return next;
    });
  }

  function toggleCollapsed(groupId: string): void {
    setCollapsed(groupId, !collapsedIds.has(groupId));
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
    if (row.kind === "disclosure") {
      toggleCollapsed(row.group.id);
      return;
    }
    const next = row.kind === "group" ? toggleGroup(row) : toggleOption(row.option.id);
    onChange(next);
    if (combobox && onConfirm === undefined) {
      setEditing(false);
      setUncontrolledQuery("");
      setRequestedActiveId(null);
      filterRef.current?.focus();
      setOpen(false);
    }
    if (confirm) {
      onConfirm?.(next);
    }
  }

  function headerRowId(groupId: string): string {
    return `${mode === "multiple" ? GROUP_ROW_PREFIX : DISCLOSURE_ROW_PREFIX}${groupId}`;
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLElement>, index: number): void {
    const row = rows[index];
    if (row === undefined) {
      return;
    }
    if (row.kind === "disclosure" && (event.key === "Enter" || event.key === " ")) {
      // The row is a real button; its native activation already toggles the
      // group. Swallowing the key here would cancel the click it produces.
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
      /*
       * The tree convention, and the only way to reach the triangle without
       * adding a second tab stop to the list: Left collapses the group the
       * focused row belongs to, Right expands it. While a filter is active the
       * collapse state is suspended, so neither key has anything to do.
       */
      case "ArrowLeft": {
        if (filtering || disabled) {
          return;
        }
        event.preventDefault();
        const groupId = groupIdOf(row);
        setCollapsed(groupId, true);
        if (row.kind === "option") {
          // This row is about to be hidden; focus has to land on the header.
          focusRow(headerRowId(groupId));
        }
        return;
      }
      case "ArrowRight": {
        if (filtering || disabled) {
          return;
        }
        event.preventDefault();
        setCollapsed(groupIdOf(row), false);
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
    if (combobox) {
      const choices = rows.filter((row): row is OptionRow => row.kind === "option");
      const index = choices.findIndex((row) => row.id === requestedActiveId);
      if (event.key === "Escape" && open) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        setEditing(false);
        setRequestedActiveId(null);
        return;
      }
      if (event.altKey && event.key === "ArrowDown") {
        event.preventDefault();
        setOpen(true);
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || ((event.key === "Home" || event.key === "End") && index >= 0)) {
        event.preventDefault();
        setOpen(true);
        const next = event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1
          : index < 0 ? (event.key === "ArrowUp" ? choices.length - 1 : 0)
          : Math.max(0, Math.min(choices.length - 1, index + (event.key === "ArrowUp" ? -1 : 1)));
        const row = choices[next];
        setRequestedActiveId(row?.id ?? null);
        if (row !== undefined) rowRefs.current.get(row.id)?.scrollIntoView?.({ block: "nearest" });
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const row = open && index >= 0 ? choices[index] : normalize(query) !== "" && choices.length === 1 ? choices[0] : undefined;
        if (row !== undefined) activate(row, true);
        return;
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      // FE-008-FIX1: the filter enters the choices, not the disclosure chrome.
      // A collapsed-only list falls back to its first disclosure so the user
      // can still reopen it without reaching for the pointer.
      const first =
        mode === "single" ? (rows.find((row) => row.kind === "option") ?? rows[0]) : rows[0];
      if (first !== undefined) {
        openAndFocusRow(first.id);
      }
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const last = rows[rows.length - 1];
      if (last !== undefined) {
        openAndFocusRow(last.id);
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      // The filter owns focus, so an internal default active row is not a
      // visible user choice. Only a non-empty query with one visible result is
      // unambiguous enough to confirm from here. Keyboard users can always
      // enter the list with an arrow and confirm the visibly focused row.
      const optionRows = rows.filter((row): row is OptionRow => row.kind === "option");
      if (normalize(query) !== "" && optionRows.length === 1) {
        activate(optionRows[0], true);
      }
    }
  }

  return (
    <div
      className={inline ? "df-grouped-options df-grouped-options--inline" : "df-grouped-options"}
      data-open={open || undefined}
      data-outside-click-exempt={exemptFromOutsideClick || undefined}
      data-shortcut-scope="list"
      onBlur={(event) => {
        if (combobox && onConfirm === undefined && !event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setEditing(false);
          setRequestedActiveId(null);
        }
      }}
    >
      {inline ? null : (
      <div className="df-grouped-options__control">
        {mode === "multiple"
          ? selectedOptions.map((option, index) => (
              <span className="df-grouped-options__tag" key={option.id}>
                <span className="df-grouped-options__tag-label">{option.label}</span>
                <Button
                  aria-label={`Remove ${option.label} from the selection`}
                  className="df-grouped-options__tag-remove"
                  disabled={disabled}
                  onClick={() => {
                    pendingTagFocusIndex.current = index;
                    onChange(selectedIds.filter((id) => id !== option.id));
                  }}
                  ref={(element) => {
                    registerRow(tagRefs.current, option.id, element);
                  }}
                  size="sm"
                  variant="muted"
                >
                  <Icon name="close" />
                </Button>
              </span>
            ))
          : null}
        {icon === undefined ? null : (
          <span aria-hidden="true" className="df-grouped-options__icon">
            <Icon name={icon} />
          </span>
        )}
        <div className="df-grouped-options__filter">
          <TextField
            role={combobox ? "combobox" : undefined}
            aria-autocomplete={combobox ? "list" : undefined}
            aria-activedescendant={combobox && open && requestedActiveId !== null && rows.some((row) => row.kind === "option" && row.id === requestedActiveId) ? `${listId}-option-${requestedActiveId}` : undefined}
            aria-controls={listId}
            aria-expanded={open}
            autoComplete="off"
            autoFocus={autoFocus}
            disabled={disabled}
            label={filterLabel}
            maxLength={filterMaxLength}
            onChange={(event) => {
              setEditing(true);
              const nextQuery = limitCodePoints(event.target.value, filterMaxCodePoints);
              if (filterValue === undefined) {
                setUncontrolledQuery(nextQuery);
              }
              setOpen(true);
              setRequestedActiveId(null);
              onFilterChange?.(nextQuery);
            }}
            onClick={(event) => {
              if (combobox && !editing) event.currentTarget.select();
              setOpen(true);
            }}
            onFocus={(event) => {
              if (combobox) event.target.select();
              setOpen(true);
            }}
            onKeyDown={handleFilterKeyDown}
            placeholder={placeholder ?? filterLabel}
            ref={filterRef}
            value={combobox && !editing ? selectedOptions[0]?.label ?? "" : query}
          />
        </div>
        <div className="df-grouped-options__control-actions">
          {mode === "multiple" && selectedIds.length > 0 ? (
            <Button
              aria-label="Clear the selection"
              className="df-grouped-options__clear"
              disabled={disabled}
              onClick={() => {
                pendingTagFocusIndex.current = 0;
                onChange([]);
              }}
              size="sm"
              variant="muted"
            >
              <Icon name="close" />
            </Button>
          ) : null}
          <span aria-hidden="true" className="df-grouped-options__separator" />
          <Button
            aria-controls={listId}
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} list ${label}`}
            className="df-grouped-options__toggle"
            // Freezing a frame blocks writes, not reads: the counts this
            // list carries stay reachable even when nothing in it can be
            // changed, so the toggle does not inherit `disabled` from the
            // rest of the control.
            onClick={() => {
              setPendingFocusId(null);
              setOpen((current) => !current);
            }}
            size="sm"
            variant="muted"
          >
            {/* FE-025: Figma `Arrow - Down 2`, open or closed; `aria-expanded` carries the state. */}
            <Icon name="chevron-down" />
          </Button>
        </div>
      </div>
      )}
      <div
        aria-label={label}
        className="df-grouped-options__list"
        hidden={!open}
        id={listId}
        role={mode === "single" ? "listbox" : "group"}
      >
        {shown.map(({ group, open, options }) => {
          const groupRowId = `${GROUP_ROW_PREFIX}${group.id}`;
          const disclosureRowId = `${DISCLOSURE_ROW_PREFIX}${group.id}`;
          return (
            <CollapsibleGroup
              key={group.id}
              label={group.label}
              markerPlacement={inline ? "end" : "start"}
              onToggle={() => {
                toggleCollapsed(group.id);
              }}
              open={open}
              summary={
                mode === "multiple" ? (
                  <OptionRowElement
                    active={activeId === groupRowId}
                    ariaExpanded={open}
                    checked={checkedState(options, selected)}
                    disabled={disabled}
                    index={rowIndexById.get(groupRowId) ?? 0}
                    label={group.label}
                    mode={mode}
                    onActivate={activate}
                    onKeyDown={handleRowKeyDown}
                    refCallback={(element) => {
                      registerRow(rowRefs.current, groupRowId, element);
                    }}
                    row={{ group, id: groupRowId, kind: "group", visibleOptions: options }}
                  />
                ) : undefined
              }
              /*
               * `multiple`: the checkbox row beside the triangle is the row in
               * the roving tabindex and carries `aria-expanded`, so the triangle
               * is a mouse affordance only. `single` has no such row, so the
               * triangle *is* the group's row and rovers with the rest.
               */
              toggleDisabled={disabled || filtering}
              toggleKeyDown={
                mode === "single"
                  ? (event) => {
                      handleRowKeyDown(event, rowIndexById.get(disclosureRowId) ?? 0);
                    }
                  : undefined
              }
              toggleRef={
                mode === "single"
                  ? (element) => {
                      registerRow(rowRefs.current, disclosureRowId, element);
                    }
                  : undefined
              }
              toggleTabIndex={
                mode === "multiple" ? -1 : activeId === disclosureRowId && !disabled ? 0 : -1
              }
            >
              {options.map((option) => (
                <OptionRowElement
                  active={!combobox && activeId === option.id}
                  keyboardActive={combobox && requestedActiveId === option.id}
                  domId={`${listId}-option-${option.id}`}
                  checked={selected.has(option.id) ? "true" : "false"}
                  detail={option.detail}
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
                  row={{ groupId: group.id, id: option.id, kind: "option", option }}
                />
              ))}
            </CollapsibleGroup>
          );
        })}
      </div>
      {open && rows.length === 0 ? (
        <p className="df-grouped-options__empty" role="status">
          {emptyMessage}
        </p>
      ) : null}
      {open ? filterAction : null}
    </div>
  );
}

function registerRow(
  registry: Map<string, HTMLElement>,
  id: string,
  element: HTMLElement | null,
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
  domId?: string;
  keyboardActive?: boolean;
  active: boolean;
  /** Group rows announce their own collapse state; `Left`/`Right` change it. */
  ariaExpanded?: boolean;
  checked: "true" | "false" | "mixed";
  detail?: string;
  disabled: boolean;
  index: number;
  label: string;
  mode: "single" | "multiple";
  onActivate: (row: Row, confirm: boolean) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>, index: number) => void;
  refCallback: (element: HTMLDivElement | null) => void;
  row: Row;
}

function OptionRowElement({
  domId,
  keyboardActive,
  active,
  ariaExpanded,
  checked,
  detail,
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
      id={domId}
      data-keyboard-active={keyboardActive || undefined}
      aria-checked={single ? undefined : checked}
      aria-disabled={disabled || undefined}
      aria-expanded={ariaExpanded}
      aria-selected={single ? checked === "true" : undefined}
      className={classes}
      data-checked={checked}
      data-option-id={row.id}
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
      {single ? null : (
        // FE-025: the Figma checkboxes. A single choice carries no mark at all.
        <span aria-hidden="true" className="df-grouped-options__mark">
          <Icon name={checked === "true" ? "checkbox-selected" : checked === "mixed" ? "checkbox-mixed" : "checkbox-empty"} />
        </span>
      )}
      <span className="df-grouped-options__label">{label}</span>
      {detail === undefined ? null : (
        <>
          {/*
            An explicit space: both spans are inline, so the accessible name is
            their text concatenated, and without this the row would announce
            "Score3 wystąpienia".
          */}
          {" "}
          <span className="df-grouped-options__detail">{detail}</span>
        </>
      )}
    </div>
  );
}
