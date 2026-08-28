import { createClient } from '@supabase/supabase-js';

/*
  No real .env exists yet in this dev environment (only .env.example, per Stage 1) — so
  VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are undefined until someone adds one. createClient()
  validates its URL SYNCHRONOUSLY, at import time: an empty string throws "supabaseUrl is
  required.", and anything not matching `^https?://` throws "Invalid supabaseUrl". Passing the
  bare env vars straight through would therefore crash on every import of this module — the dev
  server, every test, every page — rather than failing only when a real network call is actually
  attempted, which is what a missing-credentials state should do. The placeholder host below
  satisfies the URL shape check and lets the app boot; a call made against it fails with an
  ordinary network error at the point a caller already has to handle one.
*/
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.invalid';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key';

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  // Deliberate: the one signal a developer gets that auth/data calls are talking to nothing
  // until a real .env is added.
  console.warn(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set (see .env.example) — the app will ' +
      'boot, but every Supabase call will fail until a real .env is added.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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
