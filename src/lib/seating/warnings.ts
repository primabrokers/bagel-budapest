/**
 * Pure warning checks over one seating plan: its floor objects, its seat assignments, the guest
 * roster, and the event's seating preferences. `WarningsPanel` renders whatever
 * `computeSeatingWarnings` returns; nothing here touches Supabase or React.
 *
 * Severity is used consistently across all four checks, and maps directly onto this app's own
 * `Badge` tones (danger/warning/info) in `WarningsPanel`:
 *
 *   - 'error'   — a hard problem: either the data itself is wrong (more people seated at a table
 *                 than its capacity), or a rule the family explicitly set is currently broken
 *                 (`must_together`/`keep_apart`).
 *   - 'warning' — needs attention before the day, but nothing is actually wrong yet (an attending
 *                 guest with nowhere to sit).
 *   - 'info'    — worth a glance, often intentional (a big household spanning two tables, a
 *                 softer `prefer_together` wish not honoured).
 */
import type { GuestFunctionInviteRow, GuestWithDetails, HouseholdWithGuests } from '../../data/guests/types';
import type { FloorObjectRow, SeatAssignmentRow, SeatingPlanRow, SeatingPreferenceRow } from '../../data/seating/types';
import { floorObjectLabel } from './tableGeometry';

export type WarningSeverity = 'error' | 'warning' | 'info';

export interface SeatingWarning {
  /** Stable within one `computeSeatingWarnings` call — built from the kind of check plus the
   *  ids involved, so `WarningsPanel` can use it as a React list key without an index. */
  id: string;
  severity: WarningSeverity;
  message: string;
  guestIds?: string[];
  objectId?: string;
}

export interface GuestIndexEntry {
  guest: GuestWithDetails;
  household: HouseholdWithGuests;
}

/** Full name for messages — the same join `HouseholdSheet` uses for a guest row. */
export function guestDisplayName(guest: { first_name: string; last_name: string | null }): string {
  return [guest.first_name, guest.last_name].filter(Boolean).join(' ');
}

/** Every guest keyed by id, alongside the household it belongs to — built once per call and
 *  threaded through the checks below rather than each one re-walking the household tree. */
export function indexGuests(households: HouseholdWithGuests[]): Map<string, GuestIndexEntry> {
  const map = new Map<string, GuestIndexEntry>();
  for (const household of households) {
    for (const guest of household.guests) {
      map.set(guest.id, { guest, household });
    }
  }
  return map;
}

function relevantInvite(guest: GuestWithDetails, plan: SeatingPlanRow): GuestFunctionInviteRow | undefined {
  return plan.function_id ? guest.functionInvites.find((i) => i.function_id === plan.function_id) : undefined;
}

/**
 * Whether this guest is "attending" as far as THIS plan is concerned. A plan tied to one
 * `function_id` only cares about that function's own invite; a plan with no function (a
 * whole-event seating chart) counts a guest as attending if they are attending ANY function they
 * were invited to — the natural reading of "who needs a seat somewhere on this plan" when the
 * plan itself does not name one function.
 */
export function isGuestRelevantToPlan(guest: GuestWithDetails, plan: SeatingPlanRow): boolean {
  if (plan.function_id) return relevantInvite(guest, plan)?.rsvp === 'attending';
  return guest.functionInvites.some((i) => i.invited && i.rsvp === 'attending');
}

function objectLookup(objects: FloorObjectRow[]): Map<string, FloorObjectRow> {
  return new Map(objects.map((o) => [o.id, o]));
}

/** Assignments grouped by the object they sit at. */
function byObject(assignments: SeatAssignmentRow[]): Map<string, SeatAssignmentRow[]> {
  const map = new Map<string, SeatAssignmentRow[]>();
  for (const a of assignments) {
    const list = map.get(a.object_id);
    if (list) list.push(a);
    else map.set(a.object_id, [a]);
  }
  return map;
}

/** More seat assignments at an object than its own `capacity`. A table with no capacity set is
 *  never flagged — there is nothing to be "over". */
export function checkOverCapacity(objects: FloorObjectRow[], assignments: SeatAssignmentRow[]): SeatingWarning[] {
  const warnings: SeatingWarning[] = [];
  const grouped = byObject(assignments);
  for (const object of objects) {
    if (object.capacity == null) continue;
    const seated = grouped.get(object.id)?.length ?? 0;
    if (seated > object.capacity) {
      warnings.push({
        id: `over-capacity:${object.id}`,
        severity: 'error',
        message: `${floorObjectLabel(object)} has ${seated} seated but capacity is ${object.capacity}.`,
        objectId: object.id,
      });
    }
  }
  return warnings;
}

/** A guest attending the plan's own function (see `isGuestRelevantToPlan`) with no row at all in
 *  `bm_seat_assignments` for this plan. */
export function checkUnseatedAttending(
  plan: SeatingPlanRow,
  households: HouseholdWithGuests[],
  assignments: SeatAssignmentRow[],
): SeatingWarning[] {
  const seatedGuestIds = new Set(assignments.map((a) => a.guest_id));
  const warnings: SeatingWarning[] = [];
  for (const household of households) {
    for (const guest of household.guests) {
      if (!isGuestRelevantToPlan(guest, plan)) continue;
      if (seatedGuestIds.has(guest.id)) continue;
      warnings.push({
        id: `unseated:${guest.id}`,
        severity: 'warning',
        message: `${guestDisplayName(guest)} (${household.name}) is attending but has no seat.`,
        guestIds: [guest.id],
      });
    }
  }
  return warnings;
}

/**
 * A household whose guests attending this plan's function are seated at more than one distinct
 * table. Threshold is deliberately "more than one table, any number of guests" — even a
 * two-person household split across two tables is flagged, on the theory that a family would
 * always rather be told and dismiss it than have a real split go unnoticed. Severity 'info': a
 * big household legitimately spanning two tables of ten is common and often intentional.
 */
export function checkSplitHouseholds(
  plan: SeatingPlanRow,
  objects: FloorObjectRow[],
  households: HouseholdWithGuests[],
  assignments: SeatAssignmentRow[],
): SeatingWarning[] {
  const assignmentByGuest = new Map(assignments.map((a) => [a.guest_id, a] as const));
  const objects_ = objectLookup(objects);
  const warnings: SeatingWarning[] = [];

  for (const household of households) {
    const guestIdsByObject = new Map<string, string[]>();
    for (const guest of household.guests) {
      if (!isGuestRelevantToPlan(guest, plan)) continue;
      const assignment = assignmentByGuest.get(guest.id);
      if (!assignment) continue;
      const list = guestIdsByObject.get(assignment.object_id);
      if (list) list.push(guest.id);
      else guestIdsByObject.set(assignment.object_id, [guest.id]);
    }
    if (guestIdsByObject.size <= 1) continue;

    const tableNames = Array.from(guestIdsByObject.keys())
      .map((id) => objects_.get(id))
      .filter((o): o is FloorObjectRow => !!o)
      .map((o) => floorObjectLabel(o));

    warnings.push({
      id: `split-household:${household.id}`,
      severity: 'info',
      message: `${household.name} is split across ${guestIdsByObject.size} tables (${tableNames.join(', ')}).`,
      guestIds: Array.from(guestIdsByObject.values()).flat(),
    });
  }
  return warnings;
}

function preferenceViolation(
  pref: SeatingPreferenceRow,
  guestIndex: Map<string, GuestIndexEntry>,
  severity: WarningSeverity,
  phrase: string,
  objectId: string | undefined,
): SeatingWarning {
  const nameA = guestIndex.get(pref.guest_a) ? guestDisplayName(guestIndex.get(pref.guest_a)!.guest) : 'A guest';
  const nameB = guestIndex.get(pref.guest_b) ? guestDisplayName(guestIndex.get(pref.guest_b)!.guest) : 'A guest';
  return {
    id: `preference:${pref.id}`,
    severity,
    message: `${nameA} and ${nameB} ${phrase}.`,
    guestIds: [pref.guest_a, pref.guest_b],
    objectId,
  };
}

/**
 * `must_together`/`keep_apart`/`prefer_together` rules checked against where guests actually sit.
 * A preference is only evaluated once BOTH guests are seated somewhere on this plan — an unseated
 * guest is already covered by `checkUnseatedAttending`, and warning about a preference before
 * there is anything to compare would just be noise. `must_together` and `keep_apart` are treated
 * as hard asks (severity 'error'); `prefer_together` is the deliberately softer one ('info').
 */
export function checkPreferenceViolations(
  assignments: SeatAssignmentRow[],
  preferences: SeatingPreferenceRow[],
  guestIndex: Map<string, GuestIndexEntry>,
): SeatingWarning[] {
  const assignmentByGuest = new Map(assignments.map((a) => [a.guest_id, a] as const));
  const warnings: SeatingWarning[] = [];

  for (const pref of preferences) {
    const a = assignmentByGuest.get(pref.guest_a);
    const b = assignmentByGuest.get(pref.guest_b);
    if (!a || !b) continue;

    const together = a.object_id === b.object_id;
    if (pref.rule === 'must_together' && !together) {
      warnings.push(preferenceViolation(pref, guestIndex, 'error', 'must be seated together but are at different tables', undefined));
    } else if (pref.rule === 'keep_apart' && together) {
      warnings.push(
        preferenceViolation(pref, guestIndex, 'error', 'are asked to be kept apart but are seated at the same table', a.object_id),
      );
    } else if (pref.rule === 'prefer_together' && !together) {
      warnings.push(
        preferenceViolation(pref, guestIndex, 'info', 'would prefer to be seated together but are at different tables', undefined),
      );
    }
  }
  return warnings;
}

export interface SeatingWarningsInput {
  plan: SeatingPlanRow;
  objects: FloorObjectRow[];
  assignments: SeatAssignmentRow[];
  households: HouseholdWithGuests[];
  preferences: SeatingPreferenceRow[];
}

const SEVERITY_RANK: Record<WarningSeverity, number> = { error: 0, warning: 1, info: 2 };

/** Every check combined, worst-first — the order `WarningsPanel` renders. */
export function computeSeatingWarnings(input: SeatingWarningsInput): SeatingWarning[] {
  const guestIndex = indexGuests(input.households);
  const warnings = [
    ...checkOverCapacity(input.objects, input.assignments),
    ...checkPreferenceViolations(input.assignments, input.preferences, guestIndex),
    ...checkUnseatedAttending(input.plan, input.households, input.assignments),
    ...checkSplitHouseholds(input.plan, input.objects, input.households, input.assignments),
  ];
  return warnings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
