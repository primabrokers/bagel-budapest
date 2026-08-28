import { useFetch } from '../../lib/useFetch';
import { supabase } from '../../lib/supabase';
import { useEventContext } from '../event/context';
import type { ScheduleItemRow } from './types';

/** Every run-sheet item for the current event, time-ordered — items with no `starts_at` yet sort
 *  after everything timed (Postgres's default NULLS LAST on an ascending order), then by
 *  `sort_order` for anything sharing a moment or equally untimed. `RunSheetPage` groups this by
 *  `function_id` itself. */
export function useScheduleItems() {
  const { eventId } = useEventContext();
  return useFetch<ScheduleItemRow[]>(async () => {
    const { data, error } = await supabase
      .from('bm_schedule_items')
      .select('*')
      .eq('event_id', eventId)
      .order('starts_at', { ascending: true })
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as ScheduleItemRow[];
  }, [eventId]);
}
