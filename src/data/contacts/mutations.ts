import { supabase } from '../../lib/supabase';
import { logActivity } from '../activity/log';
import type { CustomContactRow } from './types';

export interface CustomContactInput {
  name: string;
  role?: string | null;
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  notes?: string | null;
}

export async function createCustomContact(eventId: string, input: CustomContactInput): Promise<CustomContactRow> {
  const { data, error } = await supabase
    .from('bm_custom_contacts')
    .insert({ event_id: eventId, ...input })
    .select('*')
    .single();
  if (error) throw error;
  const row = data as CustomContactRow;
  await logActivity({
    eventId,
    action: 'custom_contact_created',
    entityType: 'custom_contact',
    entityId: row.id,
    summary: `Added contact: ${row.name}`,
    after: row,
  });
  return row;
}

export async function updateCustomContact(id: string, patch: Partial<CustomContactInput>): Promise<CustomContactRow> {
  const { data, error } = await supabase.from('bm_custom_contacts').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  const row = data as CustomContactRow;
  await logActivity({
    eventId: row.event_id,
    action: 'custom_contact_updated',
    entityType: 'custom_contact',
    entityId: row.id,
    summary: `Updated contact: ${row.name}`,
    after: patch,
  });
  return row;
}

/** Confirm with the user before calling this — it does not ask itself. */
export async function deleteCustomContact(id: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('bm_custom_contacts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('bm_custom_contacts').delete().eq('id', id);
  if (error) throw error;

  if (existing) {
    const row = existing as CustomContactRow;
    await logActivity({
      eventId: row.event_id,
      action: 'custom_contact_deleted',
      entityType: 'custom_contact',
      entityId: id,
      summary: `Removed contact: ${row.name}`,
      before: row,
    });
  }
}
