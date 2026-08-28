/**
 * Row types for `bm_notes` — see migration 6
 * (`supabase/migrations/20260828030500_bm_planning_modules.sql`) for the applied schema this
 * mirrors field-for-field. Hand-written, not generated — see CLAUDE.md's data-layer note.
 */

/** What a note can be pinned to — `null` on `entity_type`/`entity_id` means a freestanding note,
 *  shown only on the Notes page; a value on both means it also appears inline on that record's
 *  own sheet via `EntityNotes`. */
export type NoteEntityType = 'vendor' | 'guest' | 'household' | 'idea' | 'task' | 'function';

export interface NoteRow {
  id: string;
  event_id: string;
  title: string | null;
  body: string;
  pinned: boolean;
  tags: string[];
  entity_type: NoteEntityType | null;
  entity_id: string | null;
  created_at: string;
  updated_at: string;
}
