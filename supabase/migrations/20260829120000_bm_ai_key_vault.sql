-- ============================================================================================
-- API keys, stored in Supabase Vault rather than anywhere this app can read back.
--
-- The family needs to be able to paste an Anthropic or Hugging Face key into Settings without a
-- developer setting a dashboard secret for them. That is a genuinely dangerous thing to build
-- carelessly: a provider key is a live billing credential, and this Supabase project is SHARED
-- with unrelated legacy data (sedarim, masechtos, luach_*, and whatever secrets that side keeps).
-- So the design below is deliberately narrow.
--
-- The boundary that actually protects the keys is not these functions — it is that `anon` and
-- `authenticated` have NO USAGE on the `vault` schema and no SELECT on `vault.decrypted_secrets`.
-- Verified live before this was written. A browser holding a perfectly valid family member's JWT
-- cannot read a secret by any route, because the role its token maps to cannot see the schema.
--
-- These two wrappers exist because an Edge Function reaches Postgres through PostgREST, which only
-- exposes `public`. They are therefore in `public` — and every one of the following is load-bearing:
--
--   * SECURITY DEFINER, owned by postgres, so they can cross into `vault`.
--   * EXECUTE revoked from public/anon/authenticated and granted ONLY to service_role. The service
--     role key exists solely in Edge Function environment variables; it is never in the browser
--     bundle. PostgREST refuses the RPC outright for any other role.
--   * A hard whitelist of secret NAMES. Even holding the service role key, this path can only
--     touch the five `bm_ai_*` entries below — it cannot read, overwrite or enumerate a secret
--     belonging to the legacy app sharing this project. That is the bm_ prefix rule applied to
--     the Vault.
--   * `search_path` pinned, so neither function can be redirected by a caller's search_path.
--
-- bm_ai_secret_get returns PLAINTEXT and is the most dangerous object in this migration. It is
-- separate from _set specifically so the grant on it can be reasoned about on its own.
-- ============================================================================================

-- --------------------------------------------------------------------------------------------
-- The whitelist. IMMUTABLE and inlined into both wrappers.
-- --------------------------------------------------------------------------------------------
create or replace function public.bm_ai_secret_allowed(p_name text)
returns boolean
language sql
immutable
as $$
  select p_name = any (array[
    'bm_ai_ANTHROPIC_API_KEY',
    'bm_ai_OPENAI_API_KEY',
    'bm_ai_XAI_API_KEY',
    'bm_ai_HF_TOKEN',
    'bm_ai_RESEND_API_KEY'
  ]);
$$;

comment on function public.bm_ai_secret_allowed(text) is
  'The only Vault secret names this app may touch. Everything else in the shared project is off limits.';

-- --------------------------------------------------------------------------------------------
-- Write. Creates the secret, or replaces the value if that name already exists.
-- --------------------------------------------------------------------------------------------
create or replace function public.bm_ai_secret_set(p_name text, p_secret text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
begin
  if not public.bm_ai_secret_allowed(p_name) then
    raise exception 'bm_ai_secret_set: % is not a secret this app may write.', p_name
      using errcode = '42501';
  end if;
  if p_secret is null or length(btrim(p_secret)) = 0 then
    raise exception 'bm_ai_secret_set: refusing to store an empty secret.' using errcode = '22023';
  end if;

  select id into v_id from vault.secrets where name = p_name;

  if v_id is null then
    perform vault.create_secret(p_secret, p_name, 'Bar Mitzvah Planner API key, set from Settings');
  else
    perform vault.update_secret(v_id, p_secret, p_name, 'Bar Mitzvah Planner API key, set from Settings');
  end if;
end;
$$;

-- --------------------------------------------------------------------------------------------
-- Read. Plaintext out — service_role only, and only for a whitelisted name.
-- --------------------------------------------------------------------------------------------
create or replace function public.bm_ai_secret_get(p_name text)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret text;
begin
  if not public.bm_ai_secret_allowed(p_name) then
    raise exception 'bm_ai_secret_get: % is not a secret this app may read.', p_name
      using errcode = '42501';
  end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = p_name;
  return v_secret;
end;
$$;

-- --------------------------------------------------------------------------------------------
-- Delete, so a key can be revoked from Settings rather than only replaced.
-- --------------------------------------------------------------------------------------------
create or replace function public.bm_ai_secret_clear(p_name text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  if not public.bm_ai_secret_allowed(p_name) then
    raise exception 'bm_ai_secret_clear: % is not a secret this app may remove.', p_name
      using errcode = '42501';
  end if;
  delete from vault.secrets where name = p_name;
end;
$$;

-- --------------------------------------------------------------------------------------------
-- Grants. The default for a new function is EXECUTE to PUBLIC, which for a SECURITY DEFINER
-- function crossing into the Vault would be catastrophic — so the revoke comes first and is not
-- optional.
-- --------------------------------------------------------------------------------------------
revoke all on function public.bm_ai_secret_set(text, text) from public, anon, authenticated;
revoke all on function public.bm_ai_secret_get(text) from public, anon, authenticated;
revoke all on function public.bm_ai_secret_clear(text) from public, anon, authenticated;
revoke all on function public.bm_ai_secret_allowed(text) from public, anon, authenticated;

grant execute on function public.bm_ai_secret_set(text, text) to service_role;
grant execute on function public.bm_ai_secret_get(text) to service_role;
grant execute on function public.bm_ai_secret_clear(text) to service_role;

-- ============================================================================================
-- What the family is allowed to SEE about their keys.
--
-- Deliberately a separate table from the Vault, holding no secret material: which keys are set,
-- the last four characters so a key can be told apart from another one at a glance, and who set
-- it when. This is what Settings reads. It is a mirror, so it is written only by the Edge
-- Function that writes the Vault — never by a browser.
-- ============================================================================================
create table if not exists public.bm_ai_key_status (
  name text primary key,
  -- Last four characters only. Enough to recognise a key, useless to anyone who steals the row.
  last4 text,
  is_set boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint bm_ai_key_status_name_allowed check (public.bm_ai_secret_allowed(name)),
  constraint bm_ai_key_status_last4_short check (last4 is null or length(last4) <= 4)
);

alter table public.bm_ai_key_status enable row level security;

-- Any signed-in family member may see WHICH keys are set. There is exactly one event in this
-- deployment and every member has full access (see FamilyAccessSection), so membership in any
-- event is the right test — and the row contains nothing secret in any case.
drop policy if exists "bm_ai_key_status select" on public.bm_ai_key_status;
create policy "bm_ai_key_status select"
  on public.bm_ai_key_status for select
  to authenticated
  using (exists (select 1 from public.bm_event_members m where m.user_id = auth.uid()));

-- No insert/update/delete policy for `authenticated` on purpose. The status row is written only
-- by the service role, in the same call that writes the Vault, so the two cannot drift apart by
-- a client editing one of them.

comment on table public.bm_ai_key_status is
  'Which provider API keys are set, for Settings to display. Holds no secret material — the keys themselves live in Supabase Vault and are readable only by service_role via bm_ai_secret_get().';
