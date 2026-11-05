import { useId, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "../Button";
import { Icon, type IconName } from "../Icon";
import { TextField } from "../TextField";
import "./FilePickerTile.css";

/*
 * The Figma upload tile (FE-022): one large outlined area that opens the
 * system "open file" dialog on click, Enter or Space.
 *
 * DatasetFactory reads files in place, so it needs the absolute path, which a
 * browser never reveals — neither from `<input type="file">` nor from a drop.
 * The dialog is therefore opened by the local backend (`onPick`); this tile
 * only asks for it. A small "Enter path" button below the main control is the
 * fallback when no dialog can open, and a dropped file explains where to click
 * instead of silently doing nothing.
 *
 * The tile is two sibling controls rather than one button with a button
 * inside it, because nested interactive elements have no reliable semantics.
 */

export interface FilePickerTileProps {
  /** What the tile shows once something was chosen, e.g. the imported material. */
  children?: ReactNode;
  disabled?: boolean;
  /** Message of the last failure, rendered as an alert under the tile. */
  error?: string;
  icon: IconName;
  /** Visible label and accessible name of the main control. */
  label: string;
  /** Label of the typed-path field. */
  pathLabel: string;
  pathPlaceholder: string;
  /** Opens the system dialog; the consumer feeds the answer to `onPath`. */
  onPick: () => void;
  /** A path typed into the fallback field. */
  onPath: (path: string) => void;
  /** The dialog is open or the chosen file is being processed. */
  busy?: boolean;
  busyLabel?: string;
}

export function FilePickerTile({
  busy = false,
  busyLabel = "Working…",
  children,
  disabled = false,
  error,
  icon,
  label,
  onPath,
  onPick,
  pathLabel,
  pathPlaceholder,
}: FilePickerTileProps) {
  const [pathOpen, setPathOpen] = useState(false);
  const [path, setPath] = useState("");
  const [dropHint, setDropHint] = useState(false);
  const pathFormId = useId();

  function submitPath(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = path.trim();
    if (trimmed === "") {
      return;
    }
    onPath(trimmed);
  }

  return (
    <div
      className="df-file-tile"
      data-busy={busy || undefined}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => {
        // The browser does not say where a dropped file lives, and files are
        // read in place — so a drop can only point at the click.
        event.preventDefault();
        setDropHint(true);
      }}
    >
      <Button
        className="df-file-tile__pick"
        disabled={disabled}
        loading={busy}
        loadingLabel={busyLabel}
        onClick={() => {
          setDropHint(false);
          onPick();
        }}
        variant="muted"
      >
        <span className="df-file-tile__body">
          <Icon name={icon} />
          <span className="df-file-tile__label">{label}</span>
          {children === undefined ? null : <span className="df-file-tile__detail">{children}</span>}
        </span>
      </Button>

      <div className="df-file-tile__fallback">
        <Button
          aria-controls={pathFormId}
          aria-expanded={pathOpen}
          className="df-file-tile__path-toggle"
          disabled={disabled}
          onClick={() => {
            setPathOpen((open) => !open);
          }}
          variant="muted"
        >
          Enter path
        </Button>
        {dropHint ? (
          <p className="df-file-tile__hint" role="status">
            Click to choose a file
          </p>
        ) : null}
      </div>

      <form className="df-file-tile__path" hidden={!pathOpen} id={pathFormId} noValidate onSubmit={submitPath}>
        <TextField
          autoComplete="off"
          disabled={disabled || busy}
          label={pathLabel}
          onChange={(event) => {
            setPath(event.target.value);
          }}
          placeholder={pathPlaceholder}
          spellCheck={false}
          value={path}
        />
        <Button disabled={disabled || busy || path.trim() === ""} type="submit">
          Open
        </Button>
      </form>

      {error === undefined ? null : (
        <p className="df-file-tile__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
