import { supabase } from '../../lib/supabase';
import { logActivity } from '../activity/log';
import type { InvitationChannel, InvitationDesign, InvitationTemplateKind, InvitationTemplateRow } from './types';

/* -----------------------------------------------------------------------------------------------
   Templates
----------------------------------------------------------------------------------------------- */

export interface TemplateInput {
  kind: InvitationTemplateKind;
  name: string;
  design: InvitationDesign;
  is_default?: boolean;
}

export async function createTemplate(eventId: string, input: TemplateInput): Promise<InvitationTemplateRow> {
  const { data, error } = await supabase
    .from('bm_invitation_templates')
    .insert({ event_id: eventId, ...input })
    .select('*')
    .single();
  if (error) throw error;
  const row = data as InvitationTemplateRow;
  await logActivity({
    eventId,
    action: 'invitation_template_created',
    entityType: 'invitation_template',
    entityId: row.id,
    summary: `Added template: ${row.name}`,
    after: row,
  });
  return row;
}

export async function updateTemplate(id: string, patch: Partial<TemplateInput>): Promise<InvitationTemplateRow> {
  const { data, error } = await supabase.from('bm_invitation_templates').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  const row = data as InvitationTemplateRow;
  await logActivity({
    eventId: row.event_id,
    action: 'invitation_template_updated',
    entityType: 'invitation_template',
    entityId: row.id,
    summary: `Updated template: ${row.name}`,
    after: patch,
  });
  return row;
}

/** Confirm with the user before calling this — it does not ask itself. */
export async function deleteTemplate(id: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('bm_invitation_templates')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('bm_invitation_templates').delete().eq('id', id);
  if (error) throw error;

  if (existing) {
    const row = existing as InvitationTemplateRow;
    await logActivity({
      eventId: row.event_id,
      action: 'invitation_template_deleted',
      entityType: 'invitation_template',
      entityId: id,
      summary: `Removed template: ${row.name}`,
      before: row,
    });
  }
}

/**
 * Marks one template the default for its own `kind` (invitation vs save-the-date), clearing the
 * flag on every other template of that same kind first — `is_default` is a per-kind singleton,
 * not enforced by a DB constraint, so this function is the one place that invariant is upheld.
 */
export async function setDefaultTemplate(id: string): Promise<InvitationTemplateRow> {
  const { data: current, error: fetchError } = await supabase
    .from('bm_invitation_templates')
    .select('*')
    .eq('id', id)
    .single();
  if (fetchError) throw fetchError;
  const target = current as InvitationTemplateRow;

  const { error: clearError } = await supabase
    .from('bm_invitation_templates')
    .update({ is_default: false })
    .eq('event_id', target.event_id)
    .eq('kind', target.kind)
    .neq('id', id);
  if (clearError) throw clearError;

  const { data, error } = await supabase
    .from('bm_invitation_templates')
    .update({ is_default: true })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  const row = data as InvitationTemplateRow;

  await logActivity({
    eventId: row.event_id,
    action: 'invitation_template_set_default',
    entityType: 'invitation_template',
    entityId: id,
    summary: `Set "${row.name}" as the default ${row.kind === 'save_the_date' ? 'save-the-date' : 'invitation'}`,
  });
  return row;
}

/* -----------------------------------------------------------------------------------------------
   Send/reminder bookkeeping — both write from the AUTHENTICATED side (a family member choosing to
   send/nudge), which is why they go through the ordinary `supabase` client and `logActivity`
   rather than the public `bm_rsvp_track` RPC (that one is for the anonymous PORTAL's own
   "the guest clicked RSVP" event, and is only ever called through `supabasePublic`).
----------------------------------------------------------------------------------------------- */

/**
 * Records that an invitation was sent to a household: one `bm_invitations` row (so
 * `RsvpTrackerPage` can show which template/channel went out and when) plus a matching `'sent'`
 * `bm_invitation_events` row (so it appears on the same timeline the portal's own
 * opened/rsvp_clicked/completed events land on). `templateId` is nullable — the portal falls back
 * to a default design when a household has no real template resolved, and the same is true of a
 * link copied/shared without ever "choosing" a template.
 */
export async function recordInvitationSent(
  eventId: string,
  householdId: string,
  templateId: string | null,
  channel: InvitationChannel,
): Promise<void> {
  const { data, error } = await supabase
    .from('bm_invitations')
    .insert({ event_id: eventId, household_id: householdId, template_id: templateId, channel, sent_at: new Date().toISOString() })
    .select('id')
    .single();
  if (error) throw error;
  const invitation = data as { id: string };

  const { error: eventError } = await supabase
    .from('bm_invitation_events')
    .insert({ event_id: eventId, household_id: householdId, invitation_id: invitation.id, kind: 'sent', channel });
  if (eventError) throw eventError;

  await logActivity({
    eventId,
    action: 'invitation_sent',
    entityType: 'household',
    entityId: householdId,
    summary: `Sent an invitation via ${channel}`,
  });
}

/** A reminder is tracking-only — no new `bm_invitations` row, since it isn't a fresh invitation,
 *  just a nudge on the same one already sent. */
export async function recordReminderSent(eventId: string, householdId: string, channel: InvitationChannel): Promise<void> {
  const { error } = await supabase
    .from('bm_invitation_events')
    .insert({ event_id: eventId, household_id: householdId, invitation_id: null, kind: 'reminder_sent', channel });
  if (error) throw error;

  await logActivity({
    eventId,
    action: 'invitation_reminder_sent',
    entityType: 'household',
    entityId: householdId,
    summary: `Sent an RSVP reminder via ${channel}`,
  });
}
