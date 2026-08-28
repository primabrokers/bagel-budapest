import { useFetch } from '../../lib/useFetch';
import { supabase } from '../../lib/supabase';
import { useEventContext } from '../event/context';
import type { VendorWithQuotes } from './types';

/**
 * Every vendor for the current event, quotes embedded, alphabetical by name. `VendorsPage` keeps
 * this one cached list in memory and opens `VendorSheet`/`QuoteCompareSheet` from a row already
 * in it — a single-vendor `useVendor(id)` hook would only mean a second round trip for data this
 * list already has.
 */
export function useVendors() {
  const { eventId } = useEventContext();
  return useFetch<VendorWithQuotes[]>(async () => {
    const { data, error } = await supabase
      .from('bm_vendors')
      .select('*, quotes:bm_vendor_quotes(*)')
      .eq('event_id', eventId)
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as VendorWithQuotes[];
  }, [eventId]);
}
