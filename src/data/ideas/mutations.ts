import { supabase } from '../../lib/supabase';
import { logActivity } from '../activity/log';
import type { IdeaBoardRow, IdeaRow, IdeaStatus } from './types';

/* -------------------------------------------------------------------------------------------
   Boards
------------------------------------------------------------------------------------------- */

export interface BoardInput {
  name: string;
  sort_order?: number;
}

export async function createBoard(eventId: string, input: BoardInput): Promise<IdeaBoardRow> {
  const { data, error } = await supabase
    .from('bm_idea_boards')
    .insert({ event_id: eventId, ...input })
    .select('*')
    .single();
  if (error) throw error;
  const row = data as IdeaBoardRow;
  await logActivity({
    eventId,
    action: 'idea_board_created',
    entityType: 'idea_board',
    entityId: row.id,
    summary: `Added idea board: ${row.name}`,
    after: row,
  });
  return row;
}

export async function updateBoard(id: string, patch: Partial<BoardInput>): Promise<IdeaBoardRow> {
  const { data, error } = await supabase.from('bm_idea_boards').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  const row = data as IdeaBoardRow;
  await logActivity({
    eventId: row.event_id,
    action: 'idea_board_updated',
    entityType: 'idea_board',
    entityId: row.id,
    summary: `Renamed idea board to: ${row.name}`,
    after: patch,
  });
  return row;
}

/** Confirm with the user before calling this — it does not ask itself. Cascades to the board's
 *  own ideas via the FK (migration 6's `on delete cascade`), so warn about that in the confirm
 *  copy rather than here. */
export async function deleteBoard(id: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('bm_idea_boards')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('bm_idea_boards').delete().eq('id', id);
  if (error) throw error;

  if (existing) {
    const row = existing as IdeaBoardRow;
    await logActivity({
      eventId: row.event_id,
      action: 'idea_board_deleted',
      entityType: 'idea_board',
      entityId: id,
      summary: `Removed idea board: ${row.name}`,
      before: row,
    });
  }
}

/**
 * Batch persist a reorder of boards. Not logged to the activity feed — same reasoning as
 * `data/event/mutations.ts`'s `reorderFunctions`: a drag-order change isn't among the
 * "meaningful" mutations (add/edit/remove) worth an audit row, and logging every reorder step
 * would just spam the feed.
 */
export async function reorderBoards(updates: { id: string; sort_order: number }[]): Promise<void> {
  if (updates.length === 0) return;
  const results = await Promise.all(
    updates.map((u) => supabase.from('bm_idea_boards').update({ sort_order: u.sort_order }).eq('id', u.id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

/* -------------------------------------------------------------------------------------------
   Ideas
------------------------------------------------------------------------------------------- */

export interface IdeaInput {
  board_id: string;
  title: string;
  description?: string | null;
  source_url?: string | null;
  cost_estimate?: number | null;
  vendor_id?: string | null;
  status?: IdeaStatus;
  tags?: string[];
  notes?: string | null;
  sort_order?: number;
}

export async function createIdea(eventId: string, input: IdeaInput): Promise<IdeaRow> {
  const { data, error } = await supabase
    .from('bm_ideas')
    .insert({ event_id: eventId, ...input })
    .select('*')
    .single();
  if (error) throw error;
  const row = data as IdeaRow;
  await logActivity({
    eventId,
    action: 'idea_created',
    entityType: 'idea',
    entityId: row.id,
    summary: `Added idea: ${row.title}`,
    after: row,
  });
  return row;
}

export async function updateIdea(id: string, patch: Partial<IdeaInput>): Promise<IdeaRow> {
  const { data, error } = await supabase.from('bm_ideas').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  const row = data as IdeaRow;
  await logActivity({
    eventId: row.event_id,
    action: 'idea_updated',
    entityType: 'idea',
    entityId: row.id,
    summary: `Updated idea: ${row.title}`,
    after: patch,
  });
  return row;
}

/** Confirm with the user before calling this — it does not ask itself. */
export async function deleteIdea(id: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('bm_ideas')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('bm_ideas').delete().eq('id', id);
  if (error) throw error;

  if (existing) {
    const row = existing as IdeaRow;
    await logActivity({
      eventId: row.event_id,
      action: 'idea_deleted',
      entityType: 'idea',
      entityId: id,
      summary: `Removed idea: ${row.title}`,
      before: row,
    });
  }
}

/** A lightweight status move, not routed through `updateIdea` so it logs its own clearer action
 *  name — the same distinction `toggleVendorFavourite` in `data/vendors/mutations.ts` draws for
 *  a single-field change that means something specific on its own. This is what both the phone
 *  status `Menu` and the desktop drag interaction call. */
export async function setIdeaStatus(id: string, status: IdeaStatus): Promise<IdeaRow> {
  const { data, error } = await supabase.from('bm_ideas').update({ status }).eq('id', id).select('*').single();
  if (error) throw error;
  const row = data as IdeaRow;
  await logActivity({
    eventId: row.event_id,
    action: 'idea_status_changed',
    entityType: 'idea',
    entityId: row.id,
    summary: `Moved "${row.title}" to ${status.replace('_', ' ')}`,
    after: { status },
  });
  return row;
}

/**
 * Batch persist a reorder of ideas (within or across boards, dragged position). Not logged — same
 * reasoning as `reorderBoards` above.
 */
export async function reorderIdeas(updates: { id: string; sort_order: number; board_id?: string }[]): Promise<void> {
  if (updates.length === 0) return;
  const results = await Promise.all(
    updates.map((u) => {
      const patch: { sort_order: number; board_id?: string } = { sort_order: u.sort_order };
      if (u.board_id) patch.board_id = u.board_id;
      return supabase.from('bm_ideas').update(patch).eq('id', u.id);
    }),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

/**
 * Uploads `file` to the PRIVATE `bm-idea-images` bucket at `${eventId}/${randomId}-${filename}` —
 * same RLS shape as `data/documents/mutations.ts`'s `uploadDocument`, requiring the first path
 * segment to be an event id this account is a member of (migration 7) — then points
 * `bm_ideas.image_path` at it. Because the bucket is private, rendering it later needs a signed
 * URL (`getSignedIdeaImageUrl`), not a public one.
 */
export async function uploadIdeaImage(eventId: string, ideaId: string, file: File): Promise<IdeaRow> {
  const path = `${eventId}/${crypto.randomUUID()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from('bm-idea-images').upload(path, file);
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('bm_ideas')
    .update({ image_path: path })
    .eq('id', ideaId)
    .select('*')
    .single();
  if (error) throw error;
  const row = data as IdeaRow;
  await logActivity({
    eventId,
    action: 'idea_image_uploaded',
    entityType: 'idea',
    entityId: ideaId,
    summary: `Added a photo to: ${row.title}`,
    after: { image_path: path },
  });
  return row;
}

/**
 * A short-lived signed URL for rendering an idea's image from the private `bm-idea-images`
 * bucket. Generate this on demand when a preview is actually requested — never pre-generate and
 * cache one, since it expires and a stale cached link would silently fail to load.
 */
export async function getSignedIdeaImageUrl(storagePath: string, expiresInSeconds = 300): Promise<string> {
  const { data, error } = await supabase.storage.from('bm-idea-images').createSignedUrl(storagePath, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}
