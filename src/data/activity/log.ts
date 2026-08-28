import { supabase } from '../../lib/supabase';

export interface LogActivityInput {
  eventId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  summary?: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Records one row in `bm_activity_log`. This is the ONE function every mutation module in this
 * app — guests, vendors, budget, tasks, and everything else in later stages, not just
 * `data/event` — calls after a meaningful change, so keep this signature exactly this
 * general-purpose rather than growing per-domain variants of it.
 *
 * Must never throw: a logging failure must never roll back or block the real mutation that
 * called it, so any error here — the insert itself, or resolving the current user — is caught
 * and only reported to the console.
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('bm_activity_log').insert({
      event_id: input.eventId,
      actor_user_id: userData.user?.id ?? null,
      actor_kind: 'member',
      action: input.action,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      summary: input.summary ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
    });
    if (error) throw error;
  } catch (error) {
    console.error('logActivity failed:', error);
  }
}
