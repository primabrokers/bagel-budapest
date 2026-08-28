import { useFetch } from '../../lib/useFetch';
import { supabase } from '../../lib/supabase';
import type { DashboardPrefsRow } from './types';

/** `null` when this member hasn't saved a layout yet — a brand-new member has no prefs row, and
 *  that is a normal state, not an error. `resolveWidgetOrder` (components/dashboard/widgetRegistry)
 *  is what turns that into the default layout. */
export function useDashboardPrefs(memberId: string) {
  return useFetch<DashboardPrefsRow | null>(async () => {
    const { data, error } = await supabase
      .from('bm_dashboard_prefs')
      .select('*')
      .eq('member_id', memberId)
      .maybeSingle();
    if (error) throw error;
    return data as DashboardPrefsRow | null;
  }, [memberId]);
}
