/**
 * The keyboard contract behind every roving-tabindex strip in this kit — `<Tabs>` (horizontal)
 * and `<Menu>` (vertical, plus type-ahead). Its own module, with no React import, so it is
 * testable without a DOM and so the components that use it stay export-components-only for fast
 * refresh.
 *
 * Roving tabindex means exactly ONE item in the strip is ever a tab stop (`tabIndex={0}`); every
 * other item is `tabIndex={-1}` and reachable only by arrowing from the one that has focus. That
 * is what lets a twelve-item tab strip or menu take a single Tab press to reach, rather than
 * twelve.
 */

export type Orientation = 'horizontal' | 'vertical';

/**
 * Returns the index the roving stop should move to, or `null` when the key is not one this
 * pattern owns (so Tab, Enter, Escape and plain typing keep their normal behaviour).
 *
 * Home/End jump to the first/last item regardless of orientation — every list widget a family
 * member has used elsewhere does this, so not doing it here would read as a dead key. The
 * direction keys wrap at both ends: arrowing right past the last tab reaches the first rather
 * than stopping, which is optional in the ARIA authoring practices but is what every other tab
 * strip and menu on the page already does.
 */
export function nextRovingIndex(
  current: number,
  count: number,
  key: string,
  orientation: Orientation = 'horizontal',
): number | null {
  if (count === 0) return null;
  // `current` is typically a findIndex result, so it is -1 when the active key is not in the
  // strip (a stale deep link, a tab hidden by a permission). Treat that as "arrow in from the
  // edge" rather than doing nothing.
  const from = current < 0 ? -1 : current;
  const forwardKey = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
  const backwardKey = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';

  switch (key) {
    case forwardKey:
      return from < 0 ? 0 : (from + 1) % count;
    case backwardKey:
      return from < 0 ? count - 1 : (from - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/**
 * Which index a roving-tabindex strip should treat as its ONE stop, given the currently selected
 * item. Exists so "exactly one stop, always" is computed in one place rather than re-derived
 * (and potentially re-derived inconsistently) by every consumer — `Tabs` calls this rather than
 * inlining `selectedIndex < 0 ? 0 : selectedIndex`.
 *
 * Falls back to the first item when nothing is selected (an invalid `value` prop, a deep link to
 * a hidden tab) so the strip never drops out of the page's tab order entirely.
 */
export function resolveStopIndex(selectedIndex: number, count: number): number {
  if (count <= 0) return 0;
  return selectedIndex >= 0 && selectedIndex < count ? selectedIndex : 0;
}

/**
 * Type-ahead for a `<Menu>`: pressing "d" moves to the next item whose label starts with "d",
 * cycling past the current selection so repeated presses of the same letter step through every
 * match rather than sticking on the first one. Returns `null` for a key that matches nothing (a
 * modifier, a symbol no label starts with).
 */
export function typeaheadIndex(labels: string[], current: number, key: string): number | null {
  if (key.length !== 1 || labels.length === 0) return null;
  const needle = key.toLowerCase();
  const count = labels.length;
  for (let step = 1; step <= count; step += 1) {
    const index = (current + step) % count;
    if (labels[index]?.toLowerCase().startsWith(needle)) return index;
  }
  return null;
}
