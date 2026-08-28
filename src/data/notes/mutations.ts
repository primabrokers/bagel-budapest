import { supabase } from '../../lib/supabase';
import { logActivity } from '../activity/log';
import type { NoteEntityType, NoteRow } from './types';

export interface NoteInput {
  title?: string | null;
  body: string;
  pinned?: boolean;
  tags?: string[];
  entity_type?: NoteEntityType | null;
  entity_id?: string | null;
}

function noteLabel(row: { title: string | null }): string {
  return row.title || 'Untitled note';
}

export async function createNote(eventId: string, input: NoteInput): Promise<NoteRow> {
  const { data, error } = await supabase
    .from('bm_notes')
    .insert({ event_id: eventId, ...input })
    .select('*')
    .single();
  if (error) throw error;
  const row = data as NoteRow;
  await logActivity({
    eventId,
    action: 'note_created',
    entityType: 'note',
    entityId: row.id,
    summary: `Added note: ${noteLabel(row)}`,
    after: row,
  });
  return row;
}

/**
 * Writes a patch to one note. Used for BOTH a normal edit from `NoteEditorSheet` and the
 * checklist-toggle rewrite from `NoteBody` — same function, same shape (`{ body: string, ... }`),
 * the only difference being which fields the caller sets.
 *
 * `log` defaults to `true` (an edited title/body/tags is exactly the kind of change
 * `createNote`/`deleteNote` already log). The checklist toggle passes `log: false`: ticking one
 * line of a to-do list is closer to `reorderGuestsInHousehold`'s "not meaningful enough for an
 * audit row" than to a real edit — it happens often, both ways (ticked then unticked as plans
 * change), and logging every tap would drown the real edits this note ever gets in the activity
 * feed. The note's own creation and deletion are still always logged either way.
 */
export async function updateNote(id: string, patch: Partial<NoteInput>, options: { log?: boolean } = {}): Promise<NoteRow> {
  const { log = true } = options;
  const { data, error } = await supabase.from('bm_notes').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  const row = data as NoteRow;
  if (log) {
    await logActivity({
      eventId: row.event_id,
      action: 'note_updated',
      entityType: 'note',
      entityId: row.id,
      summary: `Updated note: ${noteLabel(row)}`,
      after: patch,
    });
  }
  return row;
}

/** Confirm with the user before calling this — it does not ask itself. */
export async function deleteNote(id: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('bm_notes')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('bm_notes').delete().eq('id', id);
  if (error) throw error;

  if (existing) {
    const row = existing as NoteRow;
    await logActivity({
      eventId: row.event_id,
      action: 'note_deleted',
      entityType: 'note',
      entityId: id,
      summary: `Removed note: ${noteLabel(row)}`,
      before: row,
    });
  }
}

/** A lightweight preference toggle, not routed through `updateNote` so it logs its own clearer
 *  action name — the same distinction `toggleVendorFavourite` in `data/vendors/mutations.ts`
 *  draws for a single-field change that means something specific on its own. */
export async function setNotePinned(id: string, pinned: boolean): Promise<NoteRow> {
  const { data, error } = await supabase.from('bm_notes').update({ pinned }).eq('id', id).select('*').single();
  if (error) throw error;
  const row = data as NoteRow;
  await logActivity({
    eventId: row.event_id,
    action: pinned ? 'note_pinned' : 'note_unpinned',
    entityType: 'note',
    entityId: id,
    summary: `${pinned ? 'Pinned' : 'Unpinned'} note: ${noteLabel(row)}`,
  });
  return row;
}
