import { supabase } from '../../lib/supabase';
import { logActivity } from '../activity/log';
import type { VendorRow, VendorQuoteRow, VendorStatus } from './types';

export interface VendorInput {
  category: string;
  status?: VendorStatus;
  name: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  website?: string | null;
  address?: string | null;
  quoted_price?: number | null;
  agreed_price?: number | null;
  deposit_amount?: number | null;
  deposit_due_date?: string | null;
  balance_due_date?: string | null;
  vat_registered?: boolean;
  rating?: number | null;
  favourite?: boolean;
  notes?: string | null;
}

export async function createVendor(eventId: string, input: VendorInput): Promise<VendorRow> {
  const { data, error } = await supabase
    .from('bm_vendors')
    .insert({ event_id: eventId, ...input })
    .select('*')
    .single();
  if (error) throw error;
  const row = data as VendorRow;
  await logActivity({
    eventId,
    action: 'vendor_created',
    entityType: 'vendor',
    entityId: row.id,
    summary: `Added vendor: ${row.name}`,
    after: row,
  });
  return row;
}

export async function updateVendor(id: string, patch: Partial<VendorInput>): Promise<VendorRow> {
  const { data, error } = await supabase.from('bm_vendors').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  const row = data as VendorRow;
  await logActivity({
    eventId: row.event_id,
    action: 'vendor_updated',
    entityType: 'vendor',
    entityId: row.id,
    summary: `Updated vendor: ${row.name}`,
    after: patch,
  });
  return row;
}

/** Confirm with the user before calling this — it does not ask itself. */
export async function deleteVendor(id: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('bm_vendors')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('bm_vendors').delete().eq('id', id);
  if (error) throw error;

  if (existing) {
    const row = existing as VendorRow;
    await logActivity({
      eventId: row.event_id,
      action: 'vendor_deleted',
      entityType: 'vendor',
      entityId: id,
      summary: `Removed vendor: ${row.name}`,
      before: row,
    });
  }
}

/** A lightweight preference toggle, not routed through `updateVendor` so it logs its own
 *  clearer action name rather than a generic "vendor_updated". */
export async function toggleVendorFavourite(id: string, favourite: boolean): Promise<void> {
  const { data, error } = await supabase
    .from('bm_vendors')
    .update({ favourite })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  const row = data as VendorRow;
  await logActivity({
    eventId: row.event_id,
    action: favourite ? 'vendor_favourited' : 'vendor_unfavourited',
    entityType: 'vendor',
    entityId: id,
    summary: `${favourite ? 'Favourited' : 'Removed favourite on'} ${row.name}`,
  });
}

/* -----------------------------------------------------------------------------------------------
   Contact history — append-only (migration 13). One row per message actually sent.
----------------------------------------------------------------------------------------------- */

export interface VendorContactInput {
  vendorId: string;
  channel: 'email' | 'whatsapp' | 'phone' | 'other';
  subject?: string | null;
  body?: string | null;
  /** The address or number it went to AT THE TIME — kept even if the vendor's details change. */
  sentTo?: string | null;
}

/**
 * Records an outbound message and, when the vendor is still at the start of the pipeline, moves
 * them to `contacted`.
 *
 * The status only ever moves FORWARD from `researching`: a family that has already shortlisted or
 * booked a vendor and then sends a chasing note must not be dragged back to "contacted". That is
 * the kind of quiet regression nobody notices until the pipeline is meaningless.
 */
export async function recordVendorContact(
  eventId: string,
  input: VendorContactInput,
  currentStatus: string,
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();

  const { error } = await supabase.from('bm_vendor_contacts').insert({
    event_id: eventId,
    vendor_id: input.vendorId,
    channel: input.channel,
    subject: input.subject ?? null,
    body: input.body ?? null,
    sent_to: input.sentTo ?? null,
    sent_by: userData.user?.id ?? null,
  });
  if (error) throw error;

  if (currentStatus === 'researching') {
    const { error: statusError } = await supabase
      .from('bm_vendors')
      .update({ status: 'contacted' })
      .eq('id', input.vendorId);
    if (statusError) throw statusError;
  }

  await logActivity({
    eventId,
    action: 'vendor_contacted',
    entityType: 'vendor',
    entityId: input.vendorId,
    summary: `Contacted by ${input.channel}${input.sentTo ? ` (${input.sentTo})` : ''}`,
  });
}

export interface VendorQuoteInput {
  label?: string | null;
  amount?: number | null;
  includes?: string | null;
  valid_until?: string | null;
  received_at?: string | null;
  notes?: string | null;
}

/** Logged — a new quote landing is meaningful to the family's decision trail. Editing one
 *  afterwards (a typo, a tweaked note) is not; see `updateQuote` below. */
export async function createQuote(
  eventId: string,
  vendorId: string,
  input: VendorQuoteInput,
): Promise<VendorQuoteRow> {
  const { data, error } = await supabase
    .from('bm_vendor_quotes')
    .insert({ event_id: eventId, vendor_id: vendorId, ...input })
    .select('*')
    .single();
  if (error) throw error;
  const row = data as VendorQuoteRow;
  await logActivity({
    eventId,
    action: 'vendor_quote_added',
    entityType: 'vendor',
    entityId: vendorId,
    summary: `Added a quote${row.label ? `: ${row.label}` : ''}`,
    after: row,
  });
  return row;
}

/** Not logged — an in-place edit to a quote's own fields is bookkeeping, not a new decision. The
 *  quote's existence (`createQuote`/`deleteQuote`) is what the activity feed cares about. */
export async function updateQuote(id: string, patch: Partial<VendorQuoteInput>): Promise<void> {
  const { error } = await supabase.from('bm_vendor_quotes').update(patch).eq('id', id);
  if (error) throw error;
}

/** Confirm with the user before calling this — it does not ask itself. */
export async function deleteQuote(id: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('bm_vendor_quotes')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('bm_vendor_quotes').delete().eq('id', id);
  if (error) throw error;

  if (existing) {
    const row = existing as VendorQuoteRow;
    await logActivity({
      eventId: row.event_id,
      action: 'vendor_quote_removed',
      entityType: 'vendor',
      entityId: row.vendor_id,
      summary: `Removed a quote${row.label ? `: ${row.label}` : ''}`,
      before: row,
    });
  }
}
