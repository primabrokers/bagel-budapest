-- Bar Mitzvah Planner — Migration 4: seating planner
--
-- New tables: bm_seating_plans, bm_floor_objects, bm_seat_assignments, bm_seating_preferences.
-- Security: RLS on all four, gated by bm_is_member(event_id).

create table public.bm_seating_plans (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  function_id uuid references public.bm_functions(id) on delete set null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bm_seating_plans_event_id_idx on public.bm_seating_plans(event_id);

create table public.bm_floor_objects (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  plan_id uuid not null references public.bm_seating_plans(id) on delete cascade,
  kind text not null check (kind in ('table_round','table_long','table_rect','table_square','top_table','kids_table','dance_floor','stage','bar','buffet','entrance','custom')),
  label text,
  table_number int,
  capacity int,
  x numeric not null default 0,
  y numeric not null default 0,
  width numeric not null default 100,
  height numeric not null default 100,
  rotation numeric not null default 0,
  locked boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bm_floor_objects_event_id_idx on public.bm_floor_objects(event_id);
create index bm_floor_objects_plan_id_idx on public.bm_floor_objects(plan_id);

create table public.bm_seat_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  plan_id uuid not null references public.bm_seating_plans(id) on delete cascade,
  guest_id uuid not null references public.bm_guests(id) on delete cascade,
  object_id uuid not null references public.bm_floor_objects(id) on delete cascade,
  seat_index int,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bm_seat_assignments_unique unique (plan_id, guest_id)
);

create index bm_seat_assignments_event_id_idx on public.bm_seat_assignments(event_id);
create index bm_seat_assignments_object_id_idx on public.bm_seat_assignments(object_id);

create table public.bm_seating_preferences (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  guest_a uuid not null references public.bm_guests(id) on delete cascade,
  guest_b uuid not null references public.bm_guests(id) on delete cascade,
  rule text not null check (rule in ('must_together','prefer_together','keep_apart')),
  note text,
  created_at timestamptz not null default now(),
  constraint bm_seating_preferences_order_check check (guest_a < guest_b),
  constraint bm_seating_preferences_unique unique (event_id, guest_a, guest_b)
);

create index bm_seating_preferences_event_id_idx on public.bm_seating_preferences(event_id);

create trigger bm_seating_plans_touch_updated_at
  before update on public.bm_seating_plans
  for each row execute function public.bm_touch_updated_at();

create trigger bm_floor_objects_touch_updated_at
  before update on public.bm_floor_objects
  for each row execute function public.bm_touch_updated_at();

create trigger bm_seat_assignments_touch_updated_at
  before update on public.bm_seat_assignments
  for each row execute function public.bm_touch_updated_at();

alter table public.bm_seating_plans enable row level security;
create policy "bm_seating_plans select" on public.bm_seating_plans for select to authenticated using (bm_is_member(event_id));
create policy "bm_seating_plans insert" on public.bm_seating_plans for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_seating_plans update" on public.bm_seating_plans for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_seating_plans delete" on public.bm_seating_plans for delete to authenticated using (bm_is_member(event_id));

alter table public.bm_floor_objects enable row level security;
create policy "bm_floor_objects select" on public.bm_floor_objects for select to authenticated using (bm_is_member(event_id));
create policy "bm_floor_objects insert" on public.bm_floor_objects for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_floor_objects update" on public.bm_floor_objects for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_floor_objects delete" on public.bm_floor_objects for delete to authenticated using (bm_is_member(event_id));

alter table public.bm_seat_assignments enable row level security;
create policy "bm_seat_assignments select" on public.bm_seat_assignments for select to authenticated using (bm_is_member(event_id));
create policy "bm_seat_assignments insert" on public.bm_seat_assignments for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_seat_assignments update" on public.bm_seat_assignments for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_seat_assignments delete" on public.bm_seat_assignments for delete to authenticated using (bm_is_member(event_id));

alter table public.bm_seating_preferences enable row level security;
create policy "bm_seating_preferences select" on public.bm_seating_preferences for select to authenticated using (bm_is_member(event_id));
create policy "bm_seating_preferences insert" on public.bm_seating_preferences for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_seating_preferences update" on public.bm_seating_preferences for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_seating_preferences delete" on public.bm_seating_preferences for delete to authenticated using (bm_is_member(event_id));
