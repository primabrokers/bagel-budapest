import { useFetch } from '../../lib/useFetch';
import { supabase } from '../../lib/supabase';
import { useEventContext } from '../event/context';
import type { NoteEntityType, NoteRow } from './types';

/** Every note for the current event, pinned first and then newest-edited first within each
 *  group — the ordering `NotesPage` renders directly. Includes entity-linked notes as well as
 *  freestanding ones; `NotesPage` shows a small badge on the former rather than filtering them
 *  out, since a family member browsing Notes may well be looking for one they left on a vendor. */
export function useNotes() {
  const { eventId } = useEventContext();
  return useFetch<NoteRow[]>(async () => {
    const { data, error } = await supabase
      .from('bm_notes')
      .select('*')
      .eq('event_id', eventId)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as NoteRow[];
  }, [eventId]);
}

/** Every note attached to one specific record (a vendor, a guest, an idea, …), pinned first —
 *  what `EntityNotes` renders when dropped into that record's own sheet. `entityId` of `''`
 *  (the caller's own record not yet saved, or the sheet not yet open) matches nothing rather than
 *  throwing, so `EntityNotes` can call this unconditionally instead of guarding the hook call. */
export function useEntityNotes(entityType: NoteEntityType, entityId: string) {
  return useFetch<NoteRow[]>(async () => {
    if (!entityId) return [];
    const { data, error } = await supabase
      .from('bm_notes')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as NoteRow[];
  }, [entityType, entityId]);
}
