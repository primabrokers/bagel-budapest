import { useFetch } from '../../lib/useFetch';
import { supabase } from '../../lib/supabase';
import { useEventContext } from '../event/context';
import type { MenuItemRow, MenuSectionRow, MenuWithSections } from './types';

/** The shape a `bm_menus` row comes back as once `bm_menu_sections`/`bm_menu_items` are embedded
 *  via PostgREST's nested-select syntax — see the query below. */
interface RawSection extends MenuSectionRow {
  bm_menu_items: MenuItemRow[] | null;
}

interface RawMenu {
  id: string;
  event_id: string;
  function_id: string | null;
  name: string;
  version_label: string | null;
  is_final: boolean;
  created_at: string;
  updated_at: string;
  bm_menu_sections: RawSection[] | null;
}

/**
 * Every `bm_menus` row for the current event, each with its sections (and each section its
 * items) embedded — one round trip for the whole Menu screen, the same nested-select pattern
 * `useGuestBook()` uses. Menus come back newest-first (so a freshly added version sorts to the
 * top of its function's version list); sections and items within each by `sort_order`.
 */
export function useMenus() {
  const { eventId } = useEventContext();
  return useFetch<MenuWithSections[]>(async () => {
    const { data, error } = await supabase
      .from('bm_menus')
      .select('*, bm_menu_sections(*, bm_menu_items(*))')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .order('sort_order', { ascending: true, referencedTable: 'bm_menu_sections' })
      .order('sort_order', { ascending: true, referencedTable: 'bm_menu_sections.bm_menu_items' });
    if (error) throw error;

    const rows = (data ?? []) as unknown as RawMenu[];
    return rows.map((raw): MenuWithSections => {
      const { bm_menu_sections, ...menu } = raw;
      return {
        ...menu,
        sections: (bm_menu_sections ?? []).map((rawSection) => {
          const { bm_menu_items, ...section } = rawSection;
          return { ...section, items: bm_menu_items ?? [] };
        }),
      };
    });
  }, [eventId]);
}
