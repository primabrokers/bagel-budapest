import { supabase } from '../../lib/supabase';
import { logActivity } from '../activity/log';
import type { EventMemberRow, EventRow, FunctionKind, FunctionRow } from './types';

export async function updateEvent(eventId: string, patch: Partial<EventRow>): Promise<void> {
  const { error } = await supabase.from('bm_events').update(patch).eq('id', eventId);
  if (error) throw error;
  await logActivity({
    eventId,
    action: 'event_updated',
    entityType: 'event',
    entityId: eventId,
    summary: 'Updated event details',
    after: patch,
  });
}

export interface NewFunctionInput {
  name: string;
  kind: FunctionKind;
  starts_at?: string | null;
  ends_at?: string | null;
  location?: string | null;
  dress_code?: string | null;
  hebrew_date_override?: string | null;
  sort_order?: number;
}

export async function createFunction(eventId: string, input: NewFunctionInput): Promise<FunctionRow> {
  const { data, error } = await supabase
    .from('bm_functions')
    .insert({ event_id: eventId, ...input })
    .select('*')
    .single();
  if (error) throw error;
  const row = data as FunctionRow;
  await logActivity({
    eventId,
    action: 'function_created',
    entityType: 'function',
    entityId: row.id,
    summary: `Added function: ${row.name}`,
    after: row,
  });
  return row;
}

export async function updateFunction(id: string, patch: Partial<FunctionRow>): Promise<void> {
  const { data, error } = await supabase.from('bm_functions').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  const row = data as FunctionRow;
  await logActivity({
    eventId: row.event_id,
    action: 'function_updated',
    entityType: 'function',
    entityId: row.id,
    summary: `Updated function: ${row.name}`,
    after: row,
  });
}

/** Confirm with the user before calling this — it does not ask itself. */
export async function deleteFunction(id: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('bm_functions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('bm_functions').delete().eq('id', id);
  if (error) throw error;

  if (existing) {
    const row = existing as FunctionRow;
    await logActivity({
      eventId: row.event_id,
      action: 'function_deleted',
      entityType: 'function',
      entityId: id,
      summary: `Removed function: ${row.name}`,
      before: row,
    });
  }
}

/**
 * Batch persist an up/down reorder. Not logged to the activity feed — per CLAUDE.md's list of
 * mutations that log, a drag-order change isn't among the "meaningful" ones (add/edit/remove,
 * event details, invites, uploads); logging every reorder step would just spam the feed.
 */
export async function reorderFunctions(updates: { id: string; sort_order: number }[]): Promise<void> {
  if (updates.length === 0) return;
  const results = await Promise.all(
    updates.map((u) => supabase.from('bm_functions').update({ sort_order: u.sort_order }).eq('id', u.id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

export async function inviteFamilyMember(
  eventId: string,
  email: string,
  displayName?: string,
): Promise<EventMemberRow> {
  const trimmedEmail = email.trim();
  const { data, error } = await supabase
    .from('bm_event_members')
    .insert({ event_id: eventId, invited_email: trimmedEmail, display_name: displayName?.trim() || null })
    .select('*')
    .single();
  if (error) throw error;
  const row = data as EventMemberRow;
  await logActivity({
    eventId,
    action: 'family_member_invited',
    entityType: 'event_member',
    entityId: row.id,
    summary: `Invited ${trimmedEmail} to the family`,
    after: row,
  });
  return row;
}

/** Confirm with the user before calling this — it does not ask itself. */
export async function removeFamilyMember(id: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('bm_event_members')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('bm_event_members').delete().eq('id', id);
  if (error) throw error;

  if (existing) {
    const row = existing as EventMemberRow;
    const label = row.display_name || row.invited_email || 'a family member';
    await logActivity({
      eventId: row.event_id,
      action: 'family_member_removed',
      entityType: 'event_member',
      entityId: id,
      summary: `Removed ${label} from the family`,
      before: row,
    });
  }
}

/**
 * Uploads to the public `bm-branding` bucket at `${eventId}/${randomId}-${filename}` (the RLS
 * policy on `storage.objects` requires the first path segment to be an event id this account is
 * a member of — see migration 7), then points `bm_events.monogram_path`/`logo_path` at the new
 * storage PATH. Callers resolve that path to a public URL wherever they render it via
 * `supabase.storage.from('bm-branding').getPublicUrl(path)` — the path, not the URL, is what's
 * portable if the bucket is ever renamed.
 */
export async function uploadEventBrandingImage(
  eventId: string,
  kind: 'monogram' | 'logo',
  file: File,
): Promise<string> {
  const path = `${eventId}/${crypto.randomUUID()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from('bm-branding').upload(path, file);
  if (uploadError) throw uploadError;

  const column = kind === 'monogram' ? 'monogram_path' : 'logo_path';
  const { error: updateError } = await supabase
    .from('bm_events')
    .update({ [column]: path })
    .eq('id', eventId);
  if (updateError) throw updateError;

  await logActivity({
    eventId,
    action: 'branding_image_uploaded',
    entityType: 'event',
    entityId: eventId,
    summary: `Uploaded a new ${kind}`,
    after: { [column]: path },
  });

  return path;
}
