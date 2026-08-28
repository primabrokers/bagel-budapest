import { supabase } from '../../lib/supabase';

/** Upserts on `(event_id, member_id)` — the unique constraint migration 1 puts on this table —
 *  so saving a layout twice updates the same row rather than erroring on a duplicate. */
export async function saveWidgetOrder(eventId: string, memberId: string, order: string[]): Promise<void> {
  const { error } = await supabase
    .from('bm_dashboard_prefs')
    .upsert(
      { event_id: eventId, member_id: memberId, widget_order: order },
      { onConflict: 'event_id,member_id' },
    );
  if (error) throw error;
}
