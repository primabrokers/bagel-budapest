/**
 * Row types for `bm_vendors` / `bm_vendor_quotes` — see migration 5
 * (`supabase/migrations/20260828030400_bm_vendors_budget_documents.sql`) for the applied schema
 * these mirror field-for-field. Hand-written, not generated — see CLAUDE.md's data-layer note.
 */

export type VendorStatus =
  | 'researching'
  | 'contacted'
  | 'quote_received'
  | 'shortlisted'
  | 'booked'
  | 'fully_paid'
  | 'not_proceeding';

export interface VendorRow {
  id: string;
  event_id: string;
  /** Free text — see `lib/vendors/categories.ts` for the curated list the `Select` offers. */
  category: string;
  status: VendorStatus;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  website: string | null;
  address: string | null;
  quoted_price: number | null;
  agreed_price: number | null;
  deposit_amount: number | null;
  /** `date`-only column — parse with `toLocalDateOnly` from lib/format.ts, never `new Date()`. */
  deposit_due_date: string | null;
  balance_due_date: string | null;
  vat_registered: boolean;
  /** 1–5, or null when not yet rated. */
  rating: number | null;
  favourite: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface VendorQuoteRow {
  id: string;
  event_id: string;
  vendor_id: string;
  label: string | null;
  amount: number | null;
  includes: string | null;
  valid_until: string | null;
  received_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** A vendor with its quotes embedded — the shape `useVendors()` returns via a PostgREST
 *  embedded-resource select aliased to this friendlier field name (`quotes:bm_vendor_quotes(*)`)
 *  rather than leaking the raw joined table name into every consumer. */
export interface VendorWithQuotes extends VendorRow {
  quotes: VendorQuoteRow[];
}
