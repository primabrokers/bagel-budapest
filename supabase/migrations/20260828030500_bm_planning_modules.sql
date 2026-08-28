-- Bar Mitzvah Planner — Migration 6: menu, tasks, ideas, notes, run sheet, contacts
--
-- New tables: bm_menus, bm_menu_sections, bm_menu_items, bm_idea_boards, bm_ideas, bm_tasks,
--   bm_notes, bm_schedule_items, bm_custom_contacts.
-- Security: RLS on all nine, gated by bm_is_member(event_id).
-- Note: bm_idea_boards/bm_ideas are created before bm_tasks so bm_tasks.idea_id can reference
-- bm_ideas directly, even though the plan doc lists tasks before ideas in prose.

create table public.bm_menus (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  function_id uuid references public.bm_functions(id) on delete set null,
  name text not null,
  version_label text,
  is_final boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bm_menus_event_id_idx on public.bm_menus(event_id);

create table public.bm_menu_sections (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  menu_id uuid not null references public.bm_menus(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bm_menu_sections_event_id_idx on public.bm_menu_sections(event_id);
create index bm_menu_sections_menu_id_idx on public.bm_menu_sections(menu_id);

create table public.bm_menu_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  section_id uuid not null references public.bm_menu_sections(id) on delete cascade,
  name text not null,
  description text,
  vendor_id uuid references public.bm_vendors(id) on delete set null,
  cost numeric(12,2),
  quantity int,
  serving_style text,
  allergens text[] not null default '{}'::text[],
  approved boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bm_menu_items_event_id_idx on public.bm_menu_items(event_id);
create index bm_menu_items_section_id_idx on public.bm_menu_items(section_id);

create table public.bm_idea_boards (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bm_idea_boards_event_id_idx on public.bm_idea_boards(event_id);

create table public.bm_ideas (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  board_id uuid not null references public.bm_idea_boards(id) on delete cascade,
  title text not null,
  description text,
  image_path text,
  source_url text,
  cost_estimate numeric(12,2),
  vendor_id uuid references public.bm_vendors(id) on delete set null,
  status text not null default 'inspiration' check (status in ('inspiration','considering','shortlisted','approved','purchased','rejected')),
  tags text[] not null default '{}'::text[],
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bm_ideas_event_id_idx on public.bm_ideas(event_id);
create index bm_ideas_board_id_idx on public.bm_ideas(board_id);

create table public.bm_tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  title text not null,
  category text,
  owner_member_id uuid references public.bm_event_members(id) on delete set null,
  due_date date,
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  status text not null default 'todo' check (status in ('todo','in_progress','waiting','done','cancelled')),
  vendor_id uuid references public.bm_vendors(id) on delete set null,
  guest_id uuid references public.bm_guests(id) on delete set null,
  idea_id uuid references public.bm_ideas(id) on delete set null,
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bm_tasks_event_id_idx on public.bm_tasks(event_id);

create table public.bm_notes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  title text,
  body text not null default '',
  pinned boolean not null default false,
  tags text[] not null default '{}'::text[],
  entity_type text check (entity_type in ('vendor','guest','household','idea','task','function')),
  entity_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bm_notes_event_id_idx on public.bm_notes(event_id);
create index bm_notes_entity_idx on public.bm_notes(entity_type, entity_id);

create table public.bm_schedule_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  function_id uuid references public.bm_functions(id) on delete set null,
  starts_at timestamptz,
  duration_minutes int,
  activity text not null,
  location text,
  responsible text,
  vendor_id uuid references public.bm_vendors(id) on delete set null,
  audience text not null default 'all' check (audience in ('all','organisers','vendors','family')),
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bm_schedule_items_event_id_idx on public.bm_schedule_items(event_id);

create table public.bm_custom_contacts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  name text not null,
  role text,
  phone text,
  email text,
  whatsapp text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bm_custom_contacts_event_id_idx on public.bm_custom_contacts(event_id);

create trigger bm_menus_touch_updated_at before update on public.bm_menus for each row execute function public.bm_touch_updated_at();
create trigger bm_menu_sections_touch_updated_at before update on public.bm_menu_sections for each row execute function public.bm_touch_updated_at();
create trigger bm_menu_items_touch_updated_at before update on public.bm_menu_items for each row execute function public.bm_touch_updated_at();
create trigger bm_idea_boards_touch_updated_at before update on public.bm_idea_boards for each row execute function public.bm_touch_updated_at();
create trigger bm_ideas_touch_updated_at before update on public.bm_ideas for each row execute function public.bm_touch_updated_at();
create trigger bm_tasks_touch_updated_at before update on public.bm_tasks for each row execute function public.bm_touch_updated_at();
create trigger bm_notes_touch_updated_at before update on public.bm_notes for each row execute function public.bm_touch_updated_at();
create trigger bm_schedule_items_touch_updated_at before update on public.bm_schedule_items for each row execute function public.bm_touch_updated_at();
create trigger bm_custom_contacts_touch_updated_at before update on public.bm_custom_contacts for each row execute function public.bm_touch_updated_at();

alter table public.bm_menus enable row level security;
create policy "bm_menus select" on public.bm_menus for select to authenticated using (bm_is_member(event_id));
create policy "bm_menus insert" on public.bm_menus for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_menus update" on public.bm_menus for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_menus delete" on public.bm_menus for delete to authenticated using (bm_is_member(event_id));

alter table public.bm_menu_sections enable row level security;
create policy "bm_menu_sections select" on public.bm_menu_sections for select to authenticated using (bm_is_member(event_id));
create policy "bm_menu_sections insert" on public.bm_menu_sections for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_menu_sections update" on public.bm_menu_sections for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_menu_sections delete" on public.bm_menu_sections for delete to authenticated using (bm_is_member(event_id));

alter table public.bm_menu_items enable row level security;
create policy "bm_menu_items select" on public.bm_menu_items for select to authenticated using (bm_is_member(event_id));
create policy "bm_menu_items insert" on public.bm_menu_items for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_menu_items update" on public.bm_menu_items for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_menu_items delete" on public.bm_menu_items for delete to authenticated using (bm_is_member(event_id));

alter table public.bm_idea_boards enable row level security;
create policy "bm_idea_boards select" on public.bm_idea_boards for select to authenticated using (bm_is_member(event_id));
create policy "bm_idea_boards insert" on public.bm_idea_boards for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_idea_boards update" on public.bm_idea_boards for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_idea_boards delete" on public.bm_idea_boards for delete to authenticated using (bm_is_member(event_id));

alter table public.bm_ideas enable row level security;
create policy "bm_ideas select" on public.bm_ideas for select to authenticated using (bm_is_member(event_id));
create policy "bm_ideas insert" on public.bm_ideas for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_ideas update" on public.bm_ideas for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_ideas delete" on public.bm_ideas for delete to authenticated using (bm_is_member(event_id));

alter table public.bm_tasks enable row level security;
create policy "bm_tasks select" on public.bm_tasks for select to authenticated using (bm_is_member(event_id));
create policy "bm_tasks insert" on public.bm_tasks for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_tasks update" on public.bm_tasks for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_tasks delete" on public.bm_tasks for delete to authenticated using (bm_is_member(event_id));

alter table public.bm_notes enable row level security;
create policy "bm_notes select" on public.bm_notes for select to authenticated using (bm_is_member(event_id));
create policy "bm_notes insert" on public.bm_notes for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_notes update" on public.bm_notes for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_notes delete" on public.bm_notes for delete to authenticated using (bm_is_member(event_id));

alter table public.bm_schedule_items enable row level security;
create policy "bm_schedule_items select" on public.bm_schedule_items for select to authenticated using (bm_is_member(event_id));
create policy "bm_schedule_items insert" on public.bm_schedule_items for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_schedule_items update" on public.bm_schedule_items for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_schedule_items delete" on public.bm_schedule_items for delete to authenticated using (bm_is_member(event_id));

alter table public.bm_custom_contacts enable row level security;
create policy "bm_custom_contacts select" on public.bm_custom_contacts for select to authenticated using (bm_is_member(event_id));
create policy "bm_custom_contacts insert" on public.bm_custom_contacts for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_custom_contacts update" on public.bm_custom_contacts for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_custom_contacts delete" on public.bm_custom_contacts for delete to authenticated using (bm_is_member(event_id));
