-- Bar Mitzvah Planner — Migration 14: researched vendor candidates
--
-- Results from `bm_ai_vendor_research` land HERE, never directly in bm_vendors.
--
-- That separation is the whole point of the table, and it is a security boundary rather than a
-- tidiness preference. The research function reads the open web through a model's search tool, so
-- every field below originates in text written by strangers — a supplier's own marketing page, a
-- directory listing, a review site, or something deliberately crafted to be read by an AI. Web
-- content is prompt-injectable. Writing it straight into the family's real vendor list would mean
-- a page could name itself as a booked supplier, or worse, put its own phone number where the
-- caterer's should be.
--
-- So: a candidate is a SUGGESTION a human reads and promotes. Nothing here is ever contacted
-- automatically, and promotion is an explicit act that copies the fields into bm_vendors.
--
-- source_url is kept for every candidate precisely so a person can check where a claim came from
-- before acting on it.

create table public.bm_vendor_candidates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  -- Matches bm_vendors.category (see lib/vendors/categories.ts) so promotion is a straight copy.
  category text not null,
  name text not null,
  summary text,
  website text,
  phone text,
  email text,
  address text,
  -- Where the model says it found this. Untrusted, like everything else here — displayed so a
  -- human can verify, never followed automatically.
  source_url text,
  -- Set once a human turns this into a real vendor, so the same suggestion is not offered twice
  -- and the research history stays readable.
  promoted_vendor_id uuid references public.bm_vendors(id) on delete set null,
  dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bm_vendor_candidates_event_id_idx on public.bm_vendor_candidates(event_id);
create index bm_vendor_candidates_open_idx on public.bm_vendor_candidates(event_id, category)
  where promoted_vendor_id is null and dismissed = false;

alter table public.bm_vendor_candidates enable row level security;
create policy "bm_vendor_candidates select" on public.bm_vendor_candidates for select to authenticated using (bm_is_member(event_id));
create policy "bm_vendor_candidates insert" on public.bm_vendor_candidates for insert to authenticated with check (bm_is_member(event_id));
-- Update IS allowed here, unlike the append-only logs: dismissing a suggestion and recording that
-- one was promoted are both edits to the candidate's own state, not rewrites of history.
create policy "bm_vendor_candidates update" on public.bm_vendor_candidates for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_vendor_candidates delete" on public.bm_vendor_candidates for delete to authenticated using (bm_is_member(event_id));

create trigger bm_vendor_candidates_touch
  before update on public.bm_vendor_candidates
  for each row execute function public.bm_touch_updated_at();
