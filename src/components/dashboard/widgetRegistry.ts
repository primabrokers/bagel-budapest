/**
 * THE DASHBOARD WIDGET LIST, DECLARED ONCE — mirrors `components/layout/navModel.ts`'s own
 * "pure data, testable" pattern. `DashboardPage` and its "Edit layout" sheet both read from this
 * array rather than keeping their own list.
 */
export interface WidgetDefinition {
  /** Stable identity, persisted in `bm_dashboard_prefs.widget_order` — never renamed once shipped,
   *  or every family member's saved layout silently loses that widget (see `resolveWidgetOrder`). */
  key: string;
  label: string;
}

export const WIDGET_REGISTRY: WidgetDefinition[] = [
  { key: 'countdown', label: 'Countdown' },
  { key: 'eventCard', label: 'Event details' },
  { key: 'rsvpStats', label: 'RSVP stats' },
  { key: 'budgetSnapshot', label: 'Budget snapshot' },
  { key: 'upcomingPayments', label: 'Upcoming payments' },
  { key: 'outstandingTasks', label: 'Outstanding tasks' },
  { key: 'deadlines', label: 'Deadlines' },
  { key: 'activity', label: 'Recent activity' },
  { key: 'quickAdd', label: 'Quick add' },
];

export const DEFAULT_WIDGET_ORDER: string[] = WIDGET_REGISTRY.map((w) => w.key);

/**
 * Turns a persisted `widget_order` into a safe render order: drops any key the registry no
 * longer recognises (a widget retired since it was saved), de-duplicates, and appends any
 * registry key missing from the list (a widget added since, or a brand-new member with no
 * prefs row at all) in registry order — so a stale or absent save renders every current widget
 * exactly once rather than a gap. A typo'd key here would otherwise silently break a family
 * member's saved layout, which is why this is worth its own test alongside `navModel.test.ts`'s.
 */
export function resolveWidgetOrder(persisted: string[] | undefined): string[] {
  const validKeys = new Set(WIDGET_REGISTRY.map((w) => w.key));

  const seen = new Set<string>();
  const kept: string[] = [];
  for (const key of persisted ?? []) {
    if (validKeys.has(key) && !seen.has(key)) {
      seen.add(key);
      kept.push(key);
    }
  }

  const missing = DEFAULT_WIDGET_ORDER.filter((key) => !seen.has(key));
  const resolved = [...kept, ...missing];
  return resolved.length > 0 ? resolved : DEFAULT_WIDGET_ORDER;
}
