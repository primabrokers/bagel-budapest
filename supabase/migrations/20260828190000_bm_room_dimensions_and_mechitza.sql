-- Bar Mitzvah Planner — Migration 12: real room dimensions + mechitza
--
-- Until now every seating plan was drawn in a fixed 20m x 15m room, because ROOM_WIDTH /
-- ROOM_HEIGHT were hard-coded constants in FloorCanvas.tsx. A family cannot work out how many
-- tables fit in THEIR hall from a room that is not their hall, so the dimensions move into the
-- plan and the canvas reads them.
--
-- Three changes:
--
-- 1. room_width_cm / room_length_cm on bm_seating_plans, both NULLABLE. Null means "not measured
--    yet", and the app falls back to the old 2000 x 1500 so every plan that already exists keeps
--    rendering exactly as it does today. Centimetres, matching bm_floor_objects.x/y/width/height
--    — the UI asks for metres and converts, because nobody measures a ballroom in centimetres.
--
-- 2. separate_seating on bm_seating_plans. Whether the auto-seater should place men and women on
--    opposite sides of a mechitza. Deliberately a stored per-plan CHOICE rather than something
--    inferred from the presence of a mechitza object: communities differ on whether the meal is
--    separately seated at all, some have a mechitza for davening only, and a plan for the kiddush
--    may differ from the plan for the party. Defaults false, so nothing starts dividing a guest
--    list by gender unless a family has actually asked for it.
--
-- 3. 'mechitza' added to the bm_floor_objects kind check. A mechitza is a physical partition
--    standing in the room, so it belongs in the floor objects table alongside the dance floor and
--    the stage — not as plan metadata. It is not seatable (see lib/seating/tableGeometry.ts,
--    whose SEATABLE_KINDS deliberately does not include it), and the room planner treats it as a
--    divider that tables may not straddle.
--
-- Forward-only: the check constraint is dropped and recreated with the wider list rather than the
-- original migration being edited.

alter table public.bm_seating_plans
  add column if not exists room_width_cm int,
  add column if not exists room_length_cm int,
  add column if not exists separate_seating boolean not null default false;

-- Guard against a nonsense room. The upper bound is deliberately generous (500m) — it exists to
-- catch a metres-entered-as-centimetres slip, not to have an opinion about venue size.
alter table public.bm_seating_plans
  add constraint bm_seating_plans_room_width_sane
    check (room_width_cm is null or (room_width_cm >= 100 and room_width_cm <= 50000)),
  add constraint bm_seating_plans_room_length_sane
    check (room_length_cm is null or (room_length_cm >= 100 and room_length_cm <= 50000));

alter table public.bm_floor_objects drop constraint bm_floor_objects_kind_check;

alter table public.bm_floor_objects
  add constraint bm_floor_objects_kind_check
    check (kind in (
      'table_round','table_long','table_rect','table_square','top_table','kids_table',
      'dance_floor','stage','bar','buffet','entrance','mechitza','custom'
    ));
