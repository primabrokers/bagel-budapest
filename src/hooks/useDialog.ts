import { useEffect, useRef } from 'react';

/*
  Everything a modal dialog needs: Escape closes the top-most dialog only, the backdrop closes on
  a press that STARTED on the backdrop itself, focus moves into the panel on open and is trapped
  there while it's open, the page behind is scroll-locked, and focus returns to whatever opened
  the dialog once it closes.

  This is a deliberately smaller build than a system that has grown to handle every nested-dialog
  and dynamic-DOM edge case a large, years-old app eventually hits — no MutationObserver-driven
  inert frontier, no cross-document scoping, no live-region carve-out. Every real case THIS app's
  Sheet/ConfirmHost usage produces — a confirm opened from inside a sheet, an Escape while a toast
  is showing, a dialog closing and returning focus to its trigger — is covered by the stack,
  the ref-counted scroll lock and the focus trap below. Revisit if a later stage needs something
  this doesn't cover (a genuinely non-modal popover living alongside a modal dialog, say).
*/

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Escape closes only the TOP dialog — without this, dismissing a confirm opened over an edit
 *  sheet would close both, and the edit would be gone too. */
const stack: symbol[] = [];

/** Ref-counted so a dialog opened from inside another dialog doesn't let scrolling resume the
 *  moment the inner one closes while the outer is still up. */
let scrollLockCount = 0;
let previousBodyOverflow = '';

function acquireScrollLock(): void {
  if (scrollLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLockCount += 1;
}

function releaseScrollLock(): void {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) document.body.style.overflow = previousBodyOverflow;
}

export interface UseDialogOptions {
  /**
   * Pass `false` while the dialog is closed. A component that renders `<Sheet open={someState}>`
   * still calls this hook every render — hooks cannot be conditional — and without this flag a
   * CLOSED sheet would still push onto the Escape stack and lock body scroll for as long as it
   * stayed mounted, which most callers do permanently.
   */
  enabled?: boolean;
}

export interface DialogHandles {
  panelRef: React.RefObject<HTMLDivElement>;
  backdropProps: {
    onPointerDown: (e: React.PointerEvent) => void;
  };
}

/**
 * @param onClose called when the user dismisses via Escape or the backdrop. Kept in a ref, so it
 *   does not need to be a stable function identity and may close over current state.
 */
export function useDialog(onClose: () => void, options: UseDialogOptions = {}): DialogHandles {
  const { enabled = true } = options;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;

    const token = Symbol('dialog');
    stack.push(token);
    const isTop = () => stack[stack.length - 1] === token;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    acquireScrollLock();

    // Initial focus: the first `[data-autofocus]` element, else the first focusable element,
    // else the panel itself — but only when the caller hasn't already put focus somewhere
    // inside the panel (a field it wants selected, say).
    const panel = panelRef.current;
    if (panel) {
      if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
      if (!(document.activeElement && panel.contains(document.activeElement))) {
        const target =
          panel.querySelector<HTMLElement>('[data-autofocus]') ??
          panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
          panel;
        target.focus();
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (!isTop()) return;
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !isTop()) return;
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    // Capture phase so the top dialog's Escape/Tab wins even when focus is on an element that
    // would otherwise handle the key itself.
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const i = stack.indexOf(token);
      if (i !== -1) stack.splice(i, 1);
      releaseScrollLock();
      // Restore focus to whatever opened the dialog, unless it's gone (e.g. the row it was on
      // got removed by the very action that closed the dialog).
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
  }, [enabled]);

  return {
    panelRef,
    backdropProps: {
      // Pointer DOWN, and only when the press started on the backdrop itself — not `onClick`,
      // which also fires when a text selection begun inside the panel happens to be released
      // over the dim area outside it, closing a dialog nobody meant to dismiss.
      onPointerDown: (e) => {
        if (e.target === e.currentTarget) onCloseRef.current();
      },
    },
  };
}
