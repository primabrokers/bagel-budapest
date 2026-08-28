import { supabase } from '../../lib/supabase';
import { logActivity } from '../activity/log';
import { floorObjectLabel } from '../../lib/seating/tableGeometry';
import type {
  FloorObjectKind,
  FloorObjectRow,
  PreferenceRule,
  SeatAssignmentRow,
  SeatingPlanRow,
  SeatingPreferenceRow,
} from './types';

/* -----------------------------------------------------------------------------------------------
   Seating plans
----------------------------------------------------------------------------------------------- */

export interface SeatingPlanInput {
  name: string;
  function_id?: string | null;
}

export async function createSeatingPlan(eventId: string, input: SeatingPlanInput): Promise<SeatingPlanRow> {
  const { data, error } = await supabase
    .from('bm_seating_plans')
    .insert({ event_id: eventId, name: input.name, function_id: input.function_id ?? null })
    .select('*')
    .single();
  if (error) throw error;
  const row = data as SeatingPlanRow;
  await logActivity({
    eventId,
    action: 'seating_plan_created',
    entityType: 'seating_plan',
    entityId: row.id,
    summary: `Created seating plan: ${row.name}`,
    after: row,
  });
  return row;
}

/** Renaming a plan or moving it to a different function is bookkeeping, not logged — the same
 *  way `updateQuote` in vendors/mutations.ts isn't; the plan's EXISTENCE (create/delete) is what
 *  the activity feed cares about. */
export async function updateSeatingPlan(id: string, patch: Partial<SeatingPlanInput>): Promise<SeatingPlanRow> {
  const { data, error } = await supabase.from('bm_seating_plans').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data as SeatingPlanRow;
}

/** Confirm with the user before calling this — it does not ask itself. Floor objects and seat
 *  assignments cascade-delete with the plan (migration 4's `on delete cascade`). */
export async function deleteSeatingPlan(id: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase.from('bm_seating_plans').select('*').eq('id', id).maybeSingle();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('bm_seating_plans').delete().eq('id', id);
  if (error) throw error;

  if (existing) {
    const row = existing as SeatingPlanRow;
    await logActivity({
      eventId: row.event_id,
      action: 'seating_plan_deleted',
      entityType: 'seating_plan',
      entityId: id,
      summary: `Deleted seating plan: ${row.name}`,
      before: row,
    });
  }
}

/* -----------------------------------------------------------------------------------------------
   Floor objects — not individually logged. Adding, moving or removing a table is layout
   bookkeeping, not a decision the family's activity feed needs to itemise; seating an actual
   GUEST (below) is.
----------------------------------------------------------------------------------------------- */

export interface FloorObjectInput {
  kind: FloorObjectKind;
  label?: string | null;
  table_number?: number | null;
  capacity?: number | null;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  locked?: boolean;
  notes?: string | null;
}

export async function createFloorObject(eventId: string, planId: string, input: FloorObjectInput): Promise<FloorObjectRow> {
  const { data, error } = await supabase
    .from('bm_floor_objects')
    .insert({ event_id: eventId, plan_id: planId, ...input })
    .select('*')
    .single();
  if (error) throw error;
  return data as FloorObjectRow;
}

/**
 * Used heavily for live drag repositioning — `FloorCanvas` calls this once on `pointerup`, not on
 * every `pointermove`, so there is no need for a caller-side debounce on top: one write per drag
 * is already the minimum.
 */
export async function updateFloorObject(id: string, patch: Partial<FloorObjectInput>): Promise<FloorObjectRow> {
  const { data, error } = await supabase.from('bm_floor_objects').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data as FloorObjectRow;
}

/** Confirm with the user before calling this — it does not ask itself. Seat assignments at this
 *  object cascade-delete with it. */
export async function deleteFloorObject(id: string): Promise<void> {
  const { error } = await supabase.from('bm_floor_objects').delete().eq('id', id);
  if (error) throw error;
}

/* -----------------------------------------------------------------------------------------------
   Seat assignments
----------------------------------------------------------------------------------------------- */

/**
 * Seats one guest at `objectId`, moving them there if they already held a seat elsewhere on this
 * plan — `bm_seat_assignments` has one row per `(plan_id, guest_id)`, so this is an upsert on
 * that pair rather than an insert that would violate it. `seatIndex` is left unset by the Room
 * view's tap-to-place flow (seated at the table, no specific chair chosen yet); `TableDetailSheet`
 * passes a real index when the family taps an exact empty slot.
 */
export async function assignSeat(
  eventId: string,
  planId: string,
  guestId: string,
  objectId: string,
  seatIndex?: number | null,
): Promise<SeatAssignmentRow> {
  const { data, error } = await supabase
    .from('bm_seat_assignments')
    .upsert(
      { event_id: eventId, plan_id: planId, guest_id: guestId, object_id: objectId, seat_index: seatIndex ?? null },
      { onConflict: 'plan_id,guest_id' },
    )
    .select('*')
    .single();
  if (error) throw error;
  const row = data as SeatAssignmentRow;

  const [{ data: guest }, { data: object }] = await Promise.all([
    supabase.from('bm_guests').select('first_name,last_name').eq('id', guestId).maybeSingle(),
    supabase.from('bm_floor_objects').select('label,table_number,kind').eq('id', objectId).maybeSingle(),
  ]);
  const guestName = guest ? [guest.first_name, guest.last_name].filter(Boolean).join(' ') : 'A guest';
  const tableName = object ? floorObjectLabel(object as Pick<FloorObjectRow, 'label' | 'table_number' | 'kind'>) : 'a table';

  await logActivity({
    eventId,
    action: 'seat_assigned',
    entityType: 'seating_plan',
    entityId: planId,
    summary: `Seated ${guestName} at ${tableName}`,
    after: row,
  });
  return row;
}

/** Confirm with the user before calling this for a guest someone might have deliberately placed
 *  — it does not ask itself. A no-op (not an error) when the guest was not seated to begin with. */
export async function unassignSeat(planId: string, guestId: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('bm_seat_assignments')
    .select('*')
    .eq('plan_id', planId)
    .eq('guest_id', guestId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing) return;

  const row = existing as SeatAssignmentRow;
  const { error } = await supabase.from('bm_seat_assignments').delete().eq('id', row.id);
  if (error) throw error;

  const { data: guest } = await supabase.from('bm_guests').select('first_name,last_name').eq('id', guestId).maybeSingle();
  const guestName = guest ? [guest.first_name, guest.last_name].filter(Boolean).join(' ') : 'A guest';

  await logActivity({
    eventId: row.event_id,
    action: 'seat_unassigned',
    entityType: 'seating_plan',
    entityId: planId,
    summary: `Removed ${guestName}'s seat`,
    before: row,
  });
}

/** Toggles the lock on one seat assignment. A locked assignment resists being casually bumped by
 *  a later placement — `TableDetailSheet` surfaces the override via `confirmDialog` rather than
 *  silently blocking. Not logged: a lock toggle is a workflow safeguard, not itself a seating
 *  decision worth the activity feed's attention. */
export async function setSeatLocked(assignmentId: string, locked: boolean): Promise<void> {
  const { error } = await supabase.from('bm_seat_assignments').update({ locked }).eq('id', assignmentId);
  if (error) throw error;
}

/**
 * Swaps two already-seated guests' tables/seats in one call — `TableDetailSheet`'s "tap a seated
 * guest, then tap another seated guest" swap gesture. Both must already hold a row on this plan;
 * swapping with an unseated guest is just `assignSeat`.
 */
export async function swapSeatAssignments(eventId: string, planId: string, guestIdA: string, guestIdB: string): Promise<void> {
  const { data: rows, error } = await supabase
    .from('bm_seat_assignments')
    .select('*')
    .eq('plan_id', planId)
    .in('guest_id', [guestIdA, guestIdB]);
  if (error) throw error;

  const a = (rows ?? []).find((r) => r.guest_id === guestIdA) as SeatAssignmentRow | undefined;
  const b = (rows ?? []).find((r) => r.guest_id === guestIdB) as SeatAssignmentRow | undefined;
  if (!a || !b) throw new Error('Both guests must already be seated on this plan to swap them.');

  const { error: errorA } = await supabase
    .from('bm_seat_assignments')
    .update({ object_id: b.object_id, seat_index: b.seat_index })
    .eq('id', a.id);
  if (errorA) throw errorA;

  const { error: errorB } = await supabase
    .from('bm_seat_assignments')
    .update({ object_id: a.object_id, seat_index: a.seat_index })
    .eq('id', b.id);
  if (errorB) throw errorB;

  await logActivity({
    eventId,
    action: 'seats_swapped',
    entityType: 'seating_plan',
    entityId: planId,
    summary: "Swapped two guests' seats",
  });
}

/* -----------------------------------------------------------------------------------------------
   Seating preferences
----------------------------------------------------------------------------------------------- */

/** `bm_seating_preferences` has `CHECK (guest_a < guest_b)` — the pair must always be inserted
 *  smaller-first, regardless of the order the family picked them in the UI. Sorted here, in the
 *  ONE place this module writes the table, rather than trusting every caller to remember it. */
function sortGuestPair(guestIdA: string, guestIdB: string): [string, string] {
  return guestIdA < guestIdB ? [guestIdA, guestIdB] : [guestIdB, guestIdA];
}

export async function setSeatingPreference(
  eventId: string,
  guestIdA: string,
  guestIdB: string,
  rule: PreferenceRule,
  note?: string | null,
): Promise<SeatingPreferenceRow> {
  const [guestA, guestB] = sortGuestPair(guestIdA, guestIdB);
  const { data, error } = await supabase
    .from('bm_seating_preferences')
    .upsert(
      { event_id: eventId, guest_a: guestA, guest_b: guestB, rule, note: note ?? null },
      { onConflict: 'event_id,guest_a,guest_b' },
    )
    .select('*')
    .single();
  if (error) throw error;
  const row = data as SeatingPreferenceRow;

  await logActivity({
    eventId,
    action: 'seating_preference_set',
    entityType: 'seating_preference',
    entityId: row.id,
    summary: `Set a seating preference (${rule.replace('_', ' ')})`,
    after: row,
  });
  return row;
}

/** Confirm with the user before calling this — it does not ask itself. */
export async function deleteSeatingPreference(id: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase.from('bm_seating_preferences').select('*').eq('id', id).maybeSingle();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('bm_seating_preferences').delete().eq('id', id);
  if (error) throw error;

  if (existing) {
    const row = existing as SeatingPreferenceRow;
    await logActivity({
      eventId: row.event_id,
      action: 'seating_preference_removed',
      entityType: 'seating_preference',
      entityId: id,
      summary: 'Removed a seating preference',
      before: row,
    });
  }
}
