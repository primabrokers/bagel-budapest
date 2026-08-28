-- Bar Mitzvah Planner — Migration 11: AI usage ledger + generated-invitation asset bucket
--
-- Adds:
--   public.bm_ai_usage — one row per successful AI call, the ledger the `bm_ai_*` edge functions
--     meter against so a render loop or a bored teenager cannot run up an unbounded model bill.
--   storage bucket bm-invitation-assets (PUBLIC) — generated invitation imagery.
--
-- Two deliberate choices worth keeping:
--
-- 1. bm_ai_usage is APPEND-ONLY: select and insert for members, and no update or delete policy at
--    all. That is the whole point of it. A member who could delete their own usage rows could
--    reset the monthly cap at will, which would make the cap decorative rather than a control.
--    Same reasoning as bm_activity_log in migration 7.
--
-- 2. bm-invitation-assets is PUBLIC, mirroring bm-branding rather than bm-documents. An invitation
--    is opened by guests on /rsvp/:token who have no account and no session at all, so its imagery
--    has to be readable unauthenticated or every invitation renders with broken images. Writes are
--    still members-only, and the first path segment must be the event id — the same
--    storage.foldername(name)[1] convention every other bucket here uses.
--
--    Nothing private should ever be written to this bucket: treat anything placed here as world
--    readable by anyone who can guess or is given the URL.

create table public.bm_ai_usage (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  -- e.g. 'design:spec', 'design:html', 'image', 'video', 'vendor_research' — free text rather
  -- than a check constraint so a later stage can add a kind without a migration to widen an enum.
  kind text not null,
  provider text not null,
  model text not null,
  input_tokens int,
  output_tokens int,
  -- Null for a non-token call (an image render); recorded when the provider reports it, purely
  -- for after-the-fact attribution. The cap counts ROWS, not tokens — see usage.ts.
  created_at timestamptz not null default now()
);

create index bm_ai_usage_event_id_idx on public.bm_ai_usage(event_id);
-- The cap query is always "this event, since the start of this month", so the index that serves
-- it is the composite, not event_id alone.
create index bm_ai_usage_event_created_idx on public.bm_ai_usage(event_id, created_at desc);

alter table public.bm_ai_usage enable row level security;
create policy "bm_ai_usage select" on public.bm_ai_usage for select to authenticated using (bm_is_member(event_id));
create policy "bm_ai_usage insert" on public.bm_ai_usage for insert to authenticated with check (bm_is_member(event_id));
-- No update or delete policy, deliberately. See the header comment.

insert into storage.buckets (id, name, public)
values ('bm-invitation-assets', 'bm-invitation-assets', true)
on conflict (id) do nothing;

-- No select policy: the bucket is public, so reads are served without going through RLS at all —
-- exactly as bm-branding does. Writes stay members-only.
create policy "bm_invitation_assets storage insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bm-invitation-assets' and bm_is_member(((storage.foldername(name))[1])::uuid));
create policy "bm_invitation_assets storage update" on storage.objects
  for update to authenticated
  using (bucket_id = 'bm-invitation-assets' and bm_is_member(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'bm-invitation-assets' and bm_is_member(((storage.foldername(name))[1])::uuid));
create policy "bm_invitation_assets storage delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'bm-invitation-assets' and bm_is_member(((storage.foldername(name))[1])::uuid));
