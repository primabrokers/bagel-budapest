import { supabase } from '../../lib/supabase';
import { logActivity } from '../activity/log';
import type { ScheduleAudience, ScheduleItemRow } from './types';

export interface ScheduleItemInput {
  function_id?: string | null;
  starts_at?: string | null;
  duration_minutes?: number | null;
  activity: string;
  location?: string | null;
  responsible?: string | null;
  vendor_id?: string | null;
  audience?: ScheduleAudience;
  notes?: string | null;
  sort_order?: number;
}

export async function createScheduleItem(eventId: string, input: ScheduleItemInput): Promise<ScheduleItemRow> {
  const { data, error } = await supabase
    .from('bm_schedule_items')
    .insert({ event_id: eventId, ...input })
    .select('*')
    .single();
  if (error) throw error;
  const row = data as ScheduleItemRow;
  await logActivity({
    eventId,
    action: 'schedule_item_created',
    entityType: 'schedule_item',
    entityId: row.id,
    summary: `Added to the run sheet: ${row.activity}`,
    after: row,
  });
  return row;
}

export async function updateScheduleItem(id: string, patch: Partial<ScheduleItemInput>): Promise<ScheduleItemRow> {
  const { data, error } = await supabase.from('bm_schedule_items').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  const row = data as ScheduleItemRow;
  await logActivity({
    eventId: row.event_id,
    action: 'schedule_item_updated',
    entityType: 'schedule_item',
    entityId: row.id,
    summary: `Updated run sheet item: ${row.activity}`,
    after: patch,
  });
  return row;
}

/** Confirm with the user before calling this — it does not ask itself. */
export async function deleteScheduleItem(id: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('bm_schedule_items')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('bm_schedule_items').delete().eq('id', id);
  if (error) throw error;

  if (existing) {
    const row = existing as ScheduleItemRow;
    await logActivity({
      eventId: row.event_id,
      action: 'schedule_item_deleted',
      entityType: 'schedule_item',
      entityId: id,
      summary: `Removed from the run sheet: ${row.activity}`,
      before: row,
    });
  }
}

/**
 * Batch persist a reorder of run-sheet items. Not logged to the activity feed — same reasoning as
 * `data/event/mutations.ts`'s `reorderFunctions`: a drag-order change isn't among the
 * "meaningful" mutations (add/edit/remove) worth an audit row.
 */
export async function reorderScheduleItems(updates: { id: string; sort_order: number }[]): Promise<void> {
  if (updates.length === 0) return;
  const results = await Promise.all(
    updates.map((u) => supabase.from('bm_schedule_items').update({ sort_order: u.sort_order }).eq('id', u.id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}
