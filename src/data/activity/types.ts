/** Row type for `bm_activity_log` (migration 7). Insert-only for authenticated — there is no
 *  update/delete policy, by design (see that migration's header comment). */
export type ActivityActorKind = 'member' | 'rsvp_portal' | 'system';

export interface ActivityLogRow {
  id: string;
  event_id: string;
  actor_user_id: string | null;
  actor_kind: ActivityActorKind;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  summary: string | null;
  before: unknown;
  after: unknown;
  created_at: string;
}
