-- Invoice extraction is staged; only the reviewed save RPC changes the ledger.
create or replace function public.bm_ai_secret_allowed(p_name text)
returns boolean language sql immutable set search_path = '' as $$
  select p_name = any (array['bm_ai_ANTHROPIC_API_KEY','bm_ai_OPENAI_API_KEY',
    'bm_ai_XAI_API_KEY','bm_ai_HF_TOKEN','bm_ai_RESEND_API_KEY','bm_ai_MIXEDBREAD_API_KEY']);
$$;
revoke all on function public.bm_ai_secret_allowed(text) from public, anon, authenticated;

create table public.bm_invoice_imports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  document_id uuid not null references public.bm_documents(id) on delete restrict,
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'starting' check (status in ('starting','processing','review','saved','failed')),
  provider_file_id text,
  provider_job_id text,
  attempts integer not null default 1,
  extracted jsonb,
  reviewed jsonb,
  warnings jsonb not null default '[]',
  vendor_id uuid references public.bm_vendors(id) on delete restrict,
  expense_id uuid references public.bm_expenses(id) on delete restrict,
  invoice_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, source_hash)
);
create index bm_invoice_imports_document_idx on public.bm_invoice_imports(document_id);
create index bm_invoice_imports_expense_idx on public.bm_invoice_imports(expense_id);
create unique index bm_invoice_imports_invoice_unique on public.bm_invoice_imports(event_id, vendor_id, lower(btrim(invoice_number)))
  where status = 'saved' and nullif(btrim(invoice_number), '') is not null;
alter table public.bm_invoice_imports enable row level security;
create policy "bm_invoice_imports select" on public.bm_invoice_imports for select to authenticated using (public.bm_is_member(event_id));
revoke all on public.bm_invoice_imports from anon, authenticated;
grant select on public.bm_invoice_imports to authenticated;
grant all on public.bm_invoice_imports to service_role;
create trigger bm_invoice_imports_touch_updated_at before update on public.bm_invoice_imports
  for each row execute function public.bm_touch_updated_at();

-- SECURITY DEFINER is required because clients cannot write staging/provider columns.
-- Lock + membership + same-event checks precede every write. Retries return the same receipt.
create function public.bm_save_invoice(p_import_id uuid, p_draft jsonb, p_category text,
  p_vendor_id uuid default null, p_expense_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_import public.bm_invoice_imports;
  v_vendor uuid;
  v_expense uuid;
  v_total numeric;
  v_net numeric;
  v_vat numeric;
  v_notes text;
begin
  select * into v_import from public.bm_invoice_imports where id = p_import_id for update;
  if not found or auth.uid() is null or not public.bm_is_member(v_import.event_id) then
    raise exception 'Invoice not accessible' using errcode = '42501';
  end if;
  if v_import.status = 'saved' then
    return jsonb_build_object('vendor_id', v_import.vendor_id, 'expense_id', v_import.expense_id);
  end if;
  if v_import.status <> 'review' then raise exception 'Invoice is not ready for review'; end if;
  if jsonb_typeof(p_draft) <> 'object' or length(p_draft::text) > 150000 then raise exception 'Invalid invoice details'; end if;
  if nullif(btrim(p_draft->>'vendor_name'), '') is null or nullif(btrim(p_category), '') is null then raise exception 'Supplier and category are required'; end if;
  if p_draft->>'currency' is distinct from 'GBP' then raise exception 'Only GBP invoices are supported'; end if;
  v_total := (p_draft->>'total')::numeric;
  v_net := (p_draft->>'net_amount')::numeric;
  v_vat := (p_draft->>'vat_amount')::numeric;
  if v_total is null or v_total < 0 or v_total >= 10000000000 or v_total <> round(v_total, 2) then raise exception 'Invalid invoice total'; end if;
  if v_net < 0 or v_vat < 0 or v_net >= 10000000000 or v_vat >= 10000000000 then raise exception 'Invalid net or VAT amount'; end if;
  if v_net is not null and v_vat is not null and round(v_net,2) + round(v_vat,2) <> v_total then raise exception 'Net plus VAT must equal invoice total'; end if;
  if not exists (select 1 from public.bm_documents where id = v_import.document_id and event_id = v_import.event_id) then raise exception 'Source document not accessible'; end if;
  if p_vendor_id is not null then
    select id into v_vendor from public.bm_vendors where id = p_vendor_id and event_id = v_import.event_id for update;
    if not found then raise exception 'Vendor not accessible' using errcode = '42501'; end if;
  else
    -- Serialise new supplier creation for this event, including concurrent imports.
    perform pg_advisory_xact_lock(hashtextextended(v_import.event_id::text, 0));
    if exists (select 1 from public.bm_vendors where event_id = v_import.event_id and lower(btrim(name)) = lower(btrim(p_draft->>'vendor_name'))) then
      raise exception 'A supplier with this name already exists. Select the existing supplier.';
    end if;
    insert into public.bm_vendors(event_id, category, name, contact_name, email, phone, website, address, notes)
    values (v_import.event_id, p_category, p_draft->>'vendor_name', nullif(p_draft->>'contact_name',''),
      nullif(p_draft->>'email',''), nullif(p_draft->>'phone',''), nullif(p_draft->>'website',''), nullif(p_draft->>'address',''),
      concat_ws(E'\n', nullif('VAT: ' || nullif(p_draft->>'vat_number',''), ''), nullif('Company: ' || nullif(p_draft->>'company_number',''), '')))
    returning id into v_vendor;
  end if;
  if exists (select 1 from public.bm_invoice_imports where event_id = v_import.event_id and vendor_id = v_vendor
    and status = 'saved' and lower(btrim(invoice_number)) = lower(nullif(btrim(p_draft->>'invoice_number'),''))) then
    raise exception 'This invoice number is already saved for this supplier';
  end if;
  v_notes := concat_ws(E'\n\n', 'Invoice: ' || coalesce(nullif(p_draft->>'invoice_number',''), '(no number)'),
    'Invoice date: ' || nullif(p_draft->>'invoice_date',''), nullif(p_draft->>'line_items',''),
    'Payment terms: ' || nullif(p_draft->>'payment_terms',''), 'Payment details: ' || nullif(p_draft->>'bank_details',''),
    'Printed paid amount (not yet logged): ' || nullif(p_draft->>'reported_paid',''),
    'Printed balance: ' || nullif(p_draft->>'reported_balance',''), nullif(p_draft->>'notes',''));
  if p_expense_id is not null then
    select id into v_expense from public.bm_expenses where id = p_expense_id and event_id = v_import.event_id and vendor_id = v_vendor for update;
    if not found then raise exception 'Expense must belong to this supplier and event'; end if;
    if exists (select 1 from public.bm_invoice_imports where expense_id = v_expense and status = 'saved') then raise exception 'This expense already has an invoice'; end if;
    update public.bm_expenses set agreed = v_total, vat_amount = v_vat,
      due_date = nullif(p_draft->>'due_date','')::date, notes = concat_ws(E'\n\n', notes, v_notes)
      where id = v_expense;
  else
    insert into public.bm_expenses(event_id, vendor_id, category, description, agreed, vat_amount, due_date, notes)
    values (v_import.event_id, v_vendor, p_category, coalesce(nullif(p_draft->>'description',''), 'Invoice ' || coalesce(p_draft->>'invoice_number','')),
      v_total, v_vat, nullif(p_draft->>'due_date','')::date, v_notes) returning id into v_expense;
  end if;
  insert into public.bm_document_links(event_id, document_id, entity_type, entity_id)
  values (v_import.event_id, v_import.document_id, 'vendor', v_vendor), (v_import.event_id, v_import.document_id, 'expense', v_expense)
  on conflict (document_id, entity_type, entity_id) do nothing;
  update public.bm_invoice_imports set status = 'saved', reviewed = p_draft, vendor_id = v_vendor,
    expense_id = v_expense, invoice_number = nullif(btrim(p_draft->>'invoice_number'),'') where id = p_import_id;
  insert into public.bm_activity_log(event_id, actor_user_id, action, entity_type, entity_id, summary)
  values (v_import.event_id, auth.uid(), 'invoice_imported', 'expense', v_expense, 'Imported reviewed vendor invoice');
  return jsonb_build_object('vendor_id', v_vendor, 'expense_id', v_expense);
end;
$$;
revoke all on function public.bm_save_invoice(uuid,jsonb,text,uuid,uuid) from public, anon;
grant execute on function public.bm_save_invoice(uuid,jsonb,text,uuid,uuid) to authenticated;
