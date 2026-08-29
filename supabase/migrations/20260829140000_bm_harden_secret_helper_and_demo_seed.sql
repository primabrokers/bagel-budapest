-- Two findings from the database linter, both worth closing now that more people will have logins.

-- 1. bm_ai_secret_allowed had a role-mutable search_path. It is SECURITY INVOKER and IMMUTABLE, so
--    the exposure is smaller than for the wrappers around it — but it is called from inside those
--    SECURITY DEFINER wrappers AND from bm_ai_key_status's CHECK constraint, which is exactly the
--    kind of place a resolution surprise should be impossible rather than merely unlikely.
create or replace function public.bm_ai_secret_allowed(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_name = any (array[
    'bm_ai_ANTHROPIC_API_KEY',
    'bm_ai_OPENAI_API_KEY',
    'bm_ai_XAI_API_KEY',
    'bm_ai_HF_TOKEN',
    'bm_ai_RESEND_API_KEY'
  ]);
$$;

revoke all on function public.bm_ai_secret_allowed(text) from public, anon, authenticated;

-- 2. bm_seed_demo_event was executable by any signed-in user through /rest/v1/rpc. That means any
--    account — including the family members now being invited — could call it directly and inject
--    the entire fictional demo world (Daniel at The Grove, its guests, vendors and tasks) back into
--    a database it was just cleared out of. Nothing legitimate calls it that way.
--
--    Revoking is safe: its only real caller is bm_ensure_event_provisioned(), which is SECURITY
--    DEFINER and owned by postgres, so the inner call is authorised as the owner rather than as
--    whoever signed in. First-sign-in provisioning is unaffected — verified against the live
--    database: authenticated and anon both lose EXECUTE, the owning role keeps it.
revoke all on function public.bm_seed_demo_event(uuid) from public, anon, authenticated;
