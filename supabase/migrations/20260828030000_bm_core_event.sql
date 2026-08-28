-- Bar Mitzvah Planner — Migration 1: core event
--
-- New tables: bm_events, bm_event_members, bm_functions, bm_dashboard_prefs
-- New functions: bm_touch_updated_at(), bm_is_member(uuid)
-- Security: RLS enabled on all four tables; bm_is_member(event_id) gates every policy;
--   bm_event_members additionally lets a row see/claim itself via user_id = auth.uid().
--
-- This project shares this Supabase project with unrelated legacy data (sedarim, masechtos,
-- perakim, mishnayos, campaigns, luach_*). Every table/function/bucket created by this app is
-- prefixed bm_ so the two worlds never collide; nothing here touches the legacy tables.

create function public.bm_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.bm_events (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Bar Mitzvah',
  boy_name text not null,
  boy_hebrew_name text,
  parents_names text,
  event_date date not null,
  hebrew_date_override text,
  venue_name text,
  venue_address text,
  ceremony_time time,
  reception_time time,
  dinner_time time,
  dress_code text,
  theme text,
  palette jsonb not null default '{}'::jsonb,
  monogram_path text,
  logo_path text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

create table public.bm_event_members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  invited_email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bm_event_members_user_unique unique (event_id, user_id),
  constraint bm_event_members_email_unique unique (event_id, invited_email),
  constraint bm_event_members_identity_check check (user_id is not null or invited_email is not null)
);

create index bm_event_members_event_id_idx on public.bm_event_members(event_id);

create function public.bm_is_member(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bm_event_members
    where event_id = p_event and user_id = auth.uid()
  );
$$;

create table public.bm_functions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('friday_night','shabbos_morning','kiddush','lunch','shalosh_seudos','motzei_shabbos','party','other')),
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  dress_code text,
  hebrew_date_override text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bm_functions_event_id_idx on public.bm_functions(event_id);

create table public.bm_dashboard_prefs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  member_id uuid not null references public.bm_event_members(id) on delete cascade,
  widget_order text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bm_dashboard_prefs_member_unique unique (event_id, member_id)
);

create index bm_dashboard_prefs_event_id_idx on public.bm_dashboard_prefs(event_id);

create trigger bm_events_touch_updated_at
  before update on public.bm_events
  for each row execute function public.bm_touch_updated_at();

create trigger bm_event_members_touch_updated_at
  before update on public.bm_event_members
  for each row execute function public.bm_touch_updated_at();

create trigger bm_functions_touch_updated_at
  before update on public.bm_functions
  for each row execute function public.bm_touch_updated_at();

create trigger bm_dashboard_prefs_touch_updated_at
  before update on public.bm_dashboard_prefs
  for each row execute function public.bm_touch_updated_at();

alter table public.bm_events enable row level security;
create policy "bm_events select" on public.bm_events for select to authenticated using (bm_is_member(id));
create policy "bm_events insert" on public.bm_events for insert to authenticated with check (bm_is_member(id));
create policy "bm_events update" on public.bm_events for update to authenticated using (bm_is_member(id)) with check (bm_is_member(id));
create policy "bm_events delete" on public.bm_events for delete to authenticated using (bm_is_member(id));

alter table public.bm_event_members enable row level security;
create policy "bm_event_members select" on public.bm_event_members
  for select to authenticated
  using (user_id = auth.uid() or bm_is_member(event_id));
create policy "bm_event_members insert" on public.bm_event_members
  for insert to authenticated
  with check (bm_is_member(event_id));
create policy "bm_event_members update" on public.bm_event_members
  for update to authenticated
  using (user_id = auth.uid() or bm_is_member(event_id))
  with check (user_id = auth.uid() or bm_is_member(event_id));
create policy "bm_event_members delete" on public.bm_event_members
  for delete to authenticated
  using (bm_is_member(event_id));

alter table public.bm_functions enable row level security;
create policy "bm_functions select" on public.bm_functions for select to authenticated using (bm_is_member(event_id));
create policy "bm_functions insert" on public.bm_functions for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_functions update" on public.bm_functions for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_functions delete" on public.bm_functions for delete to authenticated using (bm_is_member(event_id));

alter table public.bm_dashboard_prefs enable row level security;
create policy "bm_dashboard_prefs select" on public.bm_dashboard_prefs for select to authenticated using (bm_is_member(event_id));
create policy "bm_dashboard_prefs insert" on public.bm_dashboard_prefs for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_dashboard_prefs update" on public.bm_dashboard_prefs for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_dashboard_prefs delete" on public.bm_dashboard_prefs for delete to authenticated using (bm_is_member(event_id));
