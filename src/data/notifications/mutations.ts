import { supabase } from '../../lib/supabase';

/**
 * Marks one notification read for one member — upserts on `(event_id, member_id,
 * notification_key)`, the unique constraint migration 7 puts on this table, so marking the same
 * notification read twice updates the one row rather than erroring on a duplicate. Not logged to
 * `bm_activity_log`: a read receipt is bookkeeping for the badge/list, not a planning decision
 * worth an audit row (same reasoning as `data/dashboardPrefs/mutations.ts`'s own un-logged
 * widget-order save).
 */
export async function markNotificationRead(eventId: string, memberId: string, notificationKey: string): Promise<void> {
  const { error } = await supabase
    .from('bm_notification_reads')
    .upsert(
      { event_id: eventId, member_id: memberId, notification_key: notificationKey },
      { onConflict: 'event_id,member_id,notification_key' },
    );
  if (error) throw error;
}

/** "Mark all read" — every key in `notificationKeys` in one round trip. A no-op for an empty
 *  list rather than an empty upsert call. */
export async function markAllNotificationsRead(eventId: string, memberId: string, notificationKeys: string[]): Promise<void> {
  if (notificationKeys.length === 0) return;
  const { error } = await supabase
    .from('bm_notification_reads')
    .upsert(
      notificationKeys.map((notification_key) => ({ event_id: eventId, member_id: memberId, notification_key })),
      { onConflict: 'event_id,member_id,notification_key' },
    );
  if (error) throw error;
}
