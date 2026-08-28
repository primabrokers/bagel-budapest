/**
 * "58 days to go" — the dashboard's headline stat, and every other place a deadline needs a
 * plain-English distance rather than a bare date.
 */

/** Midnight, local time, for a Date — strips the time-of-day so two moments on the same calendar
 *  day always compare equal regardless of what time either was captured at. */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days from `from` (default: now) to `target`, using date-only comparison so a `target` of
 * "today" is always 0 regardless of what time of day either `Date` carries — comparing raw
 * timestamps instead would make "today" read as -1 in the evening and clamp to 0 requires the
 * same day-boundary logic anyway, so it is done once, here.
 *
 * Negative for a target in the past.
 */
export function daysUntil(target: Date, from: Date = new Date()): number {
  const a = startOfDay(from);
  const b = startOfDay(target);
  // Rounded, not floored/truncated: a DST transition changes the number of real milliseconds
  // between two local midnights by up to an hour, which floor() could turn into an off-by-one.
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/**
 * The dashboard's countdown string. "Today" and "Tomorrow" are named specially because "0 days
 * to go" and "1 days to go" both read worse than the words a family actually uses; everything
 * else is "N days to go" or, once the date has passed, "N days ago".
 */
export function formatCountdown(target: Date, from: Date = new Date()): string {
  const days = daysUntil(target, from);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 0) return `${days} days to go`;
  return `${Math.abs(days)} days ago`;
}
