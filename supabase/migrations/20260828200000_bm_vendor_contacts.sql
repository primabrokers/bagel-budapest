-- Bar Mitzvah Planner — Migration 13: vendor contact history
--
-- bm_vendors already carries phone/email/whatsapp/website and a researching -> contacted -> ...
-- status, and ContactActions already offers tel:/wa.me/mailto: links. What was missing is a record
-- of what was actually SENT: with several family members chasing a dozen vendors, "did anyone ever
-- email the florist?" is the question the app could not answer.
--
-- Mirrors the bm_invitation_events pattern: an append-only log of outbound contact, one row per
-- send, RLS-gated on event membership.
--
-- Append-only, like bm_activity_log and bm_ai_usage: select and insert only, no update or delete
-- policy. A contact history someone can quietly edit is not a history. If a row is wrong the
-- correction is another row, which is also how a family would talk about it ("I emailed them
-- again on Tuesday").

create table public.bm_vendor_contacts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.bm_events(id) on delete cascade,
  vendor_id uuid not null references public.bm_vendors(id) on delete cascade,
  -- 'email' | 'whatsapp' | 'phone' | 'other'. Free text rather than a check constraint so a later
  -- channel does not need a migration to widen an enum.
  channel text not null,
  -- What was sent, kept so the next person can see the wording rather than guessing at it.
  subject text,
  body text,
  -- Who it went to at the time of sending. Denormalised deliberately: a vendor's email can change
  -- later, and the history should still say where the message actually went.
  sent_to text,
  sent_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index bm_vendor_contacts_event_id_idx on public.bm_vendor_contacts(event_id);
create index bm_vendor_contacts_vendor_idx on public.bm_vendor_contacts(vendor_id, created_at desc);

alter table public.bm_vendor_contacts enable row level security;
create policy "bm_vendor_contacts select" on public.bm_vendor_contacts for select to authenticated using (bm_is_member(event_id));
create policy "bm_vendor_contacts insert" on public.bm_vendor_contacts for insert to authenticated with check (bm_is_member(event_id));
-- No update or delete policy, deliberately. See the header comment.
