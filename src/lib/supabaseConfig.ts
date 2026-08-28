/*
  The Supabase connection values, resolved once and shared by both clients in this app:
  `lib/supabase.ts` (the authenticated planner client) and `lib/supabasePublic.ts` (the anonymous
  RSVP-portal client). They live in their own module so the two clients agree on where they point
  without either importing the other — importing `lib/supabase.ts` for its constants would
  construct the authenticated client as a side effect, which is exactly what the public portal
  goes out of its way to avoid.

  `import.meta.env` takes precedence over the committed defaults, so setting VITE_SUPABASE_URL /
  VITE_SUPABASE_ANON_KEY at build time points a build at a different Supabase project without
  touching this file. The defaults exist because createClient() validates its URL SYNCHRONOUSLY at
  import time — an empty string throws "supabaseUrl is required.", anything not matching
  `^https?://` throws "Invalid supabaseUrl" — so with no value at all this module's consumers
  could not be imported at all: the dev server, every test and every page would crash on import
  rather than failing at the point a network call is actually made.

  Both defaults are safe to commit and safe to ship. `VITE_*` variables are inlined into the
  client bundle at build time, so anyone loading the deployed app can already read them in
  DevTools — committing them exposes nothing a browser could not already see. The anon key is
  Supabase's *publishable* key, designed for exactly this use; the security boundary is row-level
  security, not key secrecy. Every `bm_*` table has RLS enabled with policies scoping rows to the
  caller's event membership, so this key on its own reads nothing — verified against live data,
  where a privileged role saw the row while both `anon` and a signed-in-but-unaffiliated
  `authenticated` role saw zero.

  Never put a SERVICE ROLE key here. That one bypasses RLS entirely and belongs only in Edge
  Function secrets, never in anything Vite can inline into a browser bundle.
*/
const DEFAULT_SUPABASE_URL = 'https://qdofumucgrggpehrxvdr.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkb2Z1bXVjZ3JnZ3BlaHJ4dmRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0ODc3NjYsImV4cCI6MjA4NjA2Mzc2Nn0.F52YiCqf_CEh-S-eFxw6tsUzZuZofdooy2eIuBRM3Aw';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
