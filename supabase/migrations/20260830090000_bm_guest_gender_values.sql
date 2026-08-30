-- bm_guests.gender was free text with nothing constraining it, but lib/seating/autoSeat.ts decides
-- which side of a mechitza a guest belongs on by comparing gender.trim().lower() to exactly 'male'
-- or 'female'. Anything else — "M", "Male " with a trailing space, a spreadsheet column of M/F —
-- left that guest with no side constraint, seated wherever the solver liked, with nothing on screen
-- to say the value had been ignored.
--
-- The app now writes only these two values (a select, not a text box) and normalises anything an
-- import brings in. This constraint is what stops the two drifting apart again.

-- Normalise anything already stored first, so the constraint can be added without rejecting rows.
-- There are no guests at all today, but a migration that only works on an empty table is a trap for
-- whoever runs it next.
update public.bm_guests
set gender = case
    when lower(btrim(gender)) in ('m', 'male', 'man', 'men', 'boy', 'b') then 'male'
    when lower(btrim(gender)) in ('f', 'female', 'woman', 'women', 'girl', 'g') then 'female'
    else null
  end
where gender is not null
  and gender not in ('male', 'female');

alter table public.bm_guests drop constraint if exists bm_guests_gender_check;

alter table public.bm_guests
  add constraint bm_guests_gender_check
  check (gender is null or gender in ('male', 'female'));

comment on column public.bm_guests.gender is
  'male | female | null. Constrained because autoSeat''s mechitza split matches these exact values; null means not recorded yet and leaves the guest unconstrained rather than guessed at.';
