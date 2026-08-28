/**
 * The fixed set of standard Bar Mitzvah planning milestones, expressed as day-offsets from the
 * event date — agreed in the build plan (`docs/barmitzvah-planner-plan.md` §6 stage 8) rather
 * than anything a family configures. `GenerateMilestonesButton` is what turns this pure data into
 * real `bm_tasks` rows via `data/tasks/mutations.ts`'s `generateMilestoneTasks`; this module only
 * computes dates.
 */

export interface MilestoneDefinition {
  /** Also the `bm_tasks.title` a generated task is created with — `generateMilestoneTasks`
   *  matches on this exact string to decide whether a milestone has already been generated, so
   *  changing a title here breaks idempotency for events that already have the old one. */
  title: string;
  /** Days relative to the event date. Negative = before the event, per the plan's own numbers. */
  offsetDays: number;
}

export const STANDARD_MILESTONES: MilestoneDefinition[] = [
  { title: 'Book the venue', offsetDays: -270 },
  { title: 'Send save-the-dates', offsetDays: -120 },
  { title: 'Send invitations', offsetDays: -56 },
  { title: 'Send RSVP reminders', offsetDays: -28 },
  { title: 'Finalise the menu', offsetDays: -21 },
  { title: 'Confirm final numbers', offsetDays: -14 },
  { title: 'Finalise the seating plan', offsetDays: -7 },
  { title: 'Pay outstanding balances', offsetDays: -3 },
];

/** Every `STANDARD_MILESTONES` title, for callers (the deadlines dashboard widget) that need to
 *  recognise a `bm_tasks` row as "one of the generated milestones" without re-listing them. */
export const MILESTONE_TITLES: ReadonlySet<string> = new Set(STANDARD_MILESTONES.map((m) => m.title));

export interface MilestoneDueDate {
  title: string;
  dueDate: Date;
}

/** A local-midnight Date, `days` away from `date` — never touches UTC, so this is safe to call
 *  with a Date built any way (including `toLocalDateOnly`'s local-midnight construction) without
 *  the off-by-one a UTC round trip would risk for a UTC-negative timezone. */
function addDays(date: Date, days: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Every standard milestone's due date for one event, in the fixed order above (earliest offset —
 * i.e. furthest before the event — first).
 *
 * Deliberately does NOT clamp a past due date forward to today: a family opening this app after
 * "book the venue" was supposed to happen is not a bug to hide, it is the overdue signal the
 * outstanding-tasks/deadlines widgets exist to surface. Clamping would quietly erase exactly the
 * information a late-starting family most needs to see.
 */
export function computeMilestoneDueDates(eventDate: Date): MilestoneDueDate[] {
  return STANDARD_MILESTONES.map(({ title, offsetDays }) => ({
    title,
    dueDate: addDays(eventDate, offsetDays),
  }));
}

/** Formats a Date's local calendar day as the `YYYY-MM-DD` string `bm_tasks.due_date` (a
 *  Postgres `date` column) expects from a client. Never `.toISOString()`, which serialises in
 *  UTC and can roll the date backward by a day for any timezone west of Greenwich — the same
 *  local-midnight discipline `lib/format.ts`'s `toLocalDateOnly` applies in the other direction. */
export function toDateOnlyString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
