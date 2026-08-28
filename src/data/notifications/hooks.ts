import { useFetch } from '../../lib/useFetch';
import { supabase } from '../../lib/supabase';
import { useEventContext } from '../event/context';
import type { NotificationReadRow } from './types';

/**
 * Every `bm_notification_reads` row for the CURRENT member only — read-state is per family
 * member, not shared across the family: one member dismissing a payment reminder should not hide
 * it from someone else who hasn't seen it yet.
 */
export function useNotificationReads() {
  const { eventId, memberId } = useEventContext();
  return useFetch<NotificationReadRow[]>(async () => {
    const { data, error } = await supabase
      .from('bm_notification_reads')
      .select('*')
      .eq('event_id', eventId)
      .eq('member_id', memberId);
    if (error) throw error;
    return (data ?? []) as NotificationReadRow[];
  }, [eventId, memberId]);
}
