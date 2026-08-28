import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseConfig';

/**
 * A SEPARATE Supabase client for the public RSVP portal (`/rsvp/:token`) — the one screen in this
 * app an anonymous guest with no account reaches. It must never be the same client instance, or
 * share the same storage key, as `lib/supabase.ts`'s authenticated `supabase` client, for two
 * reasons:
 *
 *   1. A family member who is BOTH signed in (checking the planner on their own phone) and opens
 *      a guest's RSVP link in the same browser must not have the portal silently ride their own
 *      session — the portal calls three `SECURITY DEFINER` RPCs
 *      (`bm_rsvp_get`/`bm_rsvp_submit`/`bm_rsvp_track`, migration 3) that validate the token
 *      themselves and touch only that token's household; nothing about the portal should care who
 *      (if anyone) is authenticated in the tab.
 *   2. `persistSession`/`autoRefreshToken` are OFF and no `storageKey` is set — an anonymous guest
 *      opening a link has no session to persist or refresh in the first place, and leaving the
 *      defaults on would write anon-client localStorage clutter (a `supabase.auth.token`-shaped
 *      entry with nothing meaningful in it) into every guest's browser for no benefit.
 *
 * Only ever call the three `bm_rsvp_*` RPCs through THIS client — never through the authenticated
 * `supabase` client, and never call any other table/RPC through this one (anon has no table
 * policies anywhere in this schema; every other Supabase call in the app goes through
 * `lib/supabase.ts`).
 */
export const supabasePublic = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
