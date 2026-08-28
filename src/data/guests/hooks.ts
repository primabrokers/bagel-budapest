import { useFetch } from '../../lib/useFetch';
import { supabase } from '../../lib/supabase';
import { useEventContext } from '../event/context';
import type {
  GuestFunctionInviteRow,
  GuestRow,
  HouseholdRow,
  HouseholdWithGuests,
  TagRow,
} from './types';

/** The shape a `bm_households` row comes back as once `bm_guests`/`bm_household_tags` are
 *  embedded via PostgREST's foreign-table select syntax — see the query below. */
interface RawGuest extends GuestRow {
  bm_guest_tags: { tag_id: string }[] | null;
  bm_guest_function_invites: GuestFunctionInviteRow[] | null;
}

interface RawHousehold extends HouseholdRow {
  bm_household_tags: { tag_id: string }[] | null;
  bm_guests: RawGuest[] | null;
}

/**
 * The one joined fetch for the whole guest list screen: every household for the current event,
 * each with its guests, and each guest carrying its own tag ids and function invites — one round
 * trip rather than a household query plus a per-household guest query. Households come back
 * ordered by name; guests within each household by `sort_order`.
 */
export function useGuestBook() {
  const { eventId } = useEventContext();
  return useFetch<HouseholdWithGuests[]>(async () => {
    const { data, error } = await supabase
      .from('bm_households')
      .select(
        '*, bm_household_tags(tag_id), bm_guests(*, bm_guest_tags(tag_id), bm_guest_function_invites(*))',
      )
      .eq('event_id', eventId)
      .order('name', { ascending: true })
      .order('sort_order', { ascending: true, referencedTable: 'bm_guests' });
    if (error) throw error;

    const rows = (data ?? []) as unknown as RawHousehold[];
    return rows.map((raw): HouseholdWithGuests => {
      const { bm_household_tags, bm_guests, ...household } = raw;
      return {
        ...household,
        tagIds: (bm_household_tags ?? []).map((t) => t.tag_id),
        guests: (bm_guests ?? []).map((rawGuest) => {
          const { bm_guest_tags, bm_guest_function_invites, ...guest } = rawGuest;
          return {
            ...guest,
            tagIds: (bm_guest_tags ?? []).map((t) => t.tag_id),
            functionInvites: bm_guest_function_invites ?? [],
          };
        }),
      };
    });
  }, [eventId]);
}

/** Every `bm_tags` row for the current event, alphabetical. */
export function useTags() {
  const { eventId } = useEventContext();
  return useFetch<TagRow[]>(async () => {
    const { data, error } = await supabase
      .from('bm_tags')
      .select('*')
      .eq('event_id', eventId)
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as TagRow[];
  }, [eventId]);
}
