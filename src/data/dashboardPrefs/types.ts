/** Row type for `bm_dashboard_prefs` (migration 1). One row per (event, member) — unique on that
 *  pair, upserted rather than inserted-then-updated. */
export interface DashboardPrefsRow {
  id: string;
  event_id: string;
  member_id: string;
  widget_order: string[];
  created_at: string;
  updated_at: string;
}
