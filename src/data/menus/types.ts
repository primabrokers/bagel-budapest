/**
 * Row types for `bm_menus` / `bm_menu_sections` / `bm_menu_items` — see migration 6
 * (`supabase/migrations/20260828030500_bm_planning_modules.sql`) for the applied schema these
 * mirror field-for-field. Hand-written, not generated — see CLAUDE.md's data-layer note.
 */

export interface MenuRow {
  id: string;
  event_id: string;
  /** Null for a menu not tied to any one function (an event-wide menu). */
  function_id: string | null;
  name: string;
  /** Free text — "v1", "Caterer's second draft", "Final" … whatever the family calls it. */
  version_label: string | null;
  /** At most one menu per function is expected to carry this — `setMenuFinal` enforces it by
   *  clearing the flag on every sibling menu for the same function when a new one is marked. */
  is_final: boolean;
  created_at: string;
  updated_at: string;
}

export interface MenuSectionRow {
  id: string;
  event_id: string;
  menu_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface MenuItemRow {
  id: string;
  event_id: string;
  section_id: string;
  name: string;
  description: string | null;
  /** Null — a menu item need not name a vendor (e.g. a homemade dish, an unattributed course). */
  vendor_id: string | null;
  cost: number | null;
  quantity: number | null;
  serving_style: string | null;
  allergens: string[];
  approved: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** One section with its items embedded, in `sort_order` — the shape `useMenus()` nests under
 *  each menu via a PostgREST nested select rather than a separate per-section query. */
export interface MenuSectionWithItems extends MenuSectionRow {
  items: MenuItemRow[];
}

/** One menu with its sections (each carrying its own items) embedded — the whole shape
 *  `useMenus()` returns and everything `MenuPage`/`MenuEditor` read from. */
export interface MenuWithSections extends MenuRow {
  sections: MenuSectionWithItems[];
}
