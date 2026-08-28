import { supabase } from '../../lib/supabase';

export interface ProvisionedEvent {
  eventId: string;
  memberId: string;
}

/**
 * Calls `bm_ensure_event_provisioned()` (migration 8) — the one entry point AppShell calls right
 * after every sign-in. See that migration's header comment for the full branch-by-branch
 * behaviour (claim an existing membership, claim an invite by email, seed the demo world for the
 * very first sign-in on this shared project, or return null).
 *
 * A non-null event id always already has a matching `bm_event_members` row for the current user —
 * the RPC creates one (the seed-demo-world branch) or requires one to already exist (the other two
 * success branches) before it can return that id at all — so the follow-up lookup below is
 * resolving an id that is guaranteed to exist, not probing for one that might not.
 *
 * Throws on any unexpected Supabase error, so AppShell's caller can decide how to surface it.
 * `null` is the only valid non-error outcome, meaning this account isn't linked to any event.
 */
export async function ensureEventProvisioned(): Promise<ProvisionedEvent | null> {
  const { data: eventId, error: rpcError } = await supabase.rpc('bm_ensure_event_provisioned');
  if (rpcError) throw rpcError;
  if (!eventId) return null;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) {
    throw new Error('bm_ensure_event_provisioned() returned an event but no user is signed in.');
  }

  const { data: memberRow, error: memberError } = await supabase
    .from('bm_event_members')
    .select('id')
    .eq('event_id', eventId as string)
    .eq('user_id', userId)
    .maybeSingle();
  if (memberError) throw memberError;
  if (!memberRow) {
    throw new Error('Provisioned event has no membership row for the current user.');
  }

  return { eventId: eventId as string, memberId: memberRow.id as string };
}
