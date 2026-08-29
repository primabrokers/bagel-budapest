import { supabase } from '../../lib/supabase';
import { logActivity } from '../activity/log';
import { parseVendorCandidates, type VendorCandidate } from '../../lib/vendors/candidateParse';
import { extractJsonObject } from '../invitations/aiDesign';
import type { VendorRow } from './types';

/**
 * The client half of `bm_ai_vendor_research`. Runs a search, validates what comes back, and stores
 * it as CANDIDATES for a human to read — never as vendors.
 *
 * The validation is not optional politeness. Everything here originated on web pages a model read,
 * which is prompt-injectable input; `parseVendorCandidates` is what stops a hostile page's
 * `javascript:` link or injected markup reaching a family's screen as a clickable supplier.
 */

export interface VendorCandidateRow {
  id: string;
  event_id: string;
  category: string;
  name: string;
  summary: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  source_url: string | null;
  promoted_vendor_id: string | null;
  dismissed: boolean;
  created_at: string;
  updated_at: string;
}

export type ResearchFailure = 'not_configured' | 'rate_limited' | 'unauthorized' | 'unusable_output' | 'failed';

export type ResearchOutcome =
  | { ok: true; candidates: VendorCandidate[]; notes: string[] }
  | { ok: false; reason: ResearchFailure; message: string };

export async function researchVendors(args: {
  eventId: string;
  category: string;
  area: string;
  notes?: string;
}): Promise<ResearchOutcome> {
  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    text?: string;
    reason?: string;
    message?: string;
  }>('bm_ai_vendor_research', {
    body: { eventId: args.eventId, category: args.category, area: args.area, notes: args.notes },
  });

  if (error) {
    return { ok: false, reason: 'failed', message: 'Could not reach the research service. Please try again.' };
  }

  if (!data?.ok) {
    const reason = data?.reason;
    if (reason === 'not_configured' || reason === 'rate_limited' || reason === 'unauthorized') {
      return { ok: false, reason, message: data?.message ?? 'Vendor research is unavailable.' };
    }
    return { ok: false, reason: 'failed', message: data?.message ?? 'Could not research suppliers.' };
  }

  const { candidates, notes } = parseVendorCandidates(extractJsonObject(data.text ?? ''));
  if (candidates.length === 0) {
    return { ok: false, reason: 'unusable_output', message: notes[0] ?? 'No suppliers came back.' };
  }

  const { error: insertError } = await supabase.from('bm_vendor_candidates').insert(
    candidates.map((candidate) => ({
      event_id: args.eventId,
      category: args.category,
      name: candidate.name,
      summary: candidate.summary || null,
      website: candidate.website ?? null,
      phone: candidate.phone ?? null,
      email: candidate.email ?? null,
      address: candidate.address ?? null,
      source_url: candidate.sourceUrl ?? null,
    })),
  );
  if (insertError) {
    return { ok: false, reason: 'failed', message: 'Found suppliers, but could not save them.' };
  }

  return { ok: true, candidates, notes };
}

/** Open suggestions for an event — neither promoted nor dismissed. */
export async function fetchOpenCandidates(eventId: string): Promise<VendorCandidateRow[]> {
  const { data, error } = await supabase
    .from('bm_vendor_candidates')
    .select('*')
    .eq('event_id', eventId)
    .is('promoted_vendor_id', null)
    .eq('dismissed', false)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as VendorCandidateRow[];
}

export async function dismissCandidate(id: string): Promise<void> {
  const { error } = await supabase.from('bm_vendor_candidates').update({ dismissed: true }).eq('id', id);
  if (error) throw error;
}

/**
 * Turns a reviewed suggestion into a real vendor.
 *
 * This is the ONLY path from researched data into `bm_vendors`, and it is deliberately an explicit
 * human act rather than something the research step does itself. The new vendor starts at
 * `researching` — nothing about having been found on the web means anyone has spoken to them.
 */
export async function promoteCandidate(eventId: string, candidate: VendorCandidateRow): Promise<VendorRow> {
  const { data, error } = await supabase
    .from('bm_vendors')
    .insert({
      event_id: eventId,
      category: candidate.category,
      status: 'researching',
      name: candidate.name,
      website: candidate.website,
      phone: candidate.phone,
      email: candidate.email,
      address: candidate.address,
      // The provenance travels with the vendor: months later, "where did this come from?" has an
      // answer, and the summary was written by a model reading a page, not by the family.
      notes: [candidate.summary, candidate.source_url ? `Found at: ${candidate.source_url}` : null]
        .filter(Boolean)
        .join('\n\n') || null,
    })
    .select('*')
    .single();
  if (error) throw error;

  const vendor = data as VendorRow;

  const { error: linkError } = await supabase
    .from('bm_vendor_candidates')
    .update({ promoted_vendor_id: vendor.id })
    .eq('id', candidate.id);
  if (linkError) throw linkError;

  await logActivity({
    eventId,
    action: 'vendor_added_from_research',
    entityType: 'vendor',
    entityId: vendor.id,
    summary: `Added ${vendor.name} from research`,
  });

  return vendor;
}
