import type { KeyboardEvent, SyntheticEvent } from 'react';

/**
 * Keyboard activation for elements that are clickable but aren't a `<button>`.
 *
 * A `<div onClick>` is invisible to anyone not using a mouse: it takes no focus, Enter and Space
 * do nothing on it, and a screen reader announces it as a group rather than a control. A real
 * `<button>` is still the right answer where the markup allows it — this exists for the cases
 * where it doesn't, chiefly table rows and cards whose whole surface is the target and which
 * contain their own nested buttons (a `<button>` cannot legally contain another).
 *
 * Pair it with `role="button" tabIndex={0}`:
 *
 *   <div
 *     role="button"
 *     tabIndex={0}
 *     onClick={() => openGuest(row.id)}
 *     onKeyDown={activateOnKey(() => openGuest(row.id))}
 *   >
 *
 * The generic is inferred from the handler, so a handler written against a mouse event still
 * type-checks; it receives the keyboard event at runtime, and the only members these handlers
 * touch (`preventDefault`, `stopPropagation`, `currentTarget`) exist on both.
 */
export function activateOnKey<E extends SyntheticEvent>(
  // Optional because plenty of callers take an optional `onClick` prop and forward it straight
  // through; a row with no click handler simply has nothing to activate.
  handler: ((event: E) => void) | undefined,
) {
  return (event: KeyboardEvent<Element>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    // Only act when the row itself has focus. Without this, Enter on a nested button (or Space
    // in a nested input) would fire the row's action as well as the control's own.
    if (event.target !== event.currentTarget) return;
    // Space scrolls the page by default, and Enter submits an enclosing form.
    event.preventDefault();
    handler?.(event as unknown as E);
  };
}
