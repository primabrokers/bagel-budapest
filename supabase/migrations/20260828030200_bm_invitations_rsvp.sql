-- Bar Mitzvah Planner — Migration 3: invitations & the public RSVP portal
--
-- New tables: bm_rsvp_links, bm_invitation_templates, bm_invitations, bm_invitation_events.
-- New functions: bm_create_rsvp_link_for_household() (trigger), bm_rsvp_get(token),
--   bm_rsvp_submit(token, payload), bm_rsvp_track(token, kind).
-- Security: RLS on all four tables, gated by bm_is_member(event_id) for authenticated members —
--   NO anon policies anywhere. The three RPCs are SECURITY DEFINER, EXECUTE revoked from
--   public and granted only to anon + authenticated, and are the *only* way an anonymous guest
--   reaches this data: they validate the token themselves and touch only that token's household.
--
-- bm_rsvp_submit records the 'completed' tracking event here but does NOT yet write to
-- bm_activity_log — that table doesn't exist until migration 7. Migration 7 CREATE OR REPLACEs
-- this function to add that line once its dependency exists, rather than reordering migrations.

create table public.bm_rsvp_links (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  household_id uuid not null references public.bm_households(id) on delete cascade,
  token text not null default encode(gen_random_bytes(16), 'hex'),
  revoked boolean not null default false,
  message_to_hosts text,
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bm_rsvp_links_household_unique unique (household_id),
  constraint bm_rsvp_links_token_unique unique (token)
);

create index bm_rsvp_links_event_id_idx on public.bm_rsvp_links(event_id);

create table public.bm_invitation_templates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  kind text not null check (kind in ('invitation','save_the_date')),
  name text not null,
  design jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bm_invitation_templates_event_id_idx on public.bm_invitation_templates(event_id);

create table public.bm_invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  household_id uuid not null references public.bm_households(id) on delete cascade,
  template_id uuid references public.bm_invitation_templates(id) on delete set null,
  channel text not null check (channel in ('link','whatsapp','email')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index bm_invitations_event_id_idx on public.bm_invitations(event_id);
create index bm_invitations_household_id_idx on public.bm_invitations(household_id);

create table public.bm_invitation_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  household_id uuid not null references public.bm_households(id) on delete cascade,
  invitation_id uuid references public.bm_invitations(id) on delete set null,
  kind text not null check (kind in ('created','sent','delivered','opened','rsvp_clicked','completed','reminder_sent')),
  channel text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index bm_invitation_events_event_id_idx on public.bm_invitation_events(event_id);
create index bm_invitation_events_household_id_idx on public.bm_invitation_events(household_id, kind, created_at);

create trigger bm_invitation_templates_touch_updated_at
  before update on public.bm_invitation_templates
  for each row execute function public.bm_touch_updated_at();

create trigger bm_rsvp_links_touch_updated_at
  before update on public.bm_rsvp_links
  for each row execute function public.bm_touch_updated_at();

create function public.bm_create_rsvp_link_for_household()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.bm_rsvp_links (event_id, household_id)
  values (new.event_id, new.id)
  on conflict (household_id) do nothing;
  return new;
end;
$$;

create trigger bm_households_create_rsvp_link
  after insert on public.bm_households
  for each row execute function public.bm_create_rsvp_link_for_household();

create function public.bm_rsvp_get(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.bm_rsvp_links;
  v_event public.bm_events;
  v_household public.bm_households;
  v_guests jsonb;
  v_functions jsonb;
  v_recent_open_count int;
begin
  select * into v_link from public.bm_rsvp_links where token = p_token and revoked = false;
  if v_link.id is null then
    return null;
  end if;

  select * into v_event from public.bm_events where id = v_link.event_id;
  select * into v_household from public.bm_households where id = v_link.household_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id,
    'name', f.name,
    'kind', f.kind,
    'starts_at', f.starts_at,
    'ends_at', f.ends_at,
    'location', f.location,
    'dress_code', f.dress_code,
    'hebrew_date_override', f.hebrew_date_override,
    'sort_order', f.sort_order
  ) order by f.sort_order), '[]'::jsonb)
  into v_functions
  from public.bm_functions f
  where f.event_id = v_link.event_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id,
    'first_name', g.first_name,
    'last_name', g.last_name,
    'guest_type', g.guest_type,
    'age', g.age,
    'dietary', g.dietary,
    'allergies', g.allergies,
    'meal_preference', g.meal_preference,
    'child_meal', g.child_meal,
    'high_chair', g.high_chair,
    'baby_seat', g.baby_seat,
    'accessibility', g.accessibility,
    'invites', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'function_id', gfi.function_id,
        'invited', gfi.invited,
        'rsvp', gfi.rsvp
      )), '[]'::jsonb)
      from public.bm_guest_function_invites gfi
      where gfi.guest_id = g.id
    )
  ) order by g.sort_order), '[]'::jsonb)
  into v_guests
  from public.bm_guests g
  where g.household_id = v_household.id;

  select count(*) into v_recent_open_count
  from public.bm_invitation_events
  where household_id = v_household.id
    and kind = 'opened'
    and created_at > now() - interval '60 minutes';

  if v_recent_open_count = 0 then
    insert into public.bm_invitation_events (event_id, household_id, kind, meta)
    values (v_link.event_id, v_household.id, 'opened', '{}'::jsonb);

    update public.bm_rsvp_links set last_opened_at = now() where id = v_link.id;
  end if;

  return jsonb_build_object(
    'event', jsonb_build_object(
      'title', v_event.title,
      'boy_name', v_event.boy_name,
      'boy_hebrew_name', v_event.boy_hebrew_name,
      'event_date', v_event.event_date,
      'hebrew_date_override', v_event.hebrew_date_override,
      'venue_name', v_event.venue_name,
      'venue_address', v_event.venue_address,
      'palette', v_event.palette,
      'monogram_path', v_event.monogram_path,
      'logo_path', v_event.logo_path
    ),
    'household', jsonb_build_object(
      'id', v_household.id,
      'name', v_household.name,
      'message_to_hosts', v_link.message_to_hosts
    ),
    'functions', v_functions,
    'guests', v_guests
  );
end;
$$;

create function public.bm_rsvp_submit(p_token text, p_payload jsonb)
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

  return public.bm_rsvp_get(p_token);
end;
$$;

create function public.bm_rsvp_track(p_token text, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.bm_rsvp_links;
begin
  if p_kind not in ('rsvp_clicked') then
    raise exception 'unsupported tracking kind: %', p_kind;
  end if;

  select * into v_link from public.bm_rsvp_links where token = p_token and revoked = false;
  if v_link.id is null then
    return;
  end if;

  insert into public.bm_invitation_events (event_id, household_id, kind)
  values (v_link.event_id, v_link.household_id, p_kind);
end;
$$;

revoke all on function public.bm_rsvp_get(text) from public;
revoke all on function public.bm_rsvp_submit(text, jsonb) from public;
revoke all on function public.bm_rsvp_track(text, text) from public;

grant execute on function public.bm_rsvp_get(text) to anon, authenticated;
grant execute on function public.bm_rsvp_submit(text, jsonb) to anon, authenticated;
grant execute on function public.bm_rsvp_track(text, text) to anon, authenticated;

alter table public.bm_rsvp_links enable row level security;
create policy "bm_rsvp_links select" on public.bm_rsvp_links for select to authenticated using (bm_is_member(event_id));
create policy "bm_rsvp_links insert" on public.bm_rsvp_links for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_rsvp_links update" on public.bm_rsvp_links for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_rsvp_links delete" on public.bm_rsvp_links for delete to authenticated using (bm_is_member(event_id));

alter table public.bm_invitation_templates enable row level security;
create policy "bm_invitation_templates select" on public.bm_invitation_templates for select to authenticated using (bm_is_member(event_id));
create policy "bm_invitation_templates insert" on public.bm_invitation_templates for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_invitation_templates update" on public.bm_invitation_templates for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_invitation_templates delete" on public.bm_invitation_templates for delete to authenticated using (bm_is_member(event_id));

alter table public.bm_invitations enable row level security;
create policy "bm_invitations select" on public.bm_invitations for select to authenticated using (bm_is_member(event_id));
create policy "bm_invitations insert" on public.bm_invitations for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_invitations update" on public.bm_invitations for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_invitations delete" on public.bm_invitations for delete to authenticated using (bm_is_member(event_id));

alter table public.bm_invitation_events enable row level security;
create policy "bm_invitation_events select" on public.bm_invitation_events for select to authenticated using (bm_is_member(event_id));
create policy "bm_invitation_events insert" on public.bm_invitation_events for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_invitation_events update" on public.bm_invitation_events for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_invitation_events delete" on public.bm_invitation_events for delete to authenticated using (bm_is_member(event_id));
