import { supabase } from '../../lib/supabase';
import { logActivity } from '../activity/log';
import type { ExpenseRow, PaymentMethod, PaymentRow, PaymentStatus } from './types';

export interface ExpenseInput {
  vendor_id?: string | null;
  category: string;
  description?: string | null;
  budgeted?: number | null;
  estimated?: number | null;
  quoted?: number | null;
  agreed?: number | null;
  vat_amount?: number | null;
  due_date?: string | null;
  payment_method?: string | null;
  notes?: string | null;
}

export async function createExpense(eventId: string, input: ExpenseInput): Promise<ExpenseRow> {
  const { data, error } = await supabase
    .from('bm_expenses')
    .insert({ event_id: eventId, ...input })
    .select('*')
    .single();
  if (error) throw error;
  const row = data as ExpenseRow;
  await logActivity({
    eventId,
    action: 'expense_created',
    entityType: 'expense',
    entityId: row.id,
    summary: `Added expense: ${row.description || row.category}`,
    after: row,
  });
  return row;
}

export async function updateExpense(id: string, patch: Partial<ExpenseInput>): Promise<ExpenseRow> {
  const { data, error } = await supabase.from('bm_expenses').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  const row = data as ExpenseRow;
  await logActivity({
    eventId: row.event_id,
    action: 'expense_updated',
    entityType: 'expense',
    entityId: row.id,
    summary: `Updated expense: ${row.description || row.category}`,
    after: patch,
  });
  return row;
}

/** Confirm with the user before calling this — it does not ask itself. Deletes its payments too
 *  (`bm_payments.expense_id` is `on delete cascade`), so the family sees what disappears with it. */
export async function deleteExpense(id: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('bm_expenses')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('bm_expenses').delete().eq('id', id);
  if (error) throw error;

  if (existing) {
    const row = existing as ExpenseRow;
    await logActivity({
      eventId: row.event_id,
      action: 'expense_deleted',
      entityType: 'expense',
      entityId: id,
      summary: `Removed expense: ${row.description || row.category}`,
      before: row,
    });
  }
}

export interface PaymentInput {
  amount: number;
  status?: PaymentStatus;
  due_date?: string | null;
  paid_at?: string | null;
  method?: PaymentMethod | null;
  reference?: string | null;
  notes?: string | null;
}

async function fetchExpenseEventId(expenseId: string): Promise<string> {
  const { data, error } = await supabase.from('bm_expenses').select('event_id').eq('id', expenseId).single();
  if (error) throw error;
  return (data as { event_id: string }).event_id;
}

export async function createPayment(expenseId: string, input: PaymentInput): Promise<PaymentRow> {
  const eventId = await fetchExpenseEventId(expenseId);
  const { data, error } = await supabase
    .from('bm_payments')
    .insert({ event_id: eventId, expense_id: expenseId, ...input })
    .select('*')
    .single();
  if (error) throw error;
  const row = data as PaymentRow;
  await logActivity({
    eventId,
    action: 'payment_created',
    entityType: 'expense',
    entityId: expenseId,
    summary: `Scheduled a payment of ${row.amount}`,
    after: row,
  });
  return row;
}

export async function updatePayment(id: string, patch: Partial<PaymentInput>): Promise<PaymentRow> {
  const { data, error } = await supabase.from('bm_payments').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  const row = data as PaymentRow;
  await logActivity({
    eventId: row.event_id,
    action: 'payment_updated',
    entityType: 'expense',
    entityId: row.expense_id,
    summary: 'Updated a payment',
    after: patch,
  });
  return row;
}

/** Confirm with the user before calling this — it does not ask itself. */
export async function deletePayment(id: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('bm_payments')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('bm_payments').delete().eq('id', id);
  if (error) throw error;

  if (existing) {
    const row = existing as PaymentRow;
    await logActivity({
      eventId: row.event_id,
      action: 'payment_deleted',
      entityType: 'expense',
      entityId: row.expense_id,
      summary: `Removed a payment of ${row.amount}`,
      before: row,
    });
  }
}

/** The one-tap "mark paid" action `ExpenseSheet`'s inline payment list and (later, once wired)
 *  quick actions use — sets `status: 'paid'` and stamps `paid_at`, defaulting to today when the
 *  caller doesn't pass a specific date. */
export async function markPaymentPaid(id: string, paidAt?: string): Promise<PaymentRow> {
  const paid_at = paidAt ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('bm_payments')
    .update({ status: 'paid', paid_at })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  const row = data as PaymentRow;
  await logActivity({
    eventId: row.event_id,
    action: 'payment_marked_paid',
    entityType: 'expense',
    entityId: row.expense_id,
    summary: `Marked a payment of ${row.amount} as paid`,
    after: row,
  });
  return row;
}
