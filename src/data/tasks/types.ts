/**
 * Row types for `bm_tasks` — see migration 6
 * (`supabase/migrations/20260828030500_bm_planning_modules.sql`) for the applied schema this
 * mirrors field-for-field. Hand-written, not generated — see CLAUDE.md's data-layer note.
 */

export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskStatus = 'todo' | 'in_progress' | 'waiting' | 'done' | 'cancelled';

export interface TaskRow {
  id: string;
  event_id: string;
  title: string;
  /** Free text — no curated list exists for tasks the way `lib/vendors/categories.ts` does for
   *  vendors; a family's planning categories are too varied to usefully close the list. */
  category: string | null;
  /** Null — a task need not be assigned to anyone yet. FK to `bm_event_members`. */
  owner_member_id: string | null;
  /** `date`-only column, e.g. "2026-09-26" — parse with `toLocalDateOnly` from lib/format.ts,
   *  never a bare `new Date(due_date)`. */
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  /** Null — a task need not be linked to a vendor. */
  vendor_id: string | null;
  /** Null — a task need not be linked to a guest. */
  guest_id: string | null;
  /** `bm_ideas` doesn't exist yet (Stage 9, built concurrently) — always null this stage; leave
   *  the column alone rather than joining or writing to it. */
  idea_id: string | null;
  notes: string | null;
  /** Set by `setTaskStatus` when a task moves to `done`, cleared when it moves off `done`. */
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}
