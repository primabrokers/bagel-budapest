import { useFetch } from '../../lib/useFetch';
import { supabase } from '../../lib/supabase';
import { useEventContext } from '../event/context';
import type { BoardWithIdeas, IdeaBoardRow, IdeaRow } from './types';

/** The shape a `bm_idea_boards` row comes back as once `bm_ideas` is embedded via PostgREST's
 *  foreign-table select syntax — see the query below. */
interface RawBoard extends IdeaBoardRow {
  bm_ideas: IdeaRow[] | null;
}

/**
 * The one joined fetch for the Ideas screen: every board for the current event, each with its
 * ideas embedded — one round trip rather than a board query plus a per-board idea query. Boards
 * come back in display order; ideas within each board by their own `sort_order`.
 */
export function useIdeaBoards() {
  const { eventId } = useEventContext();
  return useFetch<BoardWithIdeas[]>(async () => {
    const { data, error } = await supabase
      .from('bm_idea_boards')
      .select('*, bm_ideas(*)')
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true })
      .order('sort_order', { ascending: true, referencedTable: 'bm_ideas' });
    if (error) throw error;

    const rows = (data ?? []) as unknown as RawBoard[];
    return rows.map((raw): BoardWithIdeas => {
      const { bm_ideas, ...board } = raw;
      return { ...board, ideas: bm_ideas ?? [] };
    });
  }, [eventId]);
}
