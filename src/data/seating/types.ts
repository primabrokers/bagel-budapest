/**
 * Row types for `bm_seating_plans` / `bm_floor_objects` / `bm_seat_assignments` /
 * `bm_seating_preferences` — see migration 4
 * (`supabase/migrations/20260828030300_bm_seating.sql`) for the applied schema these mirror
 * field-for-field. Hand-written, not generated — see CLAUDE.md's "no react-query, hand-written
 * row types" data-layer note.
 */

export type FloorObjectKind =
  | 'table_round'
  | 'table_long'
  | 'table_rect'
  | 'table_square'
  | 'top_table'
  | 'kids_table'
  | 'dance_floor'
  | 'stage'
  | 'bar'
  | 'buffet'
  | 'entrance'
  /** A partition dividing the room for separate seating. Not seatable; the room planner treats it
   *  as a divider tables may not straddle, and `autoSeat` reads which side each table is on. */
  | 'mechitza'
  | 'custom';

export type PreferenceRule = 'must_together' | 'prefer_together' | 'keep_apart';

export interface SeatingPlanRow {
  id: string;
  event_id: string;
  /** The real hall in centimetres (migration 12). Null until someone measures it, in which case
   *  `FloorCanvas` falls back to its 20m x 15m default. */
  room_width_cm: number | null;
  room_length_cm: number | null;
  /** Seat men and women either side of the mechitza. A stored choice, never inferred from the
   *  presence of a partition — see `lib/seating/autoSeat.ts`. */
  separate_seating: boolean;
  /** Null — a whole-event plan not tied to any one function (e.g. one layout reused for both
   *  the Kiddush and the party). Set — a plan scoped to that one `bm_functions` row. */
  function_id: string | null;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface FloorObjectRow {
  id: string;
  event_id: string;
  plan_id: string;
  kind: FloorObjectKind;
  label: string | null;
  table_number: number | null;
  /** Null for a table with no fixed seat count yet, and always null for non-table kinds. */
  capacity: number | null;
  /** Room coordinates in centimetres — the room's own `viewBox` is roughly to a real venue's
   *  scale (see `FloorCanvas`), not an arbitrary 0–100 grid. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees, clockwise. */
  rotation: number;
  locked: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SeatAssignmentRow {
  id: string;
  event_id: string;
  plan_id: string;
  guest_id: string;
  object_id: string;
  /** Null — seated at this table, no specific chair chosen. Set — a specific slot from
   *  `seatSlots()`'s own ordering for that object. */
  seat_index: number | null;
  locked: boolean;
  created_at: string;
  updated_at: string;
}

export interface SeatingPreferenceRow {
  id: string;
  event_id: string;
  /** Always the lexicographically SMALLER of the pair — `CHECK (guest_a < guest_b)` on the
   *  table. Never insert/update these two columns directly; go through
   *  `data/seating/mutations.ts`'s `setSeatingPreference`, which sorts the pair for you. */
  guest_a: string;
  guest_b: string;
  rule: PreferenceRule;
  note: string | null;
  created_at: string;
}

/** One floor object with its seat assignments embedded — the shape `useSeatingPlan()` nests
 *  under each object via a PostgREST nested select (`bm_floor_objects(*,
 *  bm_seat_assignments(*))`). */
export interface FloorObjectWithAssignments extends FloorObjectRow {
  assignments: SeatAssignmentRow[];
}

/** A seating plan with its floor objects (each carrying its own assignments) embedded — the
 *  whole shape `useSeatingPlan(planId)` returns, and what `FloorCanvas`/`TableDetailSheet`/the
 *  warnings checks in `lib/seating/warnings.ts` all consume. */
export interface SeatingPlanWithObjects extends SeatingPlanRow {
  objects: FloorObjectWithAssignments[];
}
