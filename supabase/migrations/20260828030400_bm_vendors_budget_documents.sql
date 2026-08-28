-- Bar Mitzvah Planner — Migration 5: vendors, budget, documents
--
-- New tables: bm_vendors, bm_vendor_quotes, bm_expenses, bm_payments, bm_documents,
--   bm_document_links.
-- Security: RLS on all six, gated by bm_is_member(event_id).

create table public.bm_vendors (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  category text not null,
  status text not null default 'researching' check (status in ('researching','contacted','quote_received','shortlisted','booked','fully_paid','not_proceeding')),
  name text not null,
  contact_name text,
  phone text,
  email text,
  whatsapp text,
  website text,
  address text,
  quoted_price numeric(12,2),
  agreed_price numeric(12,2),
  deposit_amount numeric(12,2),
  deposit_due_date date,
  balance_due_date date,
  vat_registered boolean not null default false,
  rating int check (rating between 1 and 5),
  favourite boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bm_vendors_event_id_idx on public.bm_vendors(event_id);

create table public.bm_vendor_quotes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  vendor_id uuid not null references public.bm_vendors(id) on delete cascade,
  label text,
  amount numeric(12,2),
  includes text,
  valid_until date,
  received_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bm_vendor_quotes_event_id_idx on public.bm_vendor_quotes(event_id);
create index bm_vendor_quotes_vendor_id_idx on public.bm_vendor_quotes(vendor_id);

create table public.bm_expenses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  vendor_id uuid references public.bm_vendors(id) on delete set null,
  category text not null,
  description text,
  budgeted numeric(12,2),
  estimated numeric(12,2),
  quoted numeric(12,2),
  agreed numeric(12,2),
  vat_amount numeric(12,2),
  due_date date,
  payment_method text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bm_expenses_event_id_idx on public.bm_expenses(event_id);
create index bm_expenses_vendor_id_idx on public.bm_expenses(vendor_id);

create table public.bm_payments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  expense_id uuid not null references public.bm_expenses(id) on delete cascade,
  amount numeric(12,2) not null,
  status text not null default 'scheduled' check (status in ('scheduled','paid')),
  due_date date,
  paid_at date,
  method text check (method in ('bank_transfer','card','cash','cheque','other')),
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bm_payments_event_id_idx on public.bm_payments(event_id);
create index bm_payments_expense_id_idx on public.bm_payments(expense_id);

create table public.bm_documents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  folder text,
  name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  notes text,
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bm_documents_event_id_idx on public.bm_documents(event_id);

create table public.bm_document_links (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  document_id uuid not null references public.bm_documents(id) on delete cascade,
  entity_type text not null check (entity_type in ('vendor','expense','task','idea','function','household','menu_item')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  constraint bm_document_links_unique unique (document_id, entity_type, entity_id)
);

create index bm_document_links_event_id_idx on public.bm_document_links(event_id);
create index bm_document_links_entity_idx on public.bm_document_links(entity_type, entity_id);

create trigger bm_vendors_touch_updated_at
  before update on public.bm_vendors
  for each row execute function public.bm_touch_updated_at();

create trigger bm_vendor_quotes_touch_updated_at
  before update on public.bm_vendor_quotes
  for each row execute function public.bm_touch_updated_at();

create trigger bm_expenses_touch_updated_at
  before update on public.bm_expenses
  for each row execute function public.bm_touch_updated_at();

create trigger bm_payments_touch_updated_at
  before update on public.bm_payments
  for each row execute function public.bm_touch_updated_at();

create trigger bm_documents_touch_updated_at
  before update on public.bm_documents
  for each row execute function public.bm_touch_updated_at();

alter table public.bm_vendors enable row level security;
create policy "bm_vendors select" on public.bm_vendors for select to authenticated using (bm_is_member(event_id));
create policy "bm_vendors insert" on public.bm_vendors for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_vendors update" on public.bm_vendors for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_vendors delete" on public.bm_vendors for delete to authenticated using (bm_is_member(event_id));

alter table public.bm_vendor_quotes enable row level security;
create policy "bm_vendor_quotes select" on public.bm_vendor_quotes for select to authenticated using (bm_is_member(event_id));
create policy "bm_vendor_quotes insert" on public.bm_vendor_quotes for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_vendor_quotes update" on public.bm_vendor_quotes for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_vendor_quotes delete" on public.bm_vendor_quotes for delete to authenticated using (bm_is_member(event_id));

alter table public.bm_expenses enable row level security;
create policy "bm_expenses select" on public.bm_expenses for select to authenticated using (bm_is_member(event_id));
create policy "bm_expenses insert" on public.bm_expenses for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_expenses update" on public.bm_expenses for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_expenses delete" on public.bm_expenses for delete to authenticated using (bm_is_member(event_id));

alter table public.bm_payments enable row level security;
create policy "bm_payments select" on public.bm_payments for select to authenticated using (bm_is_member(event_id));
create policy "bm_payments insert" on public.bm_payments for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_payments update" on public.bm_payments for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_payments delete" on public.bm_payments for delete to authenticated using (bm_is_member(event_id));

alter table public.bm_documents enable row level security;
create policy "bm_documents select" on public.bm_documents for select to authenticated using (bm_is_member(event_id));
create policy "bm_documents insert" on public.bm_documents for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_documents update" on public.bm_documents for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_documents delete" on public.bm_documents for delete to authenticated using (bm_is_member(event_id));

alter table public.bm_document_links enable row level security;
create policy "bm_document_links select" on public.bm_document_links for select to authenticated using (bm_is_member(event_id));
create policy "bm_document_links insert" on public.bm_document_links for insert to authenticated with check (bm_is_member(event_id));
create policy "bm_document_links update" on public.bm_document_links for update to authenticated using (bm_is_member(event_id)) with check (bm_is_member(event_id));
create policy "bm_document_links delete" on public.bm_document_links for delete to authenticated using (bm_is_member(event_id));
