import { useFetch } from '../../lib/useFetch';
import { supabase } from '../../lib/supabase';
import { useEventContext } from '../event/context';
import type { ExpenseWithPayments } from './types';

/** Every expense line for the current event, payments embedded, grouped alphabetically by
 *  category at the source — `lib/budget/maths.ts`'s roll-ups re-group as needed from this one
 *  cached list. */
export function useExpenses() {
  const { eventId } = useEventContext();
  return useFetch<ExpenseWithPayments[]>(async () => {
    const { data, error } = await supabase
      .from('bm_expenses')
      .select('*, payments:bm_payments(*)')
      .eq('event_id', eventId)
      .order('category', { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as ExpenseWithPayments[];
  }, [eventId]);
}
