/**
 * Notification rules, computed client-side — per CLAUDE.md, nothing here is stored; only
 * READ-STATE persists (`bm_notification_reads`, see `data/notifications/`). Every rule below is a
 * pure function over already-fetched domain rows (plus the event's own date, where "near the
 * event" matters), so this module has no Supabase import and is fully unit-testable.
 *
 * Severity mirrors `lib/seating/warnings.ts`'s own vocabulary and maps the same way onto this
 * app's `Badge` tones in the UI: 'error' -> danger, 'warning' -> warning, 'info' -> info.
 */
import { daysUntil } from '../countdown';
import { formatCurrency, formatDate, toLocalDateOnly } from '../format';
import { duePaymentsSoon, overduePayments } from '../budget/maths';
import { checkUnseatedAttending, guestDisplayName } from '../seating/warnings';
import type { ExpenseWithPayments } from '../../data/budget/types';
import type { VendorRow, VendorStatus } from '../../data/vendors/types';
import type { HouseholdWithGuests } from '../../data/guests/types';
import type { InvitationEventRow } from '../../data/invitations/types';
import type { SeatingPlanWithObjects } from '../../data/seating/types';
import type { TaskRow } from '../../data/tasks/types';
import type { FunctionRow } from '../../data/event/types';
import type { MenuRow } from '../../data/menus/types';

export type NotificationSeverity = 'error' | 'warning' | 'info';

export interface Notification {
  /**
   * STABLE across recomputations — this is what `bm_notification_reads.notification_key`
   * matches against to know whether a specific notification has been dismissed. Always
   * `<rule-kind>:<row-id>`, e.g. `payment-overdue:${paymentId}`.
   */
  key: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  /** Where clicking this notification navigates to. */
  path: string;
  /**
   * ISO date/time this notification is anchored to (a due date, an invitation's send date…),
   * used only to order notifications WITHIN a severity band — `combineNotificationRules` sorts on
   * it, nothing renders it directly. Omitted for a rule with no natural date of its own (e.g. a
   * vendor missing a document), which sorts after every dated notification in the same band.
   */
  at?: string;
}

const SEVERITY_RANK: Record<NotificationSeverity, number> = { error: 0, warning: 1, info: 2 };

/* -------------------------------------------------------------------------------------------
   Payments due soon / overdue
------------------------------------------------------------------------------------------- */

function expenseLabel(expense: ExpenseWithPayments): string {
  return expense.description ? `${expense.category} — ${expense.description}` : expense.category;
}

/** `duePaymentsSoon`/`overduePayments` (`lib/budget/maths.ts`) already do the date maths — this
 *  just turns their results into notifications. Overdue is 'error' (money that should already
 *  have moved); due-soon (next 14 days) is 'warning'. */
export function paymentNotifications(expenses: ExpenseWithPayments[], now: Date = new Date()): Notification[] {
  const notifications: Notification[] = [];

  for (const { payment, expense } of overduePayments(expenses, now)) {
    notifications.push({
      key: `payment-overdue:${payment.id}`,
      severity: 'error',
      title: 'Payment overdue',
      message: `${expenseLabel(expense)}: ${formatCurrency(payment.amount)} was due ${formatDate(payment.due_date)}.`,
      path: '/budget',
      at: payment.due_date ?? undefined,
    });
  }

  for (const { payment, expense } of duePaymentsSoon(expenses, 14, now)) {
    notifications.push({
      key: `payment-due-soon:${payment.id}`,
      severity: 'warning',
      title: 'Payment due soon',
      message: `${expenseLabel(expense)}: ${formatCurrency(payment.amount)} due ${formatDate(payment.due_date)}.`,
      path: '/budget',
      at: payment.due_date ?? undefined,
    });
  }

  return notifications;
}

/* -------------------------------------------------------------------------------------------
   Vendor booked without a contract/document
------------------------------------------------------------------------------------------- */

/** "Booked or later" in the status progression migration 5's own CHECK constraint defines —
 *  `not_proceeding` is a terminal OFF state, not "later", so it is deliberately excluded. */
const BOOKED_OR_LATER: ReadonlySet<VendorStatus> = new Set(['booked', 'fully_paid']);

/** `vendorIdsWithDocuments` is the set of `bm_vendors.id`s that have at least one
 *  `bm_document_links` row (`entity_type = 'vendor'`) — built by the caller from
 *  `data/documents/hooks.ts`'s `useDocumentLinkEntityIds('vendor')` rather than this pure module
 *  querying anything itself. */
export function vendorMissingDocumentNotifications(vendors: VendorRow[], vendorIdsWithDocuments: ReadonlySet<string>): Notification[] {
  return vendors
    .filter((v) => BOOKED_OR_LATER.has(v.status) && !vendorIdsWithDocuments.has(v.id))
    .map((v) => ({
      key: `vendor-no-doc:${v.id}`,
      severity: 'warning' as const,
      title: 'No contract on file',
      message: `${v.name} is booked but has no document attached.`,
      path: '/vendors',
    }));
}

/* -------------------------------------------------------------------------------------------
   RSVP overdue N days after an invitation was sent
------------------------------------------------------------------------------------------- */

const RSVP_OVERDUE_THRESHOLD_DAYS = 21;

/** A household is overdue when its EARLIEST 'sent' `bm_invitation_events` row is at least
 *  `thresholdDays` old and no 'completed' event exists yet — mirrors `RsvpTrackerPage`'s own
 *  derivation of "sent"/"completed" straight from the event log rather than the `bm_invitations`
 *  table, so this rule and that page can never disagree about what "sent" means. */
export function rsvpOverdueNotifications(
  households: HouseholdWithGuests[],
  invitationEvents: InvitationEventRow[],
  now: Date = new Date(),
  thresholdDays = RSVP_OVERDUE_THRESHOLD_DAYS,
): Notification[] {
  const eventsByHousehold = new Map<string, InvitationEventRow[]>();
  for (const event of invitationEvents) {
    const list = eventsByHousehold.get(event.household_id);
    if (list) list.push(event);
    else eventsByHousehold.set(event.household_id, [event]);
  }

  const notifications: Notification[] = [];
  for (const household of households) {
    const events = eventsByHousehold.get(household.id) ?? [];
    if (events.some((e) => e.kind === 'completed')) continue;

    const sentDates = events.filter((e) => e.kind === 'sent').map((e) => e.created_at).sort();
    const firstSentAt = sentDates[0];
    if (!firstSentAt) continue;

    const daysSinceSent = -daysUntil(new Date(firstSentAt), now);
    if (daysSinceSent < thresholdDays) continue;

    notifications.push({
      key: `rsvp-overdue:${household.id}`,
      severity: 'warning',
      title: 'RSVP overdue',
      message: `${household.name} hasn't responded — invitation sent ${formatDate(firstSentAt)}.`,
      path: '/rsvp-tracker',
      at: firstSentAt,
    });
  }
  return notifications;
}

/* -------------------------------------------------------------------------------------------
   Incomplete guest details
------------------------------------------------------------------------------------------- */

/** An adult who has RSVP'd attending SOME function but has no `meal_preference` set — the one
 *  gap that would actually block a good catering headcount, not every field a guest record could
 *  in principle carry. Children are excluded: `child_meal` covers that case separately and not
 *  every family sets an explicit meal preference for a toddler. */
export function incompleteGuestDetailsNotifications(households: HouseholdWithGuests[]): Notification[] {
  const notifications: Notification[] = [];
  for (const household of households) {
    for (const guest of household.guests) {
      if (guest.guest_type !== 'adult') continue;
      if (guest.meal_preference) continue;
      const attending = guest.functionInvites.some((i) => i.rsvp === 'attending');
      if (!attending) continue;
      notifications.push({
        key: `guest-missing-meal:${guest.id}`,
        severity: 'info',
        title: 'Missing meal preference',
        message: `${guestDisplayName(guest)} (${household.name}) is attending but has no meal preference set.`,
        path: '/guests',
      });
    }
  }
  return notifications;
}

/* -------------------------------------------------------------------------------------------
   Seating incomplete as the event date approaches
------------------------------------------------------------------------------------------- */

const SEATING_THRESHOLD_DAYS = 30;

/** Surfaces `lib/seating/warnings.ts`'s own `checkUnseatedAttending` per plan, once the event is
 *  within `thresholdDays` — before that, an incomplete plan is simply a work in progress, not
 *  something worth a notification. Escalates to 'error' inside the final week. */
export function seatingIncompleteNotifications(
  plans: SeatingPlanWithObjects[],
  households: HouseholdWithGuests[],
  eventDate: Date,
  now: Date = new Date(),
  thresholdDays = SEATING_THRESHOLD_DAYS,
): Notification[] {
  const daysToEvent = daysUntil(eventDate, now);
  if (daysToEvent > thresholdDays) return [];

  const notifications: Notification[] = [];
  for (const plan of plans) {
    const assignments = plan.objects.flatMap((o) => o.assignments);
    const unseated = checkUnseatedAttending(plan, households, assignments);
    if (unseated.length === 0) continue;
    notifications.push({
      key: `seating-incomplete:${plan.id}`,
      severity: daysToEvent <= 7 ? 'error' : 'warning',
      title: 'Seating incomplete',
      message: `${plan.name}: ${unseated.length} attending guest${unseated.length === 1 ? '' : 's'} not yet seated, with the event ${eventProximityPhrase(daysToEvent)}.`,
      path: '/seating',
    });
  }
  return notifications;
}

/* -------------------------------------------------------------------------------------------
   Overdue task
------------------------------------------------------------------------------------------- */

/** A `bm_tasks` row with a `due_date` in the past and a `status` that isn't `done`/`cancelled`. */
export function overdueTaskNotifications(tasks: TaskRow[], now: Date = new Date()): Notification[] {
  const notifications: Notification[] = [];
  for (const task of tasks) {
    if (!task.due_date || task.status === 'done' || task.status === 'cancelled') continue;
    const due = toLocalDateOnly(task.due_date);
    if (!due || daysUntil(due, now) >= 0) continue;
    notifications.push({
      key: `task-overdue:${task.id}`,
      severity: 'warning',
      title: 'Task overdue',
      message: `"${task.title}" was due ${formatDate(task.due_date)}.`,
      path: '/tasks',
      at: task.due_date,
    });
  }
  return notifications;
}

/* -------------------------------------------------------------------------------------------
   Menu not yet finalised as the event date approaches
------------------------------------------------------------------------------------------- */

const MENU_THRESHOLD_DAYS = 30;

function eventProximityPhrase(daysToEvent: number): string {
  if (daysToEvent <= 0) return 'here';
  return `in ${daysToEvent} day${daysToEvent === 1 ? '' : 's'}`;
}

/** A function with no `bm_menus` row of its own marked `is_final`, once the event is within
 *  `thresholdDays`. An event-wide menu (`function_id` null) does not count towards any one
 *  function's own final approval — the plan's own wording is "a function with no bm_menus row
 *  marked is_final", which is specifically a per-function check. */
export function menuNotFinalNotifications(
  functions: FunctionRow[],
  menus: MenuRow[],
  eventDate: Date,
  now: Date = new Date(),
  thresholdDays = MENU_THRESHOLD_DAYS,
): Notification[] {
  const daysToEvent = daysUntil(eventDate, now);
  if (daysToEvent > thresholdDays) return [];

  const finalisedFunctionIds = new Set(menus.filter((m) => m.is_final && m.function_id).map((m) => m.function_id as string));

  return functions
    .filter((fn) => !finalisedFunctionIds.has(fn.id))
    .map((fn) => ({
      key: `menu-not-final:${fn.id}`,
      severity: (daysToEvent <= 14 ? 'error' : 'warning') as NotificationSeverity,
      title: 'Menu not finalised',
      message: `${fn.name} has no finalised menu yet, with the event ${eventProximityPhrase(daysToEvent)}.`,
      path: '/menu',
    }));
}

/* -------------------------------------------------------------------------------------------
   Combine
------------------------------------------------------------------------------------------- */

export interface NotificationRuleInputs {
  expenses: ExpenseWithPayments[];
  vendors: VendorRow[];
  vendorIdsWithDocuments: ReadonlySet<string>;
  households: HouseholdWithGuests[];
  invitationEvents: InvitationEventRow[];
  seatingPlans: SeatingPlanWithObjects[];
  tasks: TaskRow[];
  functions: FunctionRow[];
  menus: MenuRow[];
  eventDate: Date;
  now?: Date;
}

/**
 * Runs every rule above against the domain data the caller already has loaded, and returns the
 * full flat list — sorted worst severity first, then (within a severity band) by each
 * notification's own `at` date, earliest first, with the un-dated ones (nothing to sort by) last.
 * Nothing here is stored; call this fresh whenever the list needs to be current.
 */
export function combineNotificationRules(input: NotificationRuleInputs): Notification[] {
  const now = input.now ?? new Date();

  const all = [
    ...paymentNotifications(input.expenses, now),
    ...vendorMissingDocumentNotifications(input.vendors, input.vendorIdsWithDocuments),
    ...rsvpOverdueNotifications(input.households, input.invitationEvents, now),
    ...incompleteGuestDetailsNotifications(input.households),
    ...seatingIncompleteNotifications(input.seatingPlans, input.households, input.eventDate, now),
    ...overdueTaskNotifications(input.tasks, now),
    ...menuNotFinalNotifications(input.functions, input.menus, input.eventDate, now),
  ];

  return all.sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    if (a.at && b.at) return a.at.localeCompare(b.at);
    if (a.at) return -1;
    if (b.at) return 1;
    return a.key.localeCompare(b.key);
  });
}
