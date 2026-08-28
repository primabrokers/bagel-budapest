-- Bar Mitzvah Planner — Migration 8: demo seed + first-sign-in provisioning
--
-- New functions:
--   public.bm_ensure_event_provisioned() RETURNS uuid SECURITY DEFINER
--     The ONLY entry point the app calls, immediately after every sign-in. Resolves the calling
--     user to an event: returns their already-claimed membership's event_id; else claims an
--     unclaimed bm_event_members row invited by their email and returns its event_id; else, if
--     this is the very first person ever to sign in to this shared project (bm_events has no
--     rows at all), seeds the entire demo world via bm_seed_demo_event() and makes them its
--     owner; else returns NULL (an unrelated account with no invite — the app shows a
--     "you're not linked to an event" screen for that case).
--   public.bm_seed_demo_event(p_user uuid) RETURNS uuid SECURITY DEFINER
--     Internal implementation detail of the above, kept as its own function only so it is
--     independently testable. Creates one complete realistic demo event and returns its new
--     bm_events.id. Deliberately does NOT insert its own bm_event_members row — the caller
--     above owns that responsibility — so this function stays reusable/idempotent-in-spirit
--     even though in practice it is only ever invoked once per project.
--
-- Demo dataset scale seeded by bm_seed_demo_event: 1 event ("Bar Mitzvah of Daniel Grossman",
-- The Grove, Sat 24 Oct 2026), 6 functions, 9 tags, 18 households / 50 guests with ~235
-- guest-function RSVP rows (mixed attending/awaiting/declined/unsure, one deliberate
-- split-household case), 11 vendors across every status + 3 comparison quotes, 8 expenses / 13
-- payments, 17 tasks across every status, 1 menu / 4 sections / 12 items, 5 idea boards / 14
-- ideas across every status, 1 seating plan / 12 floor objects / 16 seat assignments (one table
-- deliberately over capacity) / 2 seating preferences, 5 documents / 5 document links, 10 run
-- sheet items, 3 custom contacts, 4 notes, 13 back-dated activity log rows, 2 invitations / 9
-- invitation events. bm_invitation_templates is deliberately left empty (Stage 5's job).
--
-- Every generated id referenced by a later insert is captured — via `returning id into`
-- (single-row inserts) or a real `where`/`join` lookup on data just inserted in this same
-- transaction (e.g. `where household_id = v_hh_x`, `where label = ...`) — never hardcoded or
-- guessed. See the two functions below for the pattern in full.

-- ============================================================================================
-- 1. bm_ensure_event_provisioned() — the app's post-sign-in entry point
-- ============================================================================================

create function public.bm_ensure_event_provisioned()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
  select * into v_member
  from public.bm_event_members
  where invited_email = auth.email()
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
$$;

-- ============================================================================================
-- 2. bm_seed_demo_event(p_user uuid) — creates one full realistic demo event
-- ============================================================================================

create function public.bm_seed_demo_event(p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;

  -- functions
  v_fn_friday uuid;
  v_fn_shabbos_morning uuid;
  v_fn_kiddush uuid;
  v_fn_lunch uuid;
  v_fn_motzei uuid;
  v_fn_party uuid;

  -- tags
  v_tag_family uuid;
  v_tag_close_family uuid;
  v_tag_friends uuid;
  v_tag_school_friends uuid;
  v_tag_community uuid;
  v_tag_business uuid;
  v_tag_overseas uuid;
  v_tag_vip uuid;
  v_tag_rabbi uuid;

  -- households
  v_hh_grossman uuid;
  v_hh_kleinman uuid;
  v_hh_adler uuid;
  v_hh_feldman uuid;
  v_hh_rothstein uuid;
  v_hh_berkowitz uuid;
  v_hh_landau uuid;
  v_hh_schiff uuid;
  v_hh_weiss uuid;
  v_hh_katz uuid;
  v_hh_friedman uuid;
  v_hh_stein uuid;
  v_hh_levy uuid;
  v_hh_marks uuid;
  v_hh_golding uuid;
  v_hh_shapiro uuid;
  v_hh_hoffman uuid;
  v_hh_silverman uuid;

  -- vendors
  v_vendor_venue uuid;
  v_vendor_caterer uuid;
  v_vendor_band uuid;
  v_vendor_singer uuid;
  v_vendor_photographer uuid;
  v_vendor_videographer uuid;
  v_vendor_florist uuid;
  v_vendor_invitations uuid;
  v_vendor_judaica uuid;
  v_vendor_kids_entertainer uuid;
  v_vendor_security uuid;

  -- expenses
  v_exp_venue uuid;
  v_exp_caterer uuid;
  v_exp_band uuid;
  v_exp_photographer uuid;
  v_exp_invitations uuid;
  v_exp_kids_entertainer uuid;
  v_exp_suit uuid;
  v_exp_gift uuid;

  -- menu
  v_menu_lunch uuid;
  v_menu_sec_starter uuid;
  v_menu_sec_main uuid;
  v_menu_sec_dessert uuid;
  v_menu_sec_kids uuid;

  -- idea boards
  v_board_theme uuid;
  v_board_entertainment uuid;
  v_board_menu uuid;
  v_board_merch uuid;
  v_board_clothing uuid;

  -- seating
  v_plan_id uuid;

  -- documents
  v_doc_venue_contract uuid;
  v_doc_caterer_contract uuid;
  v_doc_band_contract uuid;

  -- invitations
  v_invitation_adler uuid;
  v_invitation_friedman uuid;
begin

  -- ==========================================================================================
  -- Event
  -- ==========================================================================================

  insert into public.bm_events (
    title, boy_name, boy_hebrew_name, parents_names, event_date, hebrew_date_override,
    venue_name, venue_address, ceremony_time, reception_time, dinner_time, dress_code,
    theme, palette, notes, created_by
  ) values (
    'Bar Mitzvah of Daniel Grossman',
    'Daniel Grossman',
    'דניאל בן יונתן',
    'Jonathan & Michelle Grossman',
    date '2026-10-24',
    'Shabbos Parshas Lech Lecha',
    'The Grove',
    'Rickmansworth Road, Watford, Hertfordshire, WD17 3EQ',
    time '09:30',
    time '19:00',
    time '20:15',
    'Smart, hats/head coverings for the ceremony',
    'Champagne & ivory',
    '{}'::jsonb,
    'Our darling Daniel becomes a Bar Mitzvah this Shabbos Parshas Lech Lecha — a weekend of davening, family and a lot of dancing. Thank you for being part of it with us.',
    p_user
  )
  returning id into v_event_id;

  -- ==========================================================================================
  -- Functions
  -- ==========================================================================================

  insert into public.bm_functions (event_id, name, kind, starts_at, ends_at, location, dress_code, hebrew_date_override, sort_order)
  values (v_event_id, 'Friday Night Dinner', 'friday_night', timestamptz '2026-10-23 19:15:00', timestamptz '2026-10-23 22:00:00', 'The Grove — Ballroom', 'Smart casual', null, 0)
  returning id into v_fn_friday;

  insert into public.bm_functions (event_id, name, kind, starts_at, ends_at, location, dress_code, hebrew_date_override, sort_order)
  values (v_event_id, 'Shabbos Morning Davening', 'shabbos_morning', timestamptz '2026-10-24 09:00:00', timestamptz '2026-10-24 12:00:00', 'The Grove — Shul Room', 'Smart, hats/head coverings', 'Shabbos Parshas Lech Lecha', 1)
  returning id into v_fn_shabbos_morning;

  insert into public.bm_functions (event_id, name, kind, starts_at, ends_at, location, dress_code, hebrew_date_override, sort_order)
  values (v_event_id, 'Kiddush', 'kiddush', timestamptz '2026-10-24 12:00:00', timestamptz '2026-10-24 13:30:00', 'The Grove — Garden Room', 'Smart', null, 2)
  returning id into v_fn_kiddush;

  insert into public.bm_functions (event_id, name, kind, starts_at, ends_at, location, dress_code, hebrew_date_override, sort_order)
  values (v_event_id, 'Shabbos Lunch', 'lunch', timestamptz '2026-10-24 13:30:00', timestamptz '2026-10-24 16:00:00', 'The Grove — Ballroom', 'Smart', null, 3)
  returning id into v_fn_lunch;

  insert into public.bm_functions (event_id, name, kind, starts_at, ends_at, location, dress_code, hebrew_date_override, sort_order)
  values (v_event_id, 'Shalosh Seudos & Motzei Shabbos Melava Malka', 'motzei_shabbos', timestamptz '2026-10-24 17:30:00', timestamptz '2026-10-24 19:30:00', 'The Grove — Ballroom', 'Smart casual', null, 4)
  returning id into v_fn_motzei;

  insert into public.bm_functions (event_id, name, kind, starts_at, ends_at, location, dress_code, hebrew_date_override, sort_order)
  values (v_event_id, 'Sunday Party', 'party', timestamptz '2026-10-25 18:30:00', timestamptz '2026-10-25 23:30:00', 'The Grove — Marquee', 'Evening wear', null, 5)
  returning id into v_fn_party;

  -- ==========================================================================================
  -- Tags (built-in)
  -- ==========================================================================================

  insert into public.bm_tags (event_id, name, colour, is_builtin) values (v_event_id, 'Family', '#8a6d3b', true) returning id into v_tag_family;
  insert into public.bm_tags (event_id, name, colour, is_builtin) values (v_event_id, 'Close family', '#5c3d2e', true) returning id into v_tag_close_family;
  insert into public.bm_tags (event_id, name, colour, is_builtin) values (v_event_id, 'Friends', '#3d6b8a', true) returning id into v_tag_friends;
  insert into public.bm_tags (event_id, name, colour, is_builtin) values (v_event_id, 'School friends', '#3d8a6b', true) returning id into v_tag_school_friends;
  insert into public.bm_tags (event_id, name, colour, is_builtin) values (v_event_id, 'Community', '#8a3d6b', true) returning id into v_tag_community;
  insert into public.bm_tags (event_id, name, colour, is_builtin) values (v_event_id, 'Business', '#6b6b6b', true) returning id into v_tag_business;
  insert into public.bm_tags (event_id, name, colour, is_builtin) values (v_event_id, 'Overseas', '#3d5c8a', true) returning id into v_tag_overseas;
  insert into public.bm_tags (event_id, name, colour, is_builtin) values (v_event_id, 'VIP', '#c9a227', true) returning id into v_tag_vip;
  insert into public.bm_tags (event_id, name, colour, is_builtin) values (v_event_id, 'Rabbi', '#2e2e2e', true) returning id into v_tag_rabbi;

  -- ==========================================================================================
  -- Households, guests, tags and function invites
  -- ==========================================================================================

  -- ---- 1. Grossman (host family) ----
  insert into public.bm_households (event_id, name, main_contact_name, address_lines, postcode, email, phone, whatsapp, category, side_of_family, notes, created_by)
  values (v_event_id, 'Grossman', 'Jonathan & Michelle Grossman', '14 Aldenham Road, Bushey', 'WD23 2AX', 'jonathan.grossman@ntlworld.example', '01923 555 101', '+44 7700 900101', 'immediate_family', 'both', 'The host family.', p_user)
  returning id into v_hh_grossman;

  insert into public.bm_guests (event_id, household_id, first_name, last_name, guest_type, age, gender, dietary, allergies, meal_preference, child_meal, high_chair, baby_seat, accessibility, relationship, is_vip, notes, sort_order)
  values
    (v_event_id, v_hh_grossman, 'Jonathan', 'Grossman', 'adult', null, 'male', null, null, null, false, false, false, null, 'Father', true, null, 0),
    (v_event_id, v_hh_grossman, 'Michelle', 'Grossman', 'adult', null, 'female', null, null, null, false, false, false, null, 'Mother', true, null, 1),
    (v_event_id, v_hh_grossman, 'Daniel', 'Grossman', 'child', 13, 'male', null, null, null, false, false, false, null, 'Bar Mitzvah boy', true, 'The Bar Mitzvah boy himself.', 2),
    (v_event_id, v_hh_grossman, 'Ellie', 'Grossman', 'child', 10, 'female', null, null, null, true, false, false, null, 'Sister', false, null, 3),
    (v_event_id, v_hh_grossman, 'Sophie', 'Grossman', 'child', 8, 'female', null, null, null, true, false, false, null, 'Sister', false, null, 4);

  insert into public.bm_household_tags (event_id, household_id, tag_id) values (v_event_id, v_hh_grossman, v_tag_close_family);
  insert into public.bm_guest_tags (event_id, guest_id, tag_id) select v_event_id, g.id, v_tag_vip from public.bm_guests g where g.household_id = v_hh_grossman and g.is_vip = true;

  insert into public.bm_guest_function_invites (event_id, guest_id, function_id, invited, rsvp, responded_at)
  select v_event_id, g.id, f.id, true, 'attending', now() - interval '90 days'
  from public.bm_guests g cross join public.bm_functions f
  where g.household_id = v_hh_grossman and f.event_id = v_event_id;

  -- ---- 2. Kleinman (Michelle's parents) ----
  insert into public.bm_households (event_id, name, main_contact_name, address_lines, postcode, email, phone, whatsapp, category, side_of_family, notes, created_by)
  values (v_event_id, 'Kleinman', 'Barry & Susan Kleinman', '22 Nascot Road, Watford', 'WD17 4SA', 'barry.kleinman@btinternet.example', '01923 555 102', '+44 7700 900102', 'grandparents', 'mother', 'Michelle''s parents.', p_user)
  returning id into v_hh_kleinman;

  insert into public.bm_guests (event_id, household_id, first_name, last_name, guest_type, age, gender, dietary, allergies, meal_preference, child_meal, high_chair, baby_seat, accessibility, relationship, is_vip, notes, sort_order)
  values
    (v_event_id, v_hh_kleinman, 'Barry', 'Kleinman', 'adult', null, 'male', null, null, null, false, false, false, 'Uses a walking stick — please seat near the exit, avoid stairs', 'Grandfather (maternal)', true, null, 0),
    (v_event_id, v_hh_kleinman, 'Susan', 'Kleinman', 'adult', null, 'female', 'Coeliac — strictly gluten free', null, 'gluten_free', false, false, false, null, 'Grandmother (maternal)', true, null, 1);

  insert into public.bm_household_tags (event_id, household_id, tag_id) values (v_event_id, v_hh_kleinman, v_tag_close_family);
  insert into public.bm_guest_tags (event_id, guest_id, tag_id) select v_event_id, g.id, v_tag_vip from public.bm_guests g where g.household_id = v_hh_kleinman and g.is_vip = true;

  insert into public.bm_guest_function_invites (event_id, guest_id, function_id, invited, rsvp, responded_at)
  select v_event_id, g.id, f.id, true, 'attending', now() - interval '85 days'
  from public.bm_guests g cross join public.bm_functions f
  where g.household_id = v_hh_kleinman and f.event_id = v_event_id;

  -- ---- 3. Adler (Jonathan's sister's family) ----
  insert into public.bm_households (event_id, name, main_contact_name, address_lines, postcode, email, phone, whatsapp, category, side_of_family, notes, created_by)
  values (v_event_id, 'Adler', 'David & Rachel Adler', '8 Sheepcote Road, Harrow', 'HA1 2LS', 'rachel.adler@gmail.example', '020 8909 5566', '+44 7700 900103', 'family', 'father', 'Jonathan''s sister and her family.', p_user)
  returning id into v_hh_adler;

  insert into public.bm_guests (event_id, household_id, first_name, last_name, guest_type, age, gender, dietary, allergies, meal_preference, child_meal, high_chair, baby_seat, accessibility, relationship, is_vip, notes, sort_order)
  values
    (v_event_id, v_hh_adler, 'David', 'Adler', 'adult', null, 'male', null, null, null, false, false, false, null, 'Uncle (paternal)', false, null, 0),
    (v_event_id, v_hh_adler, 'Rachel', 'Adler', 'adult', null, 'female', null, null, 'vegetarian', false, false, false, null, 'Aunt (paternal)', false, null, 1),
    (v_event_id, v_hh_adler, 'Noah', 'Adler', 'child', 11, 'male', null, null, null, false, false, false, null, 'Cousin', false, null, 2),
    (v_event_id, v_hh_adler, 'Ava', 'Adler', 'child', 6, 'female', null, null, null, true, false, false, null, 'Cousin', false, null, 3);

  insert into public.bm_household_tags (event_id, household_id, tag_id) values (v_event_id, v_hh_adler, v_tag_family);

  insert into public.bm_guest_function_invites (event_id, guest_id, function_id, invited, rsvp, responded_at)
  select v_event_id, g.id, f.id, true, 'attending', now() - interval '60 days'
  from public.bm_guests g cross join public.bm_functions f
  where g.household_id = v_hh_adler and f.event_id = v_event_id;

  -- ---- 4. Feldman (Michelle's brother's family) ----
  insert into public.bm_households (event_id, name, main_contact_name, address_lines, postcode, email, phone, whatsapp, category, side_of_family, notes, created_by)
  values (v_event_id, 'Feldman', 'Simon & Karen Feldman', '45 Hendon Lane, London', 'N3 1TR', 'simon.feldman@gmail.example', '020 8346 7788', '+44 7700 900104', 'family', 'mother', 'Michelle''s brother and his family.', p_user)
  returning id into v_hh_feldman;

  insert into public.bm_guests (event_id, household_id, first_name, last_name, guest_type, age, gender, dietary, allergies, meal_preference, child_meal, high_chair, baby_seat, accessibility, relationship, is_vip, notes, sort_order)
  values
    (v_event_id, v_hh_feldman, 'Simon', 'Feldman', 'adult', null, 'male', null, null, null, false, false, false, null, 'Uncle (maternal)', false, null, 0),
    (v_event_id, v_hh_feldman, 'Karen', 'Feldman', 'adult', null, 'female', null, null, 'vegetarian', false, false, false, null, 'Aunt (maternal)', false, null, 1),
    (v_event_id, v_hh_feldman, 'Josh', 'Feldman', 'child', 9, 'male', null, null, null, true, false, false, null, 'Cousin', false, null, 2);

  insert into public.bm_household_tags (event_id, household_id, tag_id) values (v_event_id, v_hh_feldman, v_tag_family);

  insert into public.bm_guest_function_invites (event_id, guest_id, function_id, invited, rsvp, responded_at)
  select v_event_id, g.id, f.id, true, 'attending', now() - interval '55 days'
  from public.bm_guests g cross join public.bm_functions f
  where g.household_id = v_hh_feldman and f.event_id = v_event_id;

  -- ---- 5. Rothstein (Jonathan's cousins) — the deliberate split-household RSVP case ----
  insert into public.bm_households (event_id, name, main_contact_name, address_lines, postcode, email, phone, whatsapp, category, side_of_family, notes, created_by)
  values (v_event_id, 'Rothstein', 'Mark & Louise Rothstein', '3 Village Way, Pinner', 'HA5 3PF', 'mark.rothstein@outlook.example', '020 8866 3344', '+44 7700 900105', 'family', 'father', null, p_user)
  returning id into v_hh_rothstein;

  insert into public.bm_guests (event_id, household_id, first_name, last_name, guest_type, age, gender, dietary, allergies, meal_preference, child_meal, high_chair, baby_seat, accessibility, relationship, is_vip, notes, sort_order)
  values
    (v_event_id, v_hh_rothstein, 'Mark', 'Rothstein', 'adult', null, 'male', null, null, null, false, false, false, null, 'Cousin (paternal)', false, null, 0),
    (v_event_id, v_hh_rothstein, 'Louise', 'Rothstein', 'adult', null, 'female', 'Gluten free', null, 'gluten_free', false, false, false, null, 'Cousin''s wife', false, null, 1),
    (v_event_id, v_hh_rothstein, 'Ben', 'Rothstein', 'child', 13, 'male', null, null, null, false, false, false, null, 'Cousin', false, null, 2),
    (v_event_id, v_hh_rothstein, 'Tamar', 'Rothstein', 'child', 15, 'female', null, null, null, false, false, false, null, 'Cousin', false, null, 3);

  insert into public.bm_household_tags (event_id, household_id, tag_id) values (v_event_id, v_hh_rothstein, v_tag_family);

  -- All functions except the Sunday party: whole household attending.
  insert into public.bm_guest_function_invites (event_id, guest_id, function_id, invited, rsvp, responded_at)
  select v_event_id, g.id, f.id, true, 'attending', now() - interval '50 days'
  from public.bm_guests g cross join public.bm_functions f
  where g.household_id = v_hh_rothstein
    and f.event_id = v_event_id
    and f.id in (v_fn_friday, v_fn_shabbos_morning, v_fn_kiddush, v_fn_lunch, v_fn_motzei);

  -- Sunday party: everyone invited, but Tamar hasn't come back yet — the deliberate split.
  insert into public.bm_guest_function_invites (event_id, guest_id, function_id, invited, rsvp, responded_at)
  select v_event_id, g.id, v_fn_party, true,
    case when g.first_name = 'Tamar' then 'awaiting' else 'attending' end,
    case when g.first_name = 'Tamar' then null else now() - interval '50 days' end
  from public.bm_guests g
  where g.household_id = v_hh_rothstein;

  -- ---- 6. Berkowitz (Michelle's cousins) ----
  insert into public.bm_households (event_id, name, main_contact_name, address_lines, postcode, email, phone, whatsapp, category, side_of_family, notes, created_by)
  values (v_event_id, 'Berkowitz', 'Alan & Debra Berkowitz', '19 Ashbourne Avenue, Golders Green', 'NW11 0DL', 'alan.berkowitz@gmail.example', '020 8455 9911', '+44 7700 900106', 'family', 'mother', null, p_user)
  returning id into v_hh_berkowitz;

  insert into public.bm_guests (event_id, household_id, first_name, last_name, guest_type, age, gender, dietary, allergies, meal_preference, child_meal, high_chair, baby_seat, accessibility, relationship, is_vip, notes, sort_order)
  values
    (v_event_id, v_hh_berkowitz, 'Alan', 'Berkowitz', 'adult', null, 'male', null, null, null, false, false, false, null, 'Cousin (maternal)', false, null, 0),
    (v_event_id, v_hh_berkowitz, 'Debra', 'Berkowitz', 'adult', null, 'female', null, null, null, false, false, false, null, 'Cousin''s wife', false, null, 1);

  insert into public.bm_household_tags (event_id, household_id, tag_id) values (v_event_id, v_hh_berkowitz, v_tag_family);

  insert into public.bm_guest_function_invites (event_id, guest_id, function_id, invited, rsvp, responded_at)
  select v_event_id, g.id, v_fn_friday, true, 'declined', now() - interval '40 days'
  from public.bm_guests g where g.household_id = v_hh_berkowitz;

  insert into public.bm_guest_function_invites (event_id, guest_id, function_id, invited, rsvp, responded_at)
  select v_event_id, g.id, f.id, true, 'attending', now() - interval '40 days'
  from public.bm_guests g cross join public.bm_functions f
  where g.household_id = v_hh_berkowitz
    and f.event_id = v_event_id
    and f.id in (v_fn_shabbos_morning, v_fn_kiddush, v_fn_lunch, v_fn_motzei, v_fn_party);

  -- ---- 7. Landau (Jonathan's side, close family friends) — hasn't responded yet ----
  insert into public.bm_households (event_id, name, main_contact_name, address_lines, postcode, email, phone, whatsapp, category, side_of_family, notes, created_by)
  values (v_event_id, 'Landau', 'Michael & Jane Landau', '6 Cassiobury Park Avenue, Watford', 'WD18 7LG', 'michael.landau@gmail.example', '01923 555 107', '+44 7700 900107', 'family', 'father', null, p_user)
  returning id into v_hh_landau;

  insert into public.bm_guests (event_id, household_id, first_name, last_name, guest_type, age, gender, dietary, allergies, meal_preference, child_meal, high_chair, baby_seat, accessibility, relationship, is_vip, notes, sort_order)
  values
    (v_event_id, v_hh_landau, 'Michael', 'Landau', 'adult', null, 'male', null, null, null, false, false, false, null, 'Family friend', false, null, 0),
    (v_event_id, v_hh_landau, 'Jane', 'Landau', 'adult', null, 'female', null, null, null, false, false, false, null, 'Family friend', false, null, 1),
    (v_event_id, v_hh_landau, 'Oliver', 'Landau', 'child', 12, 'male', null, null, null, false, false, false, null, 'Family friend''s son', false, null, 2);

  insert into public.bm_household_tags (event_id, household_id, tag_id) values (v_event_id, v_hh_landau, v_tag_family);

  insert into public.bm_guest_function_invites (event_id, guest_id, function_id, invited, rsvp, responded_at)
  select v_event_id, g.id, f.id, true, 'awaiting', null
  from public.bm_guests g cross join public.bm_functions f
  where g.household_id = v_hh_landau and f.event_id = v_event_id;

  -- ---- 8. Schiff (Michelle's side) — hasn't responded yet ----
  insert into public.bm_households (event_id, name, main_contact_name, address_lines, postcode, email, phone, whatsapp, category, side_of_family, notes, created_by)
  values (v_event_id, 'Schiff', 'Paul & Nicola Schiff', '27 Prince Albert Road, London', 'NW8 7LG', 'paul.schiff@gmail.example', '020 7722 3344', '+44 7700 900108', 'family', 'mother', null, p_user)
  returning id into v_hh_schiff;

  insert into public.bm_guests (event_id, household_id, first_name, last_name, guest_type, age, gender, dietary, allergies, meal_preference, child_meal, high_chair, baby_seat, accessibility, relationship, is_vip, notes, sort_order)
  values
    (v_event_id, v_hh_schiff, 'Paul', 'Schiff', 'adult', null, 'male', null, null, null, false, false, false, null, 'Cousin (maternal)', false, null, 0),
    (v_event_id, v_hh_schiff, 'Nicola', 'Schiff', 'adult', null, 'female', null, null, null, false, false, false, null, 'Cousin''s wife', false, null, 1),
    (v_event_id, v_hh_schiff, 'Zac', 'Schiff', 'child', 10, 'male', null, null, null, true, false, false, null, 'Cousin', false, null, 2),
    (v_event_id, v_hh_schiff, 'Mia', 'Schiff', 'child', 2, 'female', null, null, null, true, true, true, null, 'Cousin', false, null, 3);

  insert into public.bm_household_tags (event_id, household_id, tag_id) values (v_event_id, v_hh_schiff, v_tag_family);

  insert into public.bm_guest_function_invites (event_id, guest_id, function_id, invited, rsvp, responded_at)
  select v_event_id, g.id, f.id, true, 'awaiting', null
  from public.bm_guests g cross join public.bm_functions f
  where g.household_id = v_hh_schiff and f.event_id = v_event_id;

  -- ---- 9. Weiss (Rabbi & Rebbetzin) ----
  insert into public.bm_households (event_id, name, main_contact_name, address_lines, postcode, email, phone, whatsapp, category, side_of_family, notes, created_by)
  values (v_event_id, 'Weiss', 'Rabbi & Rebbetzin Weiss', 'Flat 2, 5 Vicarage Road, Watford', 'WD18 0EN', 'rabbi.weiss@shul.example', '01923 555 109', '+44 7700 900109', 'clergy', 'community', 'Our community Rabbi and Rebbetzin.', p_user)
  returning id into v_hh_weiss;

  insert into public.bm_guests (event_id, household_id, first_name, last_name, guest_type, age, gender, dietary, allergies, meal_preference, child_meal, high_chair, baby_seat, accessibility, relationship, is_vip, notes, sort_order)
  values
    (v_event_id, v_hh_weiss, 'Aharon', 'Weiss', 'adult', null, 'male', null, null, null, false, false, false, null, 'Rabbi', true, 'Our Rabbi — will be officiating the service.', 0),
    (v_event_id, v_hh_weiss, 'Leah', 'Weiss', 'adult', null, 'female', null, null, null, false, false, false, null, 'Rebbetzin', true, null, 1);

  insert into public.bm_household_tags (event_id, household_id, tag_id) values (v_event_id, v_hh_weiss, v_tag_community);
  insert into public.bm_household_tags (event_id, household_id, tag_id) values (v_event_id, v_hh_weiss, v_tag_rabbi);
  insert into public.bm_guest_tags (event_id, guest_id, tag_id) select v_event_id, g.id, v_tag_vip from public.bm_guests g where g.household_id = v_hh_weiss and g.is_vip = true;
  insert into public.bm_guest_tags (event_id, guest_id, tag_id) select v_event_id, g.id, v_tag_rabbi from public.bm_guests g where g.household_id = v_hh_weiss and g.first_name = 'Aharon';

  insert into public.bm_guest_function_invites (event_id, guest_id, function_id, invited, rsvp, responded_at)
  select v_event_id, g.id, f.id, true, 'attending', now() - interval '65 days'
  from public.bm_guests g cross join public.bm_functions f
  where g.household_id = v_hh_weiss and f.event_id = v_event_id;

  -- ---- 10. Katz (overseas, Jerusalem) — not staying for Motzei Shabbos, flying back Saturday night ----
  insert into public.bm_households (event_id, name, main_contact_name, address_lines, postcode, email, phone, whatsapp, category, side_of_family, notes, created_by)
  values (v_event_id, 'Katz', 'Yossi & Naomi Katz', '12 Rechov Emek Refaim, Jerusalem, Israel', '9314412', 'yossi.katz@gmail.example', '+972 2 566 7788', '+972 54 234 5678', 'overseas_family', 'mother', 'Michelle''s cousins, flying in from Jerusalem for the weekend.', p_user)
  returning id into v_hh_katz;

  insert into public.bm_guests (event_id, household_id, first_name, last_name, guest_type, age, gender, dietary, allergies, meal_preference, child_meal, high_chair, baby_seat, accessibility, relationship, is_vip, notes, sort_order)
  values
    (v_event_id, v_hh_katz, 'Yossi', 'Katz', 'adult', null, 'male', null, null, null, false, false, false, null, 'Cousin (maternal), overseas', false, null, 0),
    (v_event_id, v_hh_katz, 'Naomi', 'Katz', 'adult', null, 'female', null, 'Severe nut allergy — carries an EpiPen', null, false, false, false, null, 'Cousin''s wife, overseas', false, null, 1),
    (v_event_id, v_hh_katz, 'Ariel', 'Katz', 'child', 14, 'male', null, null, null, false, false, false, null, 'Cousin, overseas', false, null, 2);

  insert into public.bm_household_tags (event_id, household_id, tag_id) values (v_event_id, v_hh_katz, v_tag_family);
  insert into public.bm_household_tags (event_id, household_id, tag_id) values (v_event_id, v_hh_katz, v_tag_overseas);

  insert into public.bm_guest_function_invites (event_id, guest_id, function_id, invited, rsvp, responded_at)
  select v_event_id, g.id, f.id, true, 'attending', now() - interval '58 days'
  from public.bm_guests g cross join public.bm_functions f
  where g.household_id = v_hh_katz
    and f.event_id = v_event_id
    and f.id in (v_fn_friday, v_fn_shabbos_morning, v_fn_kiddush, v_fn_lunch, v_fn_party);

  -- ---- 11. Friedman (school friend) ----
  insert into public.bm_households (event_id, name, main_contact_name, address_lines, postcode, email, phone, whatsapp, category, side_of_family, notes, created_by)
  values (v_event_id, 'Friedman', 'Robert & Claire Friedman', '31 The Avenue, Radlett', 'WD7 8EQ', 'robert.friedman@gmail.example', '01923 555 111', '+44 7700 900111', 'school_friends', 'friends', null, p_user)
  returning id into v_hh_friedman;

  insert into public.bm_guests (event_id, household_id, first_name, last_name, guest_type, age, gender, dietary, allergies, meal_preference, child_meal, high_chair, baby_seat, accessibility, relationship, is_vip, notes, sort_order)
  values
    (v_event_id, v_hh_friedman, 'Robert', 'Friedman', 'adult', null, 'male', null, null, null, false, false, false, null, 'School friend''s father', false, null, 0),
    (v_event_id, v_hh_friedman, 'Claire', 'Friedman', 'adult', null, 'female', null, null, null, false, false, false, null, 'School friend''s mother', false, null, 1),
    (v_event_id, v_hh_friedman, 'Jake', 'Friedman', 'child', 13, 'male', null, null, null, false, false, false, null, 'School friend', false, null, 2);

  insert into public.bm_household_tags (event_id, household_id, tag_id) values (v_event_id, v_hh_friedman, v_tag_friends);
  insert into public.bm_household_tags (event_id, household_id, tag_id) values (v_event_id, v_hh_friedman, v_tag_school_friends);

  insert into public.bm_guest_function_invites (event_id, guest_id, function_id, invited, rsvp, responded_at)
  select v_event_id, g.id, f.id, true, 'attending', now() - interval '55 days'
  from public.bm_guests g cross join public.bm_functions f
  where g.household_id = v_hh_friedman
    and f.event_id = v_event_id
    and f.id in (v_fn_kiddush, v_fn_lunch, v_fn_party);

  -- ---- 12. Stein (school friend) — opened the invite, hasn't responded ----
  insert into public.bm_households (event_id, name, main_contact_name, address_lines, postcode, email, phone, whatsapp, category, side_of_family, notes, created_by)
  values (v_event_id, 'Stein', 'Neil & Julie Stein', '14 Hillside Gardens, Edgware', 'HA8 9LN', 'neil.stein@gmail.example', '020 8958 2233', '+44 7700 900112', 'school_friends', 'friends', null, p_user)
  returning id into v_hh_stein;

  insert into public.bm_guests (event_id, household_id, first_name, last_name, guest_type, age, gender, dietary, allergies, meal_preference, child_meal, high_chair, baby_seat, accessibility, relationship, is_vip, notes, sort_order)
  values
    (v_event_id, v_hh_stein, 'Neil', 'Stein', 'adult', null, 'male', null, null, null, false, false, false, null, 'School friend''s father', false, null, 0),
    (v_event_id, v_hh_stein, 'Julie', 'Stein', 'adult', null, 'female', null, null, null, false, false, false, null, 'School friend''s mother', false, null, 1),
    (v_event_id, v_hh_stein, 'Adam', 'Stein', 'child', 13, 'male', null, null, null, false, false, false, null, 'School friend', false, null, 2);

  insert into public.bm_household_tags (event_id, household_id, tag_id) values (v_event_id, v_hh_stein, v_tag_friends);
  insert into public.bm_household_tags (event_id, household_id, tag_id) values (v_event_id, v_hh_stein, v_tag_school_friends);

  insert into public.bm_guest_function_invites (event_id, guest_id, function_id, invited, rsvp, responded_at)
  select v_event_id, g.id, f.id, true, 'awaiting', null
  from public.bm_guests g cross join public.bm_functions f
  where g.household_id = v_hh_stein
    and f.event_id = v_event_id
    and f.id in (v_fn_kiddush, v_fn_lunch, v_fn_party);

  -- ---- 13. Levy (school friend, single parent) — Sarah unsure about the Sunday party ----
  insert into public.bm_households (event_id, name, main_contact_name, address_lines, postcode, email, phone, whatsapp, category, side_of_family, notes, created_by)
  values (v_event_id, 'Levy', 'Sarah Levy', '9 Elm Park Road, Pinner', 'HA5 3LR', 'sarah.levy@gmail.example', '020 8866 7799', '+44 7700 900113', 'school_friends', 'friends', 'Ethan is one of Daniel''s closest friends from school.', p_user)
  returning id into v_hh_levy;

  insert into public.bm_guests (event_id, household_id, first_name, last_name, guest_type, age, gender, dietary, allergies, meal_preference, child_meal, high_chair, baby_seat, accessibility, relationship, is_vip, notes, sort_order)
  values
    (v_event_id, v_hh_levy, 'Sarah', 'Levy', 'adult', null, 'female', null, null, null, false, false, false, null, 'School friend''s mother', false, null, 0),
    (v_event_id, v_hh_levy, 'Ethan', 'Levy', 'child', 13, 'male', null, 'Nut allergy (mild) — avoid tree nuts', null, false, false, false, null, 'School friend', false, null, 1);

  insert into public.bm_household_tags (event_id, household_id, tag_id) values (v_event_id, v_hh_levy, v_tag_friends);
  insert into public.bm_household_tags (event_id, household_id, tag_id) values (v_event_id, v_hh_levy, v_tag_school_friends);

  insert into public.bm_guest_function_invites (event_id, guest_id, function_id, invited, rsvp, responded_at)
  select v_event_id, g.id, f.id, true, 'attending', now() - interval '45 days'
  from public.bm_guests g cross join public.bm_functions f
  where g.household_id = v_hh_levy
    and f.event_id = v_event_id
    and f.id in (v_fn_kiddush, v_fn_lunch);

  insert into public.bm_guest_function_invites (event_id, guest_id, function_id, invited, rsvp, responded_at)
  select v_event_id, g.id, v_fn_party, true,
    case when g.first_name = 'Sarah' then 'unsure' else 'attending' end,
    now() - interval '45 days'
  from public.bm_guests g
  where g.household_id = v_hh_levy;

  -- ---- 14. Marks (school friend) — declined, family holiday clash ----
  insert into public.bm_households (event_id, name, main_contact_name, address_lines, postcode, email, phone, whatsapp, category, side_of_family, notes, created_by)
  values (v_event_id, 'Marks', 'Adam & Rebecca Marks', '22 Kenton Road, Kenton', 'HA3 8AX', 'adam.marks@gmail.example', '020 8907 4455', '+44 7700 900114', 'school_friends', 'friends', null, p_user)
  returning id into v_hh_marks;

  insert into public.bm_guests (event_id, household_id, first_name, last_name, guest_type, age, gender, dietary, allergies, meal_preference, child_meal, high_chair, baby_seat, accessibility, relationship, is_vip, notes, sort_order)
  values
    (v_event_id, v_hh_marks, 'Adam', 'Marks', 'adult', null, 'male', null, null, null, false, false, false, null, 'School friend''s father', false, null, 0),
    (v_event_id, v_hh_marks, 'Rebecca', 'Marks', 'adult', null, 'female', null, null, null, false, false, false, null, 'School friend''s mother', false, null, 1),
    (v_event_id, v_hh_marks, 'Toby', 'Marks', 'child', 13, 'male', null, null, null, false, false, false, null, 'School friend', false, 'Away on a family holiday that weekend.', 2);

  insert into public.bm_household_tags (event_id, household_id, tag_id) values (v_event_id, v_hh_marks, v_tag_friends);
  insert into public.bm_household_tags (event_id, household_id, tag_id) values (v_event_id, v_hh_marks, v_tag_school_friends);

  insert into public.bm_guest_function_invites (event_id, guest_id, function_id, invited, rsvp, responded_at)
  select v_event_id, g.id, f.id, true, 'declined', now() - interval '35 days'
  from public.bm_guests g cross join public.bm_functions f
  where g.household_id = v_hh_marks
    and f.event_id = v_event_id
    and f.id in (v_fn_kiddush, v_fn_lunch, v_fn_party);

  -- ---- 15. Golding (school friend, single parent) — declined ----
  insert into public.bm_households (event_id, name, main_contact_name, address_lines, postcode, email, phone, whatsapp, category, side_of_family, notes, created_by)
  values (v_event_id, 'Golding', 'Hannah Golding', '5 Church Road, Stanmore', 'HA7 4AR', 'hannah.golding@gmail.example', '020 8954 6677', '+44 7700 900115', 'school_friends', 'friends', null, p_user)
  returning id into v_hh_golding;

  insert into public.bm_guests (event_id, household_id, first_name, last_name, guest_type, age, gender, dietary, allergies, meal_preference, child_meal, high_chair, baby_seat, accessibility, relationship, is_vip, notes, sort_order)
  values
    (v_event_id, v_hh_golding, 'Hannah', 'Golding', 'adult', null, 'female', null, null, null, false, false, false, null, 'School friend''s mother', false, null, 0),
    (v_event_id, v_hh_golding, 'Max', 'Golding', 'child', 13, 'male', null, null, null, false, false, false, null, 'School friend', false, null, 1);

  insert into public.bm_household_tags (event_id, household_id, tag_id) values (v_event_id, v_hh_golding, v_tag_friends);
  insert into public.bm_household_tags (event_id, household_id, tag_id) values (v_event_id, v_hh_golding, v_tag_school_friends);

  insert into public.bm_guest_function_invites (event_id, guest_id, function_id, invited, rsvp, responded_at)
  select v_event_id, g.id, f.id, true, 'declined', now() - interval '30 days'
  from public.bm_guests g cross join public.bm_functions f
  where g.household_id = v_hh_golding
    and f.event_id = v_event_id
    and f.id in (v_fn_kiddush, v_fn_lunch, v_fn_party);

  -- ---- 16. Shapiro (community friends) ----
  insert into public.bm_households (event_id, name, main_contact_name, address_lines, postcode, email, phone, whatsapp, category, side_of_family, notes, created_by)
  values (v_event_id, 'Shapiro', 'Danny & Elaine Shapiro', '18 Queens Road, Radlett', 'WD7 8NS', 'danny.shapiro@gmail.example', '01923 555 116', '+44 7700 900116', 'community', 'community', null, p_user)
  returning id into v_hh_shapiro;

  insert into public.bm_guests (event_id, household_id, first_name, last_name, guest_type, age, gender, dietary, allergies, meal_preference, child_meal, high_chair, baby_seat, accessibility, relationship, is_vip, notes, sort_order)
  values
    (v_event_id, v_hh_shapiro, 'Danny', 'Shapiro', 'adult', null, 'male', null, null, null, false, false, false, null, 'Community friend', false, null, 0),
    (v_event_id, v_hh_shapiro, 'Elaine', 'Shapiro', 'adult', null, 'female', null, null, null, false, false, false, null, 'Community friend', false, null, 1);

  insert into public.bm_household_tags (event_id, household_id, tag_id) values (v_event_id, v_hh_shapiro, v_tag_community);

  insert into public.bm_guest_function_invites (event_id, guest_id, function_id, invited, rsvp, responded_at)
  select v_event_id, g.id, f.id, true, 'attending', now() - interval '48 days'
  from public.bm_guests g cross join public.bm_functions f
  where g.household_id = v_hh_shapiro
    and f.event_id = v_event_id
    and f.id in (v_fn_kiddush, v_fn_party);

  -- ---- 17. Hoffman (business contact) — Sunday party only ----
  insert into public.bm_households (event_id, name, main_contact_name, address_lines, postcode, email, phone, whatsapp, category, side_of_family, notes, created_by)
  values (v_event_id, 'Hoffman', 'Gary & Wendy Hoffman', '2 Bridge Street, St Albans', 'AL3 4PR', 'gary.hoffman@hoffmanlegal.example', '01727 555 117', '+44 7700 900117', 'business', 'other', 'Jonathan''s business contact.', p_user)
  returning id into v_hh_hoffman;

  insert into public.bm_guests (event_id, household_id, first_name, last_name, guest_type, age, gender, dietary, allergies, meal_preference, child_meal, high_chair, baby_seat, accessibility, relationship, is_vip, notes, sort_order)
  values
    (v_event_id, v_hh_hoffman, 'Gary', 'Hoffman', 'adult', null, 'male', null, null, null, false, false, false, null, 'Business contact', false, null, 0),
    (v_event_id, v_hh_hoffman, 'Wendy', 'Hoffman', 'adult', null, 'female', null, null, null, false, false, false, null, 'Business contact''s wife', false, null, 1);

  insert into public.bm_household_tags (event_id, household_id, tag_id) values (v_event_id, v_hh_hoffman, v_tag_business);

  insert into public.bm_guest_function_invites (event_id, guest_id, function_id, invited, rsvp, responded_at)
  select v_event_id, g.id, v_fn_party, true, 'attending', now() - interval '42 days'
  from public.bm_guests g where g.household_id = v_hh_hoffman;

  -- ---- 18. Silverman (business contact) — Sunday party only, hasn't responded ----
  insert into public.bm_households (event_id, name, main_contact_name, address_lines, postcode, email, phone, whatsapp, category, side_of_family, notes, created_by)
  values (v_event_id, 'Silverman', 'Martin Silverman', '40 High Street, Rickmansworth', 'WD3 1EH', 'martin.silverman@silvermanaccountants.example', '01923 555 118', null, 'business', 'other', null, p_user)
  returning id into v_hh_silverman;

  insert into public.bm_guests (event_id, household_id, first_name, last_name, guest_type, age, gender, dietary, allergies, meal_preference, child_meal, high_chair, baby_seat, accessibility, relationship, is_vip, notes, sort_order)
  values
    (v_event_id, v_hh_silverman, 'Martin', 'Silverman', 'adult', null, 'male', null, null, null, false, false, false, null, 'Business contact', false, null, 0);

  insert into public.bm_household_tags (event_id, household_id, tag_id) values (v_event_id, v_hh_silverman, v_tag_business);

  insert into public.bm_guest_function_invites (event_id, guest_id, function_id, invited, rsvp, responded_at)
  select v_event_id, g.id, v_fn_party, true, 'awaiting', null
  from public.bm_guests g where g.household_id = v_hh_silverman;

  -- ==========================================================================================
  -- Vendors
  -- ==========================================================================================

  insert into public.bm_vendors (event_id, category, status, name, contact_name, phone, email, website, address, quoted_price, agreed_price, deposit_amount, deposit_due_date, balance_due_date, vat_registered, rating, favourite, notes)
  values (v_event_id, 'Venue', 'fully_paid', 'The Grove', 'Sandra Miles', '01923 555 210', 'events@thegrove.example', 'https://www.thegrove.example', 'Rickmansworth Road, Watford, Hertfordshire, WD17 3EQ', 18000.00, 17500.00, 5000.00, current_date - 150, current_date + 14, true, 5, true, 'Our venue — beautiful grounds, kosher kitchen on site.')
  returning id into v_vendor_venue;

  insert into public.bm_vendors (event_id, category, status, name, contact_name, phone, email, website, address, quoted_price, agreed_price, deposit_amount, deposit_due_date, balance_due_date, vat_registered, rating, favourite, notes)
  values (v_event_id, 'Catering', 'booked', 'Kosher Kitchen Catering Co', 'Miriam Ellis', '020 8455 3020', 'events@kosherkitchencatering.example', 'https://www.kosherkitchencatering.example', 'Golders Green, London', 9200.00, 8800.00, 2000.00, current_date - 120, current_date + 50, true, 5, true, 'Glatt kosher, under the London Beth Din.')
  returning id into v_vendor_caterer;

  insert into public.bm_vendors (event_id, category, status, name, contact_name, phone, email, website, quoted_price, agreed_price, deposit_amount, deposit_due_date, balance_due_date, vat_registered, rating, favourite, notes)
  values (v_event_id, 'Band', 'booked', 'The Mazel Tov Function Band', 'Ollie Grant', '07700 900456', 'bookings@mazeltovband.example', 'https://www.mazeltovband.example', 2400.00, 2100.00, 500.00, current_date - 100, current_date + 55, false, 4, false, '7-piece line-up with a horn section — played at three other family simchas we''ve been to.')
  returning id into v_vendor_band;

  insert into public.bm_vendors (event_id, category, status, name, contact_name, phone, email, quoted_price, rating, notes)
  values (v_event_id, 'Singer / Entertainment', 'shortlisted', 'Simcha Sounds Entertainment', 'Dov Katz', '020 8455 7711', 'info@simchasounds.example', 800.00, 4, 'Considering for the Motzei Shabbos melava malka singing.')
  returning id into v_vendor_singer;

  insert into public.bm_vendors (event_id, category, status, name, contact_name, phone, email, quoted_price, agreed_price, deposit_amount, deposit_due_date, balance_due_date, rating, favourite, notes)
  values (v_event_id, 'Photography', 'booked', 'Aperture Simcha Photography', 'Rivka Green', '020 3455 8890', 'hello@aperturesimcha.example', 1800.00, 1750.00, 400.00, current_date - 95, current_date + 57, 5, true, 'Full weekend coverage, Friday night through the Sunday party.')
  returning id into v_vendor_photographer;

  insert into public.bm_vendors (event_id, category, status, name, contact_name, phone, email, quoted_price, notes)
  values (v_event_id, 'Videography', 'quote_received', 'Frame & Faith Films', 'Josh Bennett', '020 3455 1122', 'studio@frameandfaith.example', 1400.00, 'Quote received — comparing against doing photography only.')
  returning id into v_vendor_videographer;

  insert into public.bm_vendors (event_id, category, status, name, contact_name, phone, email, notes)
  values (v_event_id, 'Florist', 'contacted', 'Bloom & Blossom Florists', 'Anna Reece', '01923 555 330', 'hello@bloomblossom.example', 'Waiting on a quote for the top table and centrepieces.')
  returning id into v_vendor_florist;

  insert into public.bm_vendors (event_id, category, status, name, contact_name, phone, email, quoted_price, agreed_price, rating, notes)
  values (v_event_id, 'Invitations & Printing', 'fully_paid', 'Print & Parchment Stationery', 'Debbie Cohen', '020 8202 4455', 'orders@printparchment.example', 650.00, 620.00, 5, 'Printed the save-the-dates and invitations.')
  returning id into v_vendor_invitations;

  insert into public.bm_vendors (event_id, category, status, name, contact_name, phone, email, notes)
  values (v_event_id, 'Judaica & Gifts', 'researching', 'The Judaica Gallery', 'Miriam Segal', '020 8202 9090', 'sales@judaicagallery.example', 'Looking at personalised kippot and bentcher options.')
  returning id into v_vendor_judaica;

  insert into public.bm_vendors (event_id, category, status, name, contact_name, phone, email, quoted_price, agreed_price, deposit_amount, deposit_due_date, balance_due_date, rating, notes)
  values (v_event_id, 'Children''s Entertainer', 'booked', 'Star Kidz Entertainment', 'Charlie Wren', '07700 900789', 'bookings@starkidz.example', 450.00, 420.00, 100.00, current_date - 90, current_date + 58, 4, 'Face painting, balloon modelling and a magic show for the Sunday party.')
  returning id into v_vendor_kids_entertainer;

  insert into public.bm_vendors (event_id, category, status, name, contact_name, phone, email, notes)
  values (v_event_id, 'Security & Transport', 'not_proceeding', 'SecureRide Events Transport', 'Paul Ingram', '01923 555 440', 'info@securideevents.example', 'Decided against — the Hoffmans are helping arrange transport instead.')
  returning id into v_vendor_security;

  -- Vendor comparison quotes
  insert into public.bm_vendor_quotes (event_id, vendor_id, label, amount, includes, valid_until, received_at)
  values
    (v_event_id, v_vendor_band, 'Standard 5-piece line-up', 1800.00, 'DJ MC, 5 musicians, sound system, 4 hours', current_date + 30, current_date - 110),
    (v_event_id, v_vendor_band, 'Premium 7-piece with horn section', 2400.00, '7 musicians incl. horn section, sound + lighting, 5 hours', current_date + 30, current_date - 108),
    (v_event_id, v_vendor_photographer, 'Full weekend coverage package', 1800.00, 'Friday night through the Sunday party, online gallery, 200 printed images', current_date + 20, current_date - 96);

  -- ==========================================================================================
  -- Expenses and payments
  -- ==========================================================================================

  insert into public.bm_expenses (event_id, vendor_id, category, description, budgeted, estimated, quoted, agreed, vat_amount, due_date, payment_method, notes)
  values (v_event_id, v_vendor_venue, 'Venue', 'Venue hire — The Grove, Ballroom + Marquee', 18000.00, 18000.00, 18000.00, 17500.00, 2916.67, current_date + 14, 'Bank transfer', 'Balance due six weeks before the event.')
  returning id into v_exp_venue;

  insert into public.bm_expenses (event_id, vendor_id, category, description, budgeted, estimated, quoted, agreed, vat_amount, due_date, payment_method)
  values (v_event_id, v_vendor_caterer, 'Catering', 'Shabbos and Sunday catering package', 9000.00, 9000.00, 9200.00, 8800.00, 1466.67, current_date + 50, 'Bank transfer')
  returning id into v_exp_caterer;

  insert into public.bm_expenses (event_id, vendor_id, category, description, budgeted, estimated, quoted, agreed, due_date, payment_method)
  values (v_event_id, v_vendor_band, 'Entertainment', 'Live band — Sunday party', 2200.00, 2200.00, 2400.00, 2100.00, current_date + 55, 'Bank transfer')
  returning id into v_exp_band;

  insert into public.bm_expenses (event_id, vendor_id, category, description, budgeted, estimated, quoted, agreed, due_date, payment_method)
  values (v_event_id, v_vendor_photographer, 'Photography', 'Weekend photography package', 1800.00, 1800.00, 1800.00, 1750.00, current_date + 57, 'Bank transfer')
  returning id into v_exp_photographer;

  insert into public.bm_expenses (event_id, vendor_id, category, description, budgeted, estimated, quoted, agreed, due_date, payment_method)
  values (v_event_id, v_vendor_invitations, 'Stationery', 'Save-the-dates and invitations, printed', 700.00, 680.00, 650.00, 620.00, current_date - 40, 'Card')
  returning id into v_exp_invitations;

  insert into public.bm_expenses (event_id, vendor_id, category, description, budgeted, estimated, quoted, agreed, due_date, payment_method)
  values (v_event_id, v_vendor_kids_entertainer, 'Entertainment', 'Children''s entertainer — Sunday party', 450.00, 450.00, 450.00, 420.00, current_date + 58, 'Bank transfer')
  returning id into v_exp_kids_entertainer;

  insert into public.bm_expenses (event_id, category, description, budgeted, estimated, due_date, payment_method)
  values (v_event_id, 'Attire', 'Daniel''s Bar Mitzvah suit, shirt and shoes', 500.00, 480.00, current_date + 10, 'Card')
  returning id into v_exp_suit;

  insert into public.bm_expenses (event_id, category, description, budgeted, estimated, agreed, due_date, payment_method)
  values (v_event_id, 'Gifts', 'Kiddush sponsorship and a gift for the shul', 300.00, 300.00, 300.00, current_date - 8, 'Cheque')
  returning id into v_exp_gift;

  insert into public.bm_payments (event_id, expense_id, amount, status, due_date, paid_at, method, reference)
  values
    (v_event_id, v_exp_venue, 5000.00, 'paid', null, current_date - 150, 'bank_transfer', 'GROVE-DEP-2287'),
    (v_event_id, v_exp_venue, 12500.00, 'scheduled', current_date + 14, null, 'bank_transfer', null),
    (v_event_id, v_exp_caterer, 2000.00, 'paid', null, current_date - 120, 'bank_transfer', 'KKC-DEP-114'),
    (v_event_id, v_exp_caterer, 6800.00, 'scheduled', current_date + 50, null, 'bank_transfer', null),
    (v_event_id, v_exp_band, 500.00, 'paid', null, current_date - 100, 'bank_transfer', null),
    (v_event_id, v_exp_band, 1600.00, 'scheduled', current_date + 55, null, 'bank_transfer', null),
    (v_event_id, v_exp_photographer, 400.00, 'paid', null, current_date - 95, 'card', null),
    (v_event_id, v_exp_photographer, 1350.00, 'scheduled', current_date + 57, null, 'bank_transfer', null),
    (v_event_id, v_exp_invitations, 620.00, 'paid', null, current_date - 38, 'card', 'PP-INV-5541'),
    (v_event_id, v_exp_kids_entertainer, 100.00, 'paid', null, current_date - 88, 'bank_transfer', null),
    (v_event_id, v_exp_kids_entertainer, 320.00, 'scheduled', current_date + 58, null, 'bank_transfer', null),
    (v_event_id, v_exp_suit, 480.00, 'scheduled', current_date + 10, null, 'card', null),
    (v_event_id, v_exp_gift, 300.00, 'paid', null, current_date - 8, 'cheque', null);

  -- ==========================================================================================
  -- Tasks
  -- ==========================================================================================

  insert into public.bm_tasks (event_id, title, category, due_date, priority, status, vendor_id, guest_id, completed_at)
  values (v_event_id, 'Pay venue deposit', 'Venue', current_date - 75, 'high', 'done', v_vendor_venue, null, now() - interval '80 days');

  insert into public.bm_tasks (event_id, title, category, due_date, priority, status, vendor_id, guest_id)
  values (v_event_id, 'Confirm final guest numbers with The Grove', 'Venue', current_date + 21, 'high', 'in_progress', v_vendor_venue, null);

  insert into public.bm_tasks (event_id, title, category, due_date, priority, status, vendor_id, guest_id, completed_at)
  values (v_event_id, 'Sign catering contract', 'Catering', current_date - 60, 'high', 'done', v_vendor_caterer, null, now() - interval '58 days');

  insert into public.bm_tasks (event_id, title, category, due_date, priority, status, vendor_id, guest_id)
  values (v_event_id, 'Confirm dietary requirements with the caterer', 'Catering', current_date + 28, 'medium', 'todo', v_vendor_caterer, null);

  insert into public.bm_tasks (event_id, title, category, due_date, priority, status, vendor_id, guest_id, notes)
  select v_event_id, 'Follow up on Naomi Katz''s nut allergy details', 'Guests', current_date - 5, 'high', 'waiting', null, g.id, 'Need written confirmation from the caterer that the kitchen is nut-free for her table.'
  from public.bm_guests g where g.household_id = v_hh_katz and g.first_name = 'Naomi';

  insert into public.bm_tasks (event_id, title, category, due_date, priority, status, vendor_id, guest_id)
  values (v_event_id, 'Order Daniel''s suit and shoes', 'Attire', current_date + 10, 'medium', 'in_progress', null, null);

  insert into public.bm_tasks (event_id, title, category, due_date, priority, status, vendor_id, guest_id)
  select v_event_id, 'Book hair and make-up trial for Michelle', 'Attire', current_date + 30, 'low', 'todo', null, g.id
  from public.bm_guests g where g.household_id = v_hh_grossman and g.first_name = 'Michelle';

  insert into public.bm_tasks (event_id, title, category, due_date, priority, status, vendor_id, guest_id)
  values (v_event_id, 'Confirm band set list and first dance song', 'Entertainment', current_date + 35, 'medium', 'todo', v_vendor_band, null);

  insert into public.bm_tasks (event_id, title, category, due_date, priority, status, vendor_id, guest_id)
  values (v_event_id, 'Brief photographer on the family group shot list', 'Entertainment', current_date + 25, 'medium', 'todo', v_vendor_photographer, null);

  insert into public.bm_tasks (event_id, title, category, due_date, priority, status, vendor_id, guest_id)
  select v_event_id, 'Chase RSVP from the Stein household', 'Guests', current_date - 3, 'medium', 'waiting', null, g.id
  from public.bm_guests g where g.household_id = v_hh_stein and g.first_name = 'Neil';

  insert into public.bm_tasks (event_id, title, category, due_date, priority, status, vendor_id, guest_id)
  select v_event_id, 'Chase RSVP from the Schiff household', 'Guests', current_date - 2, 'medium', 'waiting', null, g.id
  from public.bm_guests g where g.household_id = v_hh_schiff and g.first_name = 'Paul';

  insert into public.bm_tasks (event_id, title, category, due_date, priority, status, vendor_id, guest_id)
  values (v_event_id, 'Finalise seating plan for Shabbos lunch', 'Logistics', current_date + 40, 'high', 'todo', null, null);

  insert into public.bm_tasks (event_id, title, category, due_date, priority, status, vendor_id, guest_id)
  values (v_event_id, 'Order kippot and bentchers with Daniel''s name', 'Logistics', current_date + 20, 'medium', 'todo', v_vendor_judaica, null);

  insert into public.bm_tasks (event_id, title, category, due_date, priority, status, vendor_id, guest_id, notes)
  select v_event_id, 'Arrange transport for the Rabbi and Rebbetzin', 'Logistics', current_date + 5, 'low', 'cancelled', null, g.id, 'The Weiss family are driving themselves after all.'
  from public.bm_guests g where g.household_id = v_hh_weiss and g.first_name = 'Aharon';

  insert into public.bm_tasks (event_id, title, category, due_date, priority, status, vendor_id, guest_id, completed_at)
  values (v_event_id, 'Book children''s entertainer for Sunday party', 'Entertainment', current_date - 30, 'medium', 'done', v_vendor_kids_entertainer, null, now() - interval '32 days');

  insert into public.bm_tasks (event_id, title, category, due_date, priority, status, vendor_id, guest_id, completed_at)
  select v_event_id, 'Send save-the-date follow-up to overseas guests', 'Guests', current_date - 90, 'medium', 'done', null, g.id, now() - interval '91 days'
  from public.bm_guests g where g.household_id = v_hh_katz and g.first_name = 'Yossi';

  insert into public.bm_tasks (event_id, title, category, due_date, priority, status, vendor_id, guest_id, notes)
  values (v_event_id, 'Confirm security/transport arrangements', 'Logistics', current_date - 10, 'low', 'cancelled', v_vendor_security, null, 'Decided not to use an external security/transport company.');

  -- ==========================================================================================
  -- Menu (Shabbos lunch)
  -- ==========================================================================================

  insert into public.bm_menus (event_id, function_id, name, version_label, is_final)
  values (v_event_id, v_fn_lunch, 'Shabbos Lunch Menu', 'Draft v1', false)
  returning id into v_menu_lunch;

  insert into public.bm_menu_sections (event_id, menu_id, name, sort_order)
  values (v_event_id, v_menu_lunch, 'Starter', 0)
  returning id into v_menu_sec_starter;

  insert into public.bm_menu_sections (event_id, menu_id, name, sort_order)
  values (v_event_id, v_menu_lunch, 'Main', 1)
  returning id into v_menu_sec_main;

  insert into public.bm_menu_sections (event_id, menu_id, name, sort_order)
  values (v_event_id, v_menu_lunch, 'Dessert', 2)
  returning id into v_menu_sec_dessert;

  insert into public.bm_menu_sections (event_id, menu_id, name, sort_order)
  values (v_event_id, v_menu_lunch, 'Children''s Menu', 3)
  returning id into v_menu_sec_kids;

  -- bm_menu_sections has no approval flag of its own — "the Starter section is fully approved"
  -- is expressed by approving every item within it (below); Main/Dessert/Children's Menu are not.

  insert into public.bm_menu_items (event_id, section_id, name, description, cost, quantity, serving_style, allergens, approved, sort_order)
  values
    (v_event_id, v_menu_sec_starter, 'Chopped liver & challah crisps', 'Traditional chopped liver, toasted challah crisps, pickled shallot', 8.50, 60, 'plated', '{}'::text[], true, 0),
    (v_event_id, v_menu_sec_starter, 'Chrein-cured salmon gravlax', 'House-cured salmon, beetroot chrein, rye crumb', 9.00, 60, 'plated', array['fish'], true, 1),
    (v_event_id, v_menu_sec_starter, 'Golden vegetable soup with kneidlach', 'Classic golden chicken soup, fluffy kneidlach', 6.50, 60, 'plated', array['gluten'], true, 2);

  insert into public.bm_menu_items (event_id, section_id, vendor_id, name, description, cost, quantity, serving_style, allergens, approved, sort_order)
  values
    (v_event_id, v_menu_sec_main, v_vendor_caterer, 'Herb-crusted rib of beef', 'Slow-roast rib of beef, herb crust, red wine jus', 32.00, 40, 'plated', '{}'::text[], false, 0),
    (v_event_id, v_menu_sec_main, v_vendor_caterer, 'Lemon & za''atar chicken supreme', 'Free-range chicken supreme, lemon and za''atar jus', 24.00, 40, 'plated', '{}'::text[], false, 1),
    (v_event_id, v_menu_sec_main, v_vendor_caterer, 'Butternut & chestnut wellington (vegetarian)', 'Roast butternut, chestnut and sage wellington', 19.00, 10, 'plated', array['nuts', 'gluten'], false, 2),
    (v_event_id, v_menu_sec_main, v_vendor_caterer, 'Confit salmon, dill new potatoes', 'Slow confit salmon, crushed dill new potatoes', 26.00, 10, 'plated', array['fish'], false, 3);

  insert into public.bm_menu_items (event_id, section_id, name, description, cost, quantity, serving_style, allergens, approved, sort_order)
  values
    (v_event_id, v_menu_sec_dessert, 'Warm apple & cinnamon crumble', 'Served with non-dairy custard', 7.00, 60, 'plated', array['gluten'], false, 0),
    (v_event_id, v_menu_sec_dessert, 'Chocolate & hazelnut torte', 'Flourless chocolate and hazelnut torte', 8.00, 60, 'plated', array['nuts'], false, 1);

  insert into public.bm_menu_items (event_id, section_id, name, description, cost, quantity, serving_style, allergens, approved, sort_order)
  values
    (v_event_id, v_menu_sec_kids, 'Chicken schnitzel goujons & chips', 'Breaded chicken goujons, chips, ketchup', 9.00, 17, 'plated', array['gluten'], false, 0),
    (v_event_id, v_menu_sec_kids, 'Mini beef sliders', 'Mini beef sliders, soft rolls', 9.00, 17, 'plated', '{}'::text[], false, 1),
    (v_event_id, v_menu_sec_kids, 'Pasta with tomato sauce', 'Plain pasta, tomato sauce, no dairy', 7.00, 17, 'plated', array['gluten'], false, 2);

  -- ==========================================================================================
  -- Idea boards and ideas
  -- ==========================================================================================

  insert into public.bm_idea_boards (event_id, name, sort_order) values (v_event_id, 'Theme & Decor', 0) returning id into v_board_theme;
  insert into public.bm_idea_boards (event_id, name, sort_order) values (v_event_id, 'Entertainment', 1) returning id into v_board_entertainment;
  insert into public.bm_idea_boards (event_id, name, sort_order) values (v_event_id, 'Menu Ideas', 2) returning id into v_board_menu;
  insert into public.bm_idea_boards (event_id, name, sort_order) values (v_event_id, 'Merchandise', 3) returning id into v_board_merch;
  insert into public.bm_idea_boards (event_id, name, sort_order) values (v_event_id, 'Clothing', 4) returning id into v_board_clothing;

  insert into public.bm_ideas (event_id, board_id, title, description, source_url, cost_estimate, status, sort_order)
  values
    (v_event_id, v_board_theme, 'Champagne & ivory balloon arch for entrance', 'Organic balloon arch in champagne, ivory and gold over the marquee entrance', 'https://www.pinterest.com/pin/745821903366120001/', 450.00, 'approved', 0),
    (v_event_id, v_board_theme, 'Gold-rimmed charger plates', 'Hire gold-rimmed chargers for the top table and round tables', null, 220.00, 'shortlisted', 1),
    (v_event_id, v_board_theme, 'Neon sign "Mazel Tov Daniel"', 'Warm-white neon sign for the dance floor backdrop', 'https://www.etsy.com/uk/listing/987654321/neon-mazel-tov-sign', 180.00, 'considering', 2);

  insert into public.bm_ideas (event_id, board_id, title, description, cost_estimate, status, notes, sort_order)
  values
    (v_event_id, v_board_entertainment, 'Photo booth with props', 'Open-air photo booth with a Jewish-themed prop box', 350.00, 'approved', null, 0),
    (v_event_id, v_board_entertainment, 'Silent disco for the after-party', 'Three-channel silent disco headsets', 900.00, 'rejected', 'Too complex for the marquee''s layout and the neighbours.', 1);

  insert into public.bm_ideas (event_id, board_id, title, description, source_url, status, sort_order)
  values (v_event_id, v_board_entertainment, 'Fireworks send-off', 'Low-noise fireworks as guests leave the Sunday party', 'https://www.youtube.com/watch?v=lechlecha2026bm', 'inspiration', 2);

  insert into public.bm_ideas (event_id, board_id, title, description, vendor_id, cost_estimate, status, sort_order)
  values
    (v_event_id, v_board_menu, 'Candy cart / sweet table', 'Pick-and-mix sweet table styled in champagne and ivory', null, 300.00, 'purchased', 0),
    (v_event_id, v_board_menu, 'Late-night bagel bar', 'Salt beef and cream cheese bagel bar at 10pm', null, 250.00, 'shortlisted', 1);

  insert into public.bm_ideas (event_id, board_id, title, description, cost_estimate, status, sort_order)
  values (v_event_id, v_board_menu, 'Mocktail bar for the kids', 'Alcohol-free mocktail bar for the children''s table', 200.00, 'considering', 2);

  insert into public.bm_ideas (event_id, board_id, title, description, vendor_id, cost_estimate, status, sort_order)
  values
    (v_event_id, v_board_merch, 'Personalised kippot embroidered "Daniel — 20 Cheshvan"', 'Suede kippot embroidered with Daniel''s name and Hebrew date', v_vendor_judaica, 180.00, 'purchased', 0),
    (v_event_id, v_board_merch, 'Engraved bentchers as favours', 'Personalised bentcher booklets as a take-home favour', v_vendor_judaica, 220.00, 'approved', 1);

  insert into public.bm_ideas (event_id, board_id, title, description, cost_estimate, status, sort_order)
  values (v_event_id, v_board_merch, 'Bar Mitzvah hoodies for the boys', 'Matching hoodies for Daniel and his close friends', 400.00, 'considering', 2);

  insert into public.bm_ideas (event_id, board_id, title, description, cost_estimate, status, sort_order)
  values (v_event_id, v_board_clothing, 'Daniel''s suit — navy three-piece', 'Navy three-piece suit with a champagne tie to match the theme', 480.00, 'purchased', 0);

  insert into public.bm_ideas (event_id, board_id, title, description, source_url, status, sort_order)
  values (v_event_id, v_board_clothing, 'Michelle''s dress shortlist', 'A few options in champagne and blush to choose between', 'https://www.net-a-porter.example/en-gb/shop/product/example-occasion-dress/1234567', 'inspiration', 1);

  -- ==========================================================================================
  -- Seating: plan, floor objects, seat assignments, preferences
  -- ==========================================================================================

  insert into public.bm_seating_plans (event_id, function_id, name)
  values (v_event_id, v_fn_lunch, 'Shabbos Lunch Seating')
  returning id into v_plan_id;

  insert into public.bm_floor_objects (event_id, plan_id, kind, label, table_number, capacity, x, y, width, height, rotation)
  values
    (v_event_id, v_plan_id, 'top_table', 'Top Table', null, 10, 900, 100, 400, 120, 0),
    (v_event_id, v_plan_id, 'table_round', 'Table 1', 1, 10, 200, 400, 150, 150, 0),
    (v_event_id, v_plan_id, 'table_round', 'Table 2', 2, 10, 500, 400, 150, 150, 0),
    (v_event_id, v_plan_id, 'table_round', 'Table 3', 3, 8, 800, 400, 150, 150, 0),
    (v_event_id, v_plan_id, 'table_round', 'Table 4', 4, 10, 1100, 400, 150, 150, 0),
    (v_event_id, v_plan_id, 'table_round', 'Table 5', 5, 10, 1400, 400, 150, 150, 0),
    (v_event_id, v_plan_id, 'table_round', 'Table 6', 6, 8, 1700, 400, 150, 150, 0),
    (v_event_id, v_plan_id, 'table_rect', 'Table 7', 7, 10, 200, 700, 220, 100, 90),
    (v_event_id, v_plan_id, 'table_rect', 'Table 8', 8, 10, 500, 700, 220, 100, 90),
    (v_event_id, v_plan_id, 'table_round', 'Table 9', 9, 9, 800, 700, 150, 150, 0),
    (v_event_id, v_plan_id, 'kids_table', 'Kids Table 1', null, 10, 1400, 700, 180, 120, 0),
    (v_event_id, v_plan_id, 'kids_table', 'Kids Table 2', null, 10, 1700, 700, 180, 120, 0);

  -- Top Table: the Grossman, Kleinman and Weiss households.
  insert into public.bm_seat_assignments (event_id, plan_id, guest_id, object_id, seat_index)
  select v_event_id, v_plan_id, g.id, o.id, row_number() over (order by g.sort_order)
  from public.bm_guests g
  join public.bm_floor_objects o on o.plan_id = v_plan_id and o.label = 'Top Table'
  where g.household_id in (v_hh_grossman, v_hh_kleinman, v_hh_weiss)
    and (g.household_id <> v_hh_grossman or g.first_name in ('Jonathan', 'Michelle', 'Daniel'));

  -- Table 3: the Rothstein and Berkowitz and Katz households — deliberately one over its
  -- capacity of 8 (9 guests seated) so the seating planner's over-capacity warning has real data.
  insert into public.bm_seat_assignments (event_id, plan_id, guest_id, object_id, seat_index)
  select v_event_id, v_plan_id, g.id, o.id, row_number() over (order by g.household_id, g.sort_order)
  from public.bm_guests g
  join public.bm_floor_objects o on o.plan_id = v_plan_id and o.label = 'Table 3'
  where g.household_id in (v_hh_rothstein, v_hh_berkowitz, v_hh_katz);

  -- Seating preferences (guest_a < guest_b enforced via LEAST/GREATEST on the real ids).
  insert into public.bm_seating_preferences (event_id, guest_a, guest_b, rule, note)
  select v_event_id, least(g1.id, g2.id), greatest(g1.id, g2.id), 'must_together', 'Ben and Ariel are close cousins and always ask to sit together.'
  from public.bm_guests g1, public.bm_guests g2
  where g1.household_id = v_hh_rothstein and g1.first_name = 'Ben'
    and g2.household_id = v_hh_katz and g2.first_name = 'Ariel';

  insert into public.bm_seating_preferences (event_id, guest_a, guest_b, rule, note)
  select v_event_id, least(g1.id, g2.id), greatest(g1.id, g2.id), 'keep_apart', 'Long-standing family disagreement — please seat away from each other.'
  from public.bm_guests g1, public.bm_guests g2
  where g1.household_id = v_hh_berkowitz and g1.first_name = 'Alan'
    and g2.household_id = v_hh_katz and g2.first_name = 'Yossi';

  -- ==========================================================================================
  -- Documents and document links
  -- ==========================================================================================

  insert into public.bm_documents (event_id, folder, name, storage_path, mime_type, notes)
  values (v_event_id, 'Contracts', 'The Grove — venue contract.pdf', v_event_id::text || '/' || gen_random_uuid()::text || '-the-grove-venue-contract.pdf', 'application/pdf', 'Signed venue contract, countersigned by Sandra Miles.')
  returning id into v_doc_venue_contract;

  insert into public.bm_documents (event_id, folder, name, storage_path, mime_type, notes)
  values (v_event_id, 'Contracts', 'Kosher Kitchen Catering — signed contract.pdf', v_event_id::text || '/' || gen_random_uuid()::text || '-kosher-kitchen-catering-contract.pdf', 'application/pdf', 'Signed catering contract and menu outline.')
  returning id into v_doc_caterer_contract;

  insert into public.bm_documents (event_id, folder, name, storage_path, mime_type, notes)
  values (v_event_id, 'Contracts', 'The Mazel Tov Function Band — booking confirmation.pdf', v_event_id::text || '/' || gen_random_uuid()::text || '-mazel-tov-band-booking.pdf', 'application/pdf', null)
  returning id into v_doc_band_contract;

  insert into public.bm_documents (event_id, folder, name, storage_path, mime_type, notes)
  values (v_event_id, 'Quotes', 'Aperture Simcha Photography — quote & terms.pdf', v_event_id::text || '/' || gen_random_uuid()::text || '-aperture-simcha-quote.pdf', 'application/pdf', null);

  insert into public.bm_documents (event_id, folder, name, storage_path, mime_type, notes)
  values (v_event_id, 'Insurance', 'Event public liability insurance certificate.pdf', v_event_id::text || '/' || gen_random_uuid()::text || '-public-liability-certificate.pdf', 'application/pdf', null);

  insert into public.bm_document_links (event_id, document_id, entity_type, entity_id)
  values
    (v_event_id, v_doc_venue_contract, 'vendor', v_vendor_venue),
    (v_event_id, v_doc_venue_contract, 'expense', v_exp_venue),
    (v_event_id, v_doc_caterer_contract, 'vendor', v_vendor_caterer),
    (v_event_id, v_doc_caterer_contract, 'expense', v_exp_caterer),
    (v_event_id, v_doc_band_contract, 'vendor', v_vendor_band);

  -- ==========================================================================================
  -- Run sheet (Sunday party)
  -- ==========================================================================================

  insert into public.bm_schedule_items (event_id, function_id, starts_at, duration_minutes, activity, location, responsible, vendor_id, audience, sort_order)
  values
    (v_event_id, v_fn_party, timestamptz '2026-10-25 14:00:00', 120, 'Supplier access & venue dress', 'The Grove — Marquee', 'Venue duty manager', null, 'organisers', 0),
    (v_event_id, v_fn_party, timestamptz '2026-10-25 16:00:00', 60, 'Photographer arrives for family portraits', 'The Grove — Gardens', null, v_vendor_photographer, 'family', 1),
    (v_event_id, v_fn_party, timestamptz '2026-10-25 17:30:00', 45, 'Band soundcheck', 'The Grove — Marquee', null, v_vendor_band, 'vendors', 2),
    (v_event_id, v_fn_party, timestamptz '2026-10-25 18:30:00', 30, 'Guests arrive & welcome drinks', 'The Grove — Marquee', null, null, 'all', 3),
    (v_event_id, v_fn_party, timestamptz '2026-10-25 19:00:00', 15, 'Formal entrance — Daniel & family', 'The Grove — Marquee', null, null, 'all', 4),
    (v_event_id, v_fn_party, timestamptz '2026-10-25 19:20:00', 30, 'Starter served', 'The Grove — Marquee', null, null, 'all', 5),
    (v_event_id, v_fn_party, timestamptz '2026-10-25 19:50:00', 20, 'Speeches', 'The Grove — Marquee', 'Jonathan Grossman', null, 'all', 6),
    (v_event_id, v_fn_party, timestamptz '2026-10-25 20:15:00', 40, 'Main course served', 'The Grove — Marquee', null, null, 'all', 7),
    (v_event_id, v_fn_party, timestamptz '2026-10-25 21:00:00', 90, 'Dancing & entertainment', 'The Grove — Marquee', null, v_vendor_band, 'all', 8),
    (v_event_id, v_fn_party, timestamptz '2026-10-25 22:30:00', 30, 'Dessert & candle-lighting ceremony', 'The Grove — Marquee', null, null, 'family', 9);

  -- ==========================================================================================
  -- Custom contacts
  -- ==========================================================================================

  insert into public.bm_custom_contacts (event_id, name, role, phone, email)
  values
    (v_event_id, 'Sandra Miles', 'Venue Duty Manager (The Grove)', '01923 555 210', 'sandra.miles@thegrove.example'),
    (v_event_id, 'Debbie Marsh', 'Family friend — day-of coordinator', '07700 900123', 'debbie.marsh@gmail.example'),
    (v_event_id, 'Ollie Grant', 'Band leader / MC contact', '07700 900456', 'ollie@mazeltovband.example');

  -- ==========================================================================================
  -- Notes
  -- ==========================================================================================

  insert into public.bm_notes (event_id, title, body, pinned)
  values (v_event_id, 'Key contacts cheat-sheet', '**Venue**: Sandra Miles, 01923 555 210' || chr(10) || '**Caterer**: Miriam Ellis, 020 8455 3020' || chr(10) || '**Band**: Ollie Grant, 07700 900456' || chr(10) || chr(10) || '- [ ] Print a paper copy for the day-of coordinator', true);

  insert into public.bm_notes (event_id, title, body, pinned, entity_type, entity_id)
  values (v_event_id, 'Venue walk-through — 12 Aug', 'Walked the ballroom and marquee with Sandra. Confirmed the marquee can seat 120 with a dance floor and the ballroom Kiddush layout works with the garden room overflow.', false, 'vendor', v_vendor_venue);

  insert into public.bm_notes (event_id, body, pinned)
  values (v_event_id, 'Remember to confirm shul seating for the Rabbi separately from the Shabbos lunch seating plan.', false);

  insert into public.bm_notes (event_id, title, body, pinned, entity_type, entity_id)
  values (v_event_id, 'Katz family visit logistics', 'The Katz family land Thursday evening and need an airport pickup from Luton — Gary Hoffman has kindly offered to arrange this. They''re staying at a hotel near the Grove through Sunday morning.', false, 'household', v_hh_katz);

  -- ==========================================================================================
  -- Activity log (back-dated)
  -- ==========================================================================================

  insert into public.bm_activity_log (event_id, actor_kind, action, entity_type, entity_id, summary, created_at)
  values
    (v_event_id, 'member', 'event_created', 'event', v_event_id, 'Event created and demo workspace set up', now() - interval '95 days'),
    (v_event_id, 'member', 'guest_added', 'household', v_hh_grossman, 'Added the Grossman immediate family household', now() - interval '94 days'),
    (v_event_id, 'member', 'guest_added', 'household', v_hh_katz, 'Added the Katz household (overseas, Jerusalem)', now() - interval '90 days'),
    (v_event_id, 'member', 'vendor_status_changed', 'vendor', v_vendor_venue, 'The Grove moved from shortlisted to booked', now() - interval '85 days'),
    (v_event_id, 'member', 'invitation_sent', 'household', v_hh_adler, 'RSVP link sent to the Adler household via WhatsApp', now() - interval '72 days'),
    (v_event_id, 'member', 'invitation_sent', 'household', v_hh_friedman, 'RSVP link sent to the Friedman household by email', now() - interval '69 days'),
    (v_event_id, 'rsvp_portal', 'rsvp_submitted', 'household', v_hh_adler, 'Adler household submitted their RSVP via the guest portal', now() - interval '60 days'),
    (v_event_id, 'rsvp_portal', 'rsvp_submitted', 'household', v_hh_friedman, 'Friedman household submitted their RSVP via the guest portal', now() - interval '55 days'),
    (v_event_id, 'member', 'payment_recorded', 'vendor', v_vendor_caterer, 'Deposit payment recorded for Kosher Kitchen Catering Co', now() - interval '50 days'),
    (v_event_id, 'member', 'task_completed', 'task', null, 'Marked "Book children''s entertainer for Sunday party" as done', now() - interval '32 days'),
    (v_event_id, 'member', 'vendor_status_changed', 'vendor', v_vendor_venue, 'The Grove marked fully paid after the balance was settled', now() - interval '20 days'),
    (v_event_id, 'member', 'seating_assigned', 'function', v_fn_lunch, 'Started seating the Shabbos lunch — Top Table and Table 3 assigned', now() - interval '14 days'),
    (v_event_id, 'member', 'vendor_status_changed', 'vendor', v_vendor_security, 'SecureRide Events Transport marked as not proceeding', now() - interval '8 days');

  -- ==========================================================================================
  -- Invitation tracking (a representative handful, not every household)
  -- ==========================================================================================

  insert into public.bm_invitations (event_id, household_id, channel, sent_at)
  values (v_event_id, v_hh_adler, 'whatsapp', now() - interval '72 days')
  returning id into v_invitation_adler;

  insert into public.bm_invitations (event_id, household_id, channel, sent_at)
  values (v_event_id, v_hh_friedman, 'email', now() - interval '69 days')
  returning id into v_invitation_friedman;

  insert into public.bm_invitation_events (event_id, household_id, invitation_id, kind, channel, created_at)
  values
    (v_event_id, v_hh_adler, v_invitation_adler, 'sent', 'whatsapp', now() - interval '72 days'),
    (v_event_id, v_hh_adler, v_invitation_adler, 'opened', null, now() - interval '65 days'),
    (v_event_id, v_hh_adler, null, 'rsvp_clicked', null, now() - interval '61 days'),
    (v_event_id, v_hh_adler, null, 'completed', null, now() - interval '60 days'),
    (v_event_id, v_hh_friedman, v_invitation_friedman, 'sent', 'email', now() - interval '69 days'),
    (v_event_id, v_hh_friedman, v_invitation_friedman, 'opened', null, now() - interval '58 days'),
    (v_event_id, v_hh_schiff, null, 'sent', null, now() - interval '80 days'),
    (v_event_id, v_hh_stein, null, 'sent', null, now() - interval '75 days'),
    (v_event_id, v_hh_stein, null, 'opened', null, now() - interval '40 days');

  return v_event_id;
end;
$$;

-- ============================================================================================
-- 3. Permissions
-- ============================================================================================

revoke all on function public.bm_ensure_event_provisioned() from public;
revoke all on function public.bm_seed_demo_event(uuid) from public;

grant execute on function public.bm_ensure_event_provisioned() to authenticated;
grant execute on function public.bm_seed_demo_event(uuid) to authenticated;
