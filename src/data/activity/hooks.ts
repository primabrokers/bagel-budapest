import { useFetch } from '../../lib/useFetch';
import { supabase } from '../../lib/supabase';
import type { ActivityLogRow } from './types';

/**
 * The event's whole-event recent activity, newest first. `ActivityWidget` on the dashboard uses
 * this directly; `ActivityFeed` (Stage 10) can also render this whole-event view when mounted
 * with no `entityType`/`entityId`.
 */
export function useRecentActivity(eventId: string, limit = 8) {
  return useFetch<ActivityLogRow[]>(async () => {
    const { data, error } = await supabase
      .from('bm_activity_log')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as ActivityLogRow[];
  }, [eventId, limit]);
}

/**
 * One record's own history — a vendor's timeline, a guest's timeline, … — filtered by
 * `entity_type`/`entity_id` as well as `event_id`. What `ActivityFeed` renders when mounted for
 * one entity rather than the whole event. `entityId` of `''` (the caller's own record not yet
 * saved) matches nothing rather than throwing, the same guard `useEntityNotes` uses, so a caller
 * can call this unconditionally instead of branching on whether the record has been saved yet.
 */
export function useEntityActivity(eventId: string, entityType: string, entityId: string, limit = 50) {
  return useFetch<ActivityLogRow[]>(async () => {
    if (!entityId) return [];
    const { data, error } = await supabase
      .from('bm_activity_log')
      .select('*')
      .eq('event_id', eventId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as ActivityLogRow[];
  }, [eventId, entityType, entityId, limit]);
}
