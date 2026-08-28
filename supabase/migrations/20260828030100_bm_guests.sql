-- Bar Mitzvah Planner — Migration 2: guests
--
-- New tables: bm_households, bm_guests, bm_tags, bm_household_tags, bm_guest_tags,
--   bm_guest_function_invites.
-- Security: RLS enabled on all six; every policy gated by bm_is_member(event_id).

create table public.bm_households (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  name text not null,
  main_contact_name text,
  address_lines text,
  postcode text,
  email text,
  phone text,
  whatsapp text,
  category text,
  side_of_family text check (side_of_family in ('father','mother','both','friends','community','other')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

create index bm_households_event_id_idx on public.bm_households(event_id);

create table public.bm_guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  household_id uuid not null references public.bm_households(id) on delete cascade,
  first_name text not null,
  last_name text,
  guest_type text not null check (guest_type in ('adult','child')),
  age int,
  gender text,
  dietary text,
  allergies text,
  meal_preference text check (meal_preference in ('standard','vegetarian','vegan','gluten_free','other')),
  child_meal boolean not null default false,
  high_chair boolean not null default false,
  baby_seat boolean not null default false,
  accessibility text,
  relationship text,
  is_vip boolean not null default false,
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bm_guests_event_id_idx on public.bm_guests(event_id);
create index bm_guests_household_id_idx on public.bm_guests(household_id);

create table public.bm_tags (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  name text not null,
  colour text,
  is_builtin boolean not null default false,
  created_at timestamptz not null default now(),
  constraint bm_tags_event_name_unique unique (event_id, name)
);

create table public.bm_household_tags (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  household_id uuid not null references public.bm_households(id) on delete cascade,
  tag_id uuid not null references public.bm_tags(id) on delete cascade,
  constraint bm_household_tags_unique unique (household_id, tag_id)
);

create index bm_household_tags_event_id_idx on public.bm_household_tags(event_id);

create table public.bm_guest_tags (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  guest_id uuid not null references public.bm_guests(id) on delete cascade,
  tag_id uuid not null references public.bm_tags(id) on delete cascade,
  constraint bm_guest_tags_unique unique (guest_id, tag_id)
);

create index bm_guest_tags_event_id_idx on public.bm_guest_tags(event_id);

create table public.bm_guest_function_invites (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  guest_id uuid not null references public.bm_guests(id) on delete cascade,
  function_id uuid not null references public.bm_functions(id) on delete cascade,
  invited boolean not null default true,
  rsvp text not null default 'awaiting' check (rsvp in ('awaiting','attending','declined','unsure')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bm_guest_function_invites_unique unique (guest_id, function_id)
);

create index bm_guest_function_invites_event_id_idx on public.bm_guest_function_invites(event_id);
create index bm_guest_function_invites_function_id_idx on public.bm_guest_function_invites(function_id);

create trigger bm_households_touch_updated_at
  before update on public.bm_households
  for each row execute function public.bm_touch_updated_at();

create trigger bm_guests_touch_updated_at
  before update on public.bm_guests
  for each row execute function public.bm_touch_updated_at();

create trigger bm_guest_function_invites_touch_updated_at
  before update on public.bm_guest_function_invites
  for each row execute function public.bm_touch_updated_at();

alter table public.bm_households enable row level security;
create policy "bm_households select" on public.bm_households for select to authenticated using (bm_is_member(event_id));
create policy "bm_households insert" on public.bm_households for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_households update" on public.bm_households for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_households delete" on public.bm_households for delete to authenticated using (bm_is_member(event_id));

alter table public.bm_guests enable row level security;
create policy "bm_guests select" on public.bm_guests for select to authenticated using (bm_is_member(event_id));
create policy "bm_guests insert" on public.bm_guests for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_guests update" on public.bm_guests for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_guests delete" on public.bm_guests for delete to authenticated using (bm_is_member(event_id));

alter table public.bm_tags enable row level security;
create policy "bm_tags select" on public.bm_tags for select to authenticated using (bm_is_member(event_id));
create policy "bm_tags insert" on public.bm_tags for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_tags update" on public.bm_tags for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_tags delete" on public.bm_tags for delete to authenticated using (bm_is_member(event_id));

alter table public.bm_household_tags enable row level security;
create policy "bm_household_tags select" on public.bm_household_tags for select to authenticated using (bm_is_member(event_id));
create policy "bm_household_tags insert" on public.bm_household_tags for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_household_tags update" on public.bm_household_tags for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_household_tags delete" on public.bm_household_tags for delete to authenticated using (bm_is_member(event_id));

alter table public.bm_guest_tags enable row level security;
create policy "bm_guest_tags select" on public.bm_guest_tags for select to authenticated using (bm_is_member(event_id));
create policy "bm_guest_tags insert" on public.bm_guest_tags for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_guest_tags update" on public.bm_guest_tags for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_guest_tags delete" on public.bm_guest_tags for delete to authenticated using (bm_is_member(event_id));

alter table public.bm_guest_function_invites enable row level security;
create policy "bm_guest_function_invites select" on public.bm_guest_function_invites for select to authenticated using (bm_is_member(event_id));
create policy "bm_guest_function_invites insert" on public.bm_guest_function_invites for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_guest_function_invites update" on public.bm_guest_function_invites for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_guest_function_invites delete" on public.bm_guest_function_invites for delete to authenticated using (bm_is_member(event_id));
