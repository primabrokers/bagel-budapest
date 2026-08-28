import { useFetch } from '../../lib/useFetch';
import { supabase } from '../../lib/supabase';
import { useEventContext } from '../event/context';
import type { TaskRow } from './types';

/**
 * Every `bm_tasks` row for the current event. Ordered by due date ascending with tasks that have
 * no due date sorted last (`nullsFirst: false`) — the ordering every list/kanban/calendar view in
 * `TasksPage` and both dashboard task widgets read as their starting point, so a task with a date
 * always outranks one without when the two are otherwise tied.
 */
export function useTasks() {
  const { eventId } = useEventContext();
  return useFetch<TaskRow[]>(async () => {
    const { data, error } = await supabase
      .from('bm_tasks')
      .select('*')
      .eq('event_id', eventId)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as TaskRow[];
  }, [eventId]);
}
