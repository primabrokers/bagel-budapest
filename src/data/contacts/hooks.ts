import { useFetch } from '../../lib/useFetch';
import { supabase } from '../../lib/supabase';
import { useEventContext } from '../event/context';
import type { CustomContactRow } from './types';

/** Every custom contact for the current event, alphabetical by name. `ContactsPage` merges this
 *  client-side with `useGuestBook()`'s households and `useVendors()`'s vendors into one list —
 *  no combined-fetch hook lives here, since each of those three is already independently
 *  loaded/cached by its own domain. */
export function useCustomContacts() {
  const { eventId } = useEventContext();
  return useFetch<CustomContactRow[]>(async () => {
    const { data, error } = await supabase
      .from('bm_custom_contacts')
      .select('*')
      .eq('event_id', eventId)
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as CustomContactRow[];
  }, [eventId]);
}
