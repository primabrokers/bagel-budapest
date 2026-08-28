-- Bar Mitzvah Planner — Migration 7: activity log, notification read-state, storage buckets
--
-- New tables: bm_activity_log (insert-only for authenticated — no update/delete policy exists,
--   so nothing short of the table owner can alter history), bm_notification_reads.
-- New storage buckets: bm-documents (private), bm-idea-images (private), bm-branding (public).
-- Storage RLS: authenticated CRUD scoped to bm_is_member() of the event_id encoded as the first
--   path segment of every upload (<event_id>/<uuid>-<filename>).
--
-- Also CREATE OR REPLACEs bm_rsvp_submit (from migration 3) to add the bm_activity_log insert
-- that table didn't exist for yet — see migration 3's header comment.

create table public.bm_activity_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  actor_user_id uuid,
  actor_kind text not null default 'member' check (actor_kind in ('member','rsvp_portal','system')),
  action text not null,
  entity_type text,
  entity_id uuid,
  summary text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index bm_activity_log_event_id_idx on public.bm_activity_log(event_id, created_at desc);

alter table public.bm_activity_log enable row level security;
create policy "bm_activity_log select" on public.bm_activity_log for select to authenticated using (bm_is_member(event_id));
create policy "bm_activity_log insert" on public.bm_activity_log for insert to authenticated with check (bm_is_member(event_id));

create table public.bm_notification_reads (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  member_id uuid not null references public.bm_event_members(id) on delete cascade,
  notification_key text not null,
  read_at timestamptz not null default now(),
  constraint bm_notification_reads_unique unique (event_id, member_id, notification_key)
);

create index bm_notification_reads_event_id_idx on public.bm_notification_reads(event_id);

alter table public.bm_notification_reads enable row level security;
create policy "bm_notification_reads select" on public.bm_notification_reads for select to authenticated using (bm_is_member(event_id));
create policy "bm_notification_reads insert" on public.bm_notification_reads for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_notification_reads update" on public.bm_notification_reads for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_notification_reads delete" on public.bm_notification_reads for delete to authenticated using (bm_is_member(event_id));

insert into storage.buckets (id, name, public)
values
  ('bm-documents', 'bm-documents', false),
  ('bm-idea-images', 'bm-idea-images', false),
  ('bm-branding', 'bm-branding', true)
on conflict (id) do nothing;

create policy "bm_documents storage select" on storage.objects
  for select to authenticated
  using (bucket_id = 'bm-documents' and bm_is_member(((storage.foldername(name))[1])::uuid));
create policy "bm_documents storage insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bm-documents' and bm_is_member(((storage.foldername(name))[1])::uuid));
create policy "bm_documents storage update" on storage.objects
  for update to authenticated
  using (bucket_id = 'bm-documents' and bm_is_member(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'bm-documents' and bm_is_member(((storage.foldername(name))[1])::uuid));
create policy "bm_documents storage delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'bm-documents' and bm_is_member(((storage.foldername(name))[1])::uuid));

create policy "bm_idea_images storage select" on storage.objects
  for select to authenticated
  using (bucket_id = 'bm-idea-images' and bm_is_member(((storage.foldername(name))[1])::uuid));
create policy "bm_idea_images storage insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bm-idea-images' and bm_is_member(((storage.foldername(name))[1])::uuid));
create policy "bm_idea_images storage update" on storage.objects
  for update to authenticated
  using (bucket_id = 'bm-idea-images' and bm_is_member(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'bm-idea-images' and bm_is_member(((storage.foldername(name))[1])::uuid));
create policy "bm_idea_images storage delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'bm-idea-images' and bm_is_member(((storage.foldername(name))[1])::uuid));

create policy "bm_branding storage insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bm-branding' and bm_is_member(((storage.foldername(name))[1])::uuid));
create policy "bm_branding storage update" on storage.objects
  for update to authenticated
  using (bucket_id = 'bm-branding' and bm_is_member(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'bm-branding' and bm_is_member(((storage.foldername(name))[1])::uuid));
create policy "bm_branding storage delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'bm-branding' and bm_is_member(((storage.foldername(name))[1])::uuid));

create or replace function public.bm_rsvp_submit(p_token text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.bm_rsvp_links;
  v_recent_event_count int;
  v_guest jsonb;
  v_invite jsonb;
  v_guest_id uuid;
begin
  if octet_length(p_payload::text) > 32768 then
    raise exception 'payload too large';
  end if;

  select * into v_link from public.bm_rsvp_links where token = p_token and revoked = false;
  if v_link.id is null then
    return null;
  end if;

  select count(*) into v_recent_event_count
  from public.bm_invitation_events
  where household_id = v_link.household_id
    and created_at > now() - interval '10 minutes';

  if v_recent_event_count > 30 then
    raise exception 'too many requests, please try again shortly';
  end if;

  if p_payload ? 'message_to_hosts' then
    update public.bm_rsvp_links
    set message_to_hosts = p_payload->>'message_to_hosts'
    where id = v_link.id;
  end if;

  for v_guest in select * from jsonb_array_elements(coalesce(p_payload->'guests', '[]'::jsonb))
  loop
    v_guest_id := (v_guest->>'guest_id')::uuid;

    update public.bm_guests
    set
      dietary = coalesce(v_guest->>'dietary', dietary),
      allergies = coalesce(v_guest->>'allergies', allergies),
      meal_preference = coalesce(v_guest->>'meal_preference', meal_preference),
      child_meal = coalesce((v_guest->>'child_meal')::boolean, child_meal),
      high_chair = coalesce((v_guest->>'high_chair')::boolean, high_chair),
      accessibility = coalesce(v_guest->>'accessibility', accessibility)
    where id = v_guest_id and household_id = v_link.household_id;

    if found then
      for v_invite in select * from jsonb_array_elements(coalesce(v_guest->'invites', '[]'::jsonb))
      loop
        update public.bm_guest_function_invites
        set rsvp = v_invite->>'rsvp', responded_at = now()
        where guest_id = v_guest_id
          and function_id = (v_invite->>'function_id')::uuid
          and invited = true;
      end loop;
    end if;
  end loop;

  insert into public.bm_invitation_events (event_id, household_id, kind, meta)
  values (v_link.event_id, v_link.household_id, 'completed', '{}'::jsonb);

  insert into public.bm_activity_log (event_id, actor_kind, action, entity_type, entity_id, summary)
  values (v_link.event_id, 'rsvp_portal', 'rsvp_submitted', 'household', v_link.household_id,
    'RSVP submitted via the guest portal');

  return public.bm_rsvp_get(p_token);
end;
$$;
