-- Bar Mitzvah Planner — Migration 9: harden function grants + fix search_path
--
-- get_advisors (security) after migration 8 flagged:
--  - bm_touch_updated_at: mutable search_path (no SET clause) — fixed via CREATE OR REPLACE.
--    Not SECURITY DEFINER and not flagged for anon/authenticated reachability, since a trigger
--    function errors if invoked directly ("trigger functions can only be called as triggers"),
--    which is why it got no grant changes here, only the search_path fix.
--  - bm_is_member: SECURITY DEFINER, used inside every table's RLS policy
--    (USING (bm_is_member(event_id))). The `authenticated` role's EXECUTE grant on this
--    function is LOAD-BEARING — every query against a bm_* table evaluates this function as
--    part of RLS, and revoking authenticated's access here would break every table in the
--    schema. Only `anon`'s reachability (an unintended side effect of the default post-CREATE
--    PUBLIC EXECUTE grant never having been revoked) is removed; authenticated's grant is kept
--    (and re-stated explicitly, to leave nothing implicit).
--  - bm_create_rsvp_link_for_household: a trigger function with no legitimate direct caller —
--    same "errors if called directly" property as bm_touch_updated_at, so revoking every role's
--    EXECUTE here does not affect the trigger actually firing on insert.
--  - bm_ensure_event_provisioned, bm_seed_demo_event: intentionally authenticated-only —
--    migration 8 already revoked from public and granted only to authenticated; anon's
--    reachability is closed explicitly here too, on top of that.
--  - bm_rsvp_get / bm_rsvp_submit / bm_rsvp_track remain anon+authenticated callable — that IS
--    the intended design (the public RSVP portal), not a finding to fix.

create or replace function public.bm_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.bm_is_member(uuid) from public;
revoke all on function public.bm_is_member(uuid) from anon;
grant execute on function public.bm_is_member(uuid) to authenticated;

revoke all on function public.bm_create_rsvp_link_for_household() from public;
revoke all on function public.bm_create_rsvp_link_for_household() from anon;
revoke all on function public.bm_create_rsvp_link_for_household() from authenticated;

revoke execute on function public.bm_ensure_event_provisioned() from anon;
revoke execute on function public.bm_seed_demo_event(uuid) from anon;
