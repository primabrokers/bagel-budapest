import { useFetch } from '../../lib/useFetch';
import { supabase } from '../../lib/supabase';
import { useEventContext } from './context';
import type { EventMemberRow, EventRow, FunctionRow } from './types';

/** The single `bm_events` row for the current event. */
export function useEvent() {
  const { eventId } = useEventContext();
  return useFetch<EventRow | null>(async () => {
    const { data, error } = await supabase.from('bm_events').select('*').eq('id', eventId).maybeSingle();
    if (error) throw error;
    return data as EventRow | null;
  }, [eventId]);
}

/** Every `bm_functions` row for the current event, in display order. */
export function useFunctions() {
  const { eventId } = useEventContext();
  return useFetch<FunctionRow[]>(async () => {
    const { data, error } = await supabase
      .from('bm_functions')
      .select('*')
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as FunctionRow[];
  }, [eventId]);
}

/** Every `bm_event_members` row for the current event — claimed and pending alike, oldest
 *  invited first. RLS lets any member see every row for their event (see migration 1), so this
 *  is the whole family's access list, not just the caller's own membership. */
export function useFamilyMembers() {
  const { eventId } = useEventContext();
  return useFetch<EventMemberRow[]>(async () => {
    const { data, error } = await supabase
      .from('bm_event_members')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as EventMemberRow[];
  }, [eventId]);
}
