/**
 * Row types for `bm_expenses` / `bm_payments` — see migration 5
 * (`supabase/migrations/20260828030400_bm_vendors_budget_documents.sql`) for the applied schema
 * these mirror field-for-field. Hand-written, not generated — see CLAUDE.md's data-layer note.
 */

export type PaymentStatus = 'scheduled' | 'paid';
export type PaymentMethod = 'bank_transfer' | 'card' | 'cash' | 'cheque' | 'other';

export interface ExpenseRow {
  id: string;
  event_id: string;
  /** Null — an expense need not name a vendor (a rabbi's honorarium, a DIY run). */
  vendor_id: string | null;
  /** Free text — see `lib/vendors/categories.ts` for the curated list the `Select` offers. */
  category: string;
  description: string | null;
  budgeted: number | null;
  estimated: number | null;
  quoted: number | null;
  agreed: number | null;
  vat_amount: number | null;
  /** `date`-only column — parse with `toLocalDateOnly` from lib/format.ts, never `new Date()`. */
  due_date: string | null;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentRow {
  id: string;
  event_id: string;
  expense_id: string;
  amount: number;
  status: PaymentStatus;
  due_date: string | null;
  paid_at: string | null;
  method: PaymentMethod | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** An expense with its payments embedded — the shape `useExpenses()` returns via a PostgREST
 *  embedded-resource select aliased to this friendlier field name (`payments:bm_payments(*)`).
 *  `lib/budget/maths.ts`'s roll-ups all take this shape, not the bare `ExpenseRow`. */
export interface ExpenseWithPayments extends ExpenseRow {
  payments: PaymentRow[];
}
