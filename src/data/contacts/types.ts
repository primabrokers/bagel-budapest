/**
 * Row type for `bm_custom_contacts` — see migration 6
 * (`supabase/migrations/20260828030500_bm_planning_modules.sql`) for the applied schema this
 * mirrors field-for-field. Hand-written, not generated — see CLAUDE.md's data-layer note.
 *
 * This is only one of the three sources `ContactsPage` merges — households (`useGuestBook()`,
 * read-only from `data/guests/`) and vendors (`useVendors()`, read-only from `data/vendors/`)
 * are the other two, composed client-side rather than duplicated here.
 */
export interface CustomContactRow {
  id: string;
  event_id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
