/**
 * Row type for `bm_notification_reads` — see migration 7
 * (`supabase/migrations/20260828030600_bm_activity_notifications_storage.sql`) for the applied
 * schema this mirrors field-for-field. Hand-written, not generated — see CLAUDE.md's data-layer
 * note.
 *
 * Notifications themselves are never stored (see `lib/notifications/rules.ts`'s header comment)
 * — this row is only ever a read receipt: "member X has seen notification key Y".
 */
export interface NotificationReadRow {
  id: string;
  event_id: string;
  member_id: string;
  notification_key: string;
  read_at: string;
}
