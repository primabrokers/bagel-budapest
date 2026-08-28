import { useFetch } from '../../lib/useFetch';
import { supabase } from '../../lib/supabase';
import { useEventContext } from '../event/context';
import type {
  FloorObjectRow,
  SeatAssignmentRow,
  SeatingPlanRow,
  SeatingPlanWithObjects,
  SeatingPreferenceRow,
} from './types';

/** Every `bm_seating_plans` row for the current event, oldest first — the plan switcher on
 *  `SeatingPage` lists these. */
export function useSeatingPlans() {
  const { eventId } = useEventContext();
  return useFetch<SeatingPlanRow[]>(async () => {
    const { data, error } = await supabase
      .from('bm_seating_plans')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as SeatingPlanRow[];
  }, [eventId]);
}

/** The shape a `bm_seating_plans` row comes back as once `bm_floor_objects`/
 *  `bm_seat_assignments` are embedded via PostgREST's nested-select syntax. */
interface RawFloorObject extends FloorObjectRow {
  bm_seat_assignments: SeatAssignmentRow[] | null;
}

interface RawPlan extends SeatingPlanRow {
  bm_floor_objects: RawFloorObject[] | null;
}

/** Shared by `useSeatingPlan`/`useSeatingPlansWithObjects` — turns one raw nested-select row into
 *  the `SeatingPlanWithObjects` shape both hooks return. */
function mapRawPlan(raw: RawPlan): SeatingPlanWithObjects {
  const { bm_floor_objects, ...plan } = raw;
  return {
    ...plan,
    objects: (bm_floor_objects ?? []).map((obj) => {
      const { bm_seat_assignments, ...rest } = obj;
      return { ...rest, assignments: bm_seat_assignments ?? [] };
    }),
  };
}

/**
 * One plan with its floor objects, each carrying its own seat assignments — everything
 * `FloorCanvas`/`TableDetailSheet`/the warnings checks need, in one round trip. `planId` is
 * nullable so a screen with no plan selected yet (or no plan created at all) can call this
 * unconditionally rather than branching on whether to call the hook at all.
 */
export function useSeatingPlan(planId: string | null) {
  const { eventId } = useEventContext();
  return useFetch<SeatingPlanWithObjects | null>(async () => {
    if (!planId) return null;

    const { data, error } = await supabase
      .from('bm_seating_plans')
      .select('*, bm_floor_objects(*, bm_seat_assignments(*))')
      .eq('event_id', eventId)
      .eq('id', planId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    return mapRawPlan(data as unknown as RawPlan);
  }, [eventId, planId]);
}

/**
 * EVERY seating plan for the current event, each with its floor objects and seat assignments
 * embedded — the whole-event view `lib/notifications/rules.ts`'s `seatingIncompleteNotifications`
 * needs (an unseated-guest check has to look across every plan, not just whichever one is
 * currently open on `SeatingPage`), rather than one `useSeatingPlan(id)` call per plan.
 */
export function useSeatingPlansWithObjects() {
  const { eventId } = useEventContext();
  return useFetch<SeatingPlanWithObjects[]>(async () => {
    const { data, error } = await supabase
      .from('bm_seating_plans')
      .select('*, bm_floor_objects(*, bm_seat_assignments(*))')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return ((data ?? []) as unknown as RawPlan[]).map(mapRawPlan);
  }, [eventId]);
}

/** Every `bm_seating_preferences` row for the current event — not scoped to one plan, since a
 *  preference ("keep these two apart") is a fact about the guests, not about any one layout. */
export function useSeatingPreferences() {
  const { eventId } = useEventContext();
  return useFetch<SeatingPreferenceRow[]>(async () => {
    const { data, error } = await supabase
      .from('bm_seating_preferences')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as SeatingPreferenceRow[];
  }, [eventId]);
}
