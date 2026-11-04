import { useEffect, useId, useRef, type ReactNode } from "react";

import "./Dialog.css";

/*
 * A modal built on the platform's own `<dialog>`.
 *
 * `showModal()` is what gives this the three properties a hand-rolled overlay
 * keeps getting wrong: the rest of the page becomes inert, focus is trapped
 * inside, and Escape closes it. The only thing added on top is returning
 * focus to whatever opened it, which the element does not promise across
 * React re-renders.
 *
 * It is deliberately not dismissable by clicking the backdrop: the one modal
 * in the product asks for a name, and losing a typed name to a stray click
 * outside it is exactly the "cicha utrata pracy" the ticket forbids.
 */

export interface DialogProps {
  open: boolean;
  /** Called on Escape and on the dialog's own close control. */
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** The row of actions; the caller owns their order and their labels. */
  actions: ReactNode;
}

export function Dialog({ open, onClose, title, description, children, actions }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<Element | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (open) {
      openerRef.current = document.activeElement;
      if (!dialog.open) {
        dialog.showModal();
      }
      return;
    }
    if (dialog.open) {
      dialog.close();
    }
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener instanceof HTMLElement && opener.isConnected) {
      opener.focus();
    }
  }, [open]);

  return (
    <dialog
      aria-describedby={description === undefined ? undefined : descriptionId}
      aria-labelledby={titleId}
      className="df-dialog"
      hidden={!open}
      onCancel={(event) => {
        // Escape reaches the element directly; routing it through `onClose`
        // keeps the open state in one place instead of two.
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        )).filter((element) => element.getClientRects().length > 0);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (first === undefined || last === undefined) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      ref={dialogRef}
    >
      <div className="df-dialog__body">
        <h2 className="df-dialog__title" id={titleId}>
          {title}
        </h2>
        {description === undefined ? null : (
          <p className="df-dialog__description" id={descriptionId}>
            {description}
          </p>
        )}
        {children}
        <div className="df-dialog__actions">{actions}</div>
      </div>
    </dialog>
  );
}
