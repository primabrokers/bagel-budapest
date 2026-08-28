/**
 * Row types for `bm_schedule_items` (the run sheet) — see migration 6
 * (`supabase/migrations/20260828030500_bm_planning_modules.sql`) for the applied schema this
 * mirrors field-for-field. Hand-written, not generated — see CLAUDE.md's data-layer note.
 */

export type ScheduleAudience = 'all' | 'organisers' | 'vendors' | 'family';

export interface ScheduleItemRow {
  id: string;
  event_id: string;
  function_id: string | null;
  /** Nullable in the schema — an item can be added before its exact time is settled. */
  starts_at: string | null;
  duration_minutes: number | null;
  activity: string;
  location: string | null;
  responsible: string | null;
  vendor_id: string | null;
  audience: ScheduleAudience;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
