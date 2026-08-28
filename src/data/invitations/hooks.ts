import { useFetch } from '../../lib/useFetch';
import { supabase } from '../../lib/supabase';
import { useEventContext } from '../event/context';
import type { InvitationEventRow, InvitationTemplateRow, RsvpLinkRow } from './types';

/** Every `bm_rsvp_links` row for the current event, oldest first — one per household, auto-created
 *  by a DB trigger (see migration 3). `InvitationsPage`'s send list and `HouseholdSheet`'s RSVP-link
 *  affordance both key off this by `household_id`. */
export function useRsvpLinks() {
  const { eventId } = useEventContext();
  return useFetch<RsvpLinkRow[]>(async () => {
    const { data, error } = await supabase
      .from('bm_rsvp_links')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as RsvpLinkRow[];
  }, [eventId]);
}

/** Every `bm_invitation_templates` row for the current event, oldest first. */
export function useInvitationTemplates() {
  const { eventId } = useEventContext();
  return useFetch<InvitationTemplateRow[]>(async () => {
    const { data, error } = await supabase
      .from('bm_invitation_templates')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as InvitationTemplateRow[];
  }, [eventId]);
}

/**
 * `bm_invitation_events` for the current event, oldest first — every "sent"/"opened"/
 * "rsvp_clicked"/"completed"/"reminder_sent" row the public portal's own RPCs (`bm_rsvp_get`,
 * `bm_rsvp_track`) and this stage's send flow (`recordInvitationSent`/`recordReminderSent`) write.
 * `householdId` narrows to one household's own timeline (`RsvpTrackerPage`'s expanded row);
 * omitted, it's every event across the whole guest list (the tracker's own rollup counts).
 */
export function useInvitationEvents(householdId?: string) {
  const { eventId } = useEventContext();
  return useFetch<InvitationEventRow[]>(async () => {
    let query = supabase.from('bm_invitation_events').select('*').eq('event_id', eventId);
    if (householdId) query = query.eq('household_id', householdId);
    const { data, error } = await query.order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as InvitationEventRow[];
  }, [eventId, householdId]);
}
