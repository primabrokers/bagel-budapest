import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseConfig';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'bm-planner-auth',
    // The default lock coordinates a token refresh across tabs via navigator.locks, which can
    // DEADLOCK a PWA tab: navigator.locks.request() waits for whichever tab currently holds the
    // lock to release it, and a tab that was closed uncleanly (swiped away, backgrounded and
    // killed by the OS mid-refresh) never releases it — every Supabase call in every other tab
    // then hangs forever waiting on a lock nobody will ever free. A pass-through lock — just run
    // the callback immediately, with no coordination at all — trades that unrecoverable deadlock
    // for the far smaller and well-understood risk of two tabs racing a token refresh at once,
    // which GoTrue's refresh flow already tolerates.
    lock: async (_name, _acquireTimeout, fn) => fn(),
  },
});
