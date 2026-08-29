-- An invite recorded with any capital letter could never be claimed.
--
-- Supabase stores account emails lowercased, and branch 2 below compared `invited_email` to
-- `auth.email()` with plain equality. So inviting "Sara@Gmail.com" created a row that no sign-in
-- could ever match: the invited person signed in successfully, fell through to branch 4, and got
-- a working app showing them nothing, with nothing on screen to explain why.
--
-- The client now lowercases before inserting, but that only helps new invites. Comparing with
-- `lower()` here fixes the rows already stored and makes the whole thing robust to any future
-- caller that forgets. Only branch 2 changes; the rest is reproduced verbatim.

create or replace function public.bm_ensure_event_provisioned()
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_event_id uuid;
  v_member public.bm_event_members;
begin
  -- 1. This user already has a claimed membership somewhere.
  select event_id into v_event_id
  from public.bm_event_members
  where user_id = auth.uid()
  limit 1;

  if v_event_id is not null then
    return v_event_id;
  end if;

  -- 2. An unclaimed membership row was invited by this user's email — claim it.
  --    Compared case-insensitively: see the header note.
  select * into v_member
  from public.bm_event_members
  where lower(btrim(invited_email)) = lower(btrim(auth.email()))
    and user_id is null
  limit 1;

  if v_member.id is not null then
    update public.bm_event_members
    set user_id = auth.uid()
    where id = v_member.id;

    return v_member.event_id;
  end if;

  -- 3. Nobody has ever signed in to this shared project before — seed the demo world and make
  --    this user its owner. bm_seed_demo_event() does not create its own membership row, so we
  --    create the owner membership here.
  if not exists (select 1 from public.bm_events) then
    v_event_id := public.bm_seed_demo_event(auth.uid());

    insert into public.bm_event_members (event_id, user_id, display_name)
    values (v_event_id, auth.uid(), null);

    return v_event_id;
  end if;

  -- 4. An unrelated account signed up on this shared project with no invite waiting for them.
  return null;
end;
$function$;

-- Normalise anything already stored, so a pending invite typed with a capital starts working
-- rather than waiting for someone to notice and re-send it.
update public.bm_event_members
set invited_email = lower(btrim(invited_email))
where invited_email is not null
  and invited_email <> lower(btrim(invited_email));
