/**
 * Pure roll-up maths over `ExpenseWithPayments[]` — every "how much has this event spent"
 * question `BudgetPage` and the dashboard budget widgets ask goes through one of these, so the
 * app never has two different ideas of what "outstanding" means in two different places.
 */
import { toLocalDateOnly } from '../format';
import type { ExpenseWithPayments, PaymentRow } from '../../data/budget/types';
import type { VendorRow } from '../../data/vendors/types';

export interface BudgetTotals {
  budgeted: number;
  estimated: number;
  quoted: number;
  agreed: number;
  /** Sum of this group's payments with `status: 'paid'` — never scheduled ones. */
  paid: number;
  /**
   * What is still owed: `max(agreed - paid, 0)`. Deliberately measured against `agreed` (what
   * has actually been committed to a vendor), not `budgeted` or `quoted` — a family's real
   * liability is the agreed price, and an over-generous quote or an aspirational budget line
   * should never inflate "what we still owe". Floored at zero rather than going negative: a
   * deposit paid ahead of a balance being agreed reads as "nothing outstanding yet", not a
   * negative debt nobody asked about.
   */
  outstanding: number;
}

/** Every money field on `ExpenseRow`/`PaymentRow` is nullable — "not entered yet", not zero — so
 *  every sum below treats a null as a no-op contribution rather than a NaN. */
function toPennies(amount: number | null | undefined): number {
  return Math.round((amount ?? 0) * 100);
}

function fromPennies(pennies: number): number {
  return pennies / 100;
}

function paidPennies(expense: ExpenseWithPayments): number {
  return expense.payments
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + toPennies(p.amount), 0);
}

/**
 * Sums a set of expense lines entirely in whole pennies, converting back to pounds only once at
 * the end. This is what keeps a roll-up of dozens of lines exact to the penny: repeated
 * floating-point addition on pounds drifts (`0.1 + 0.2 !== 0.3` in IEEE 754), but integer pennies
 * added together never do.
 */
function sumLines(expenses: ExpenseWithPayments[]): BudgetTotals {
  let budgeted = 0;
  let estimated = 0;
  let quoted = 0;
  let agreed = 0;
  let paid = 0;

  for (const expense of expenses) {
    budgeted += toPennies(expense.budgeted);
    estimated += toPennies(expense.estimated);
    quoted += toPennies(expense.quoted);
    agreed += toPennies(expense.agreed);
    paid += paidPennies(expense);
  }

  const outstanding = Math.max(agreed - paid, 0);

  return {
    budgeted: fromPennies(budgeted),
    estimated: fromPennies(estimated),
    quoted: fromPennies(quoted),
    agreed: fromPennies(agreed),
    paid: fromPennies(paid),
    outstanding: fromPennies(outstanding),
  };
}

/** The whole event's spend at a glance — `BudgetSnapshotWidget` and the top of `BudgetPage`. */
export function budgetRollup(expenses: ExpenseWithPayments[]): BudgetTotals {
  return sumLines(expenses);
}

export interface CategoryBudget {
  category: string;
  totals: BudgetTotals;
}

/** Grouped by `expense.category`, largest committed spend first — the "by category" tab and the
 *  spend-by-category donut both read from this rather than grouping twice. */
export function budgetByCategory(expenses: ExpenseWithPayments[]): CategoryBudget[] {
  const groups = new Map<string, ExpenseWithPayments[]>();
  for (const expense of expenses) {
    const list = groups.get(expense.category);
    if (list) list.push(expense);
    else groups.set(expense.category, [expense]);
  }
  return Array.from(groups.entries())
    .map(([category, lines]) => ({ category, totals: sumLines(lines) }))
    .sort((a, b) => b.totals.agreed - a.totals.agreed);
}

export interface VendorBudget {
  /** Null for the "no vendor linked" bucket — an expense line is not required to name a vendor
   *  (e.g. a rabbi's honorarium, a DIY favour run). */
  vendorId: string | null;
  vendorName: string;
  totals: BudgetTotals;
}

const NO_VENDOR_LABEL = 'No vendor linked';

/** Grouped by `expense.vendor_id`, joined against the vendor list the caller already has loaded
 *  (`useVendors()`'s cache) rather than this module fetching its own — it is pure maths, not a
 *  data hook. Largest committed spend first, same as `budgetByCategory`. */
export function budgetByVendor(expenses: ExpenseWithPayments[], vendors: VendorRow[]): VendorBudget[] {
  const nameById = new Map(vendors.map((v) => [v.id, v.name] as const));
  const groups = new Map<string, ExpenseWithPayments[]>();
  for (const expense of expenses) {
    const key = expense.vendor_id ?? '';
    const list = groups.get(key);
    if (list) list.push(expense);
    else groups.set(key, [expense]);
  }
  return Array.from(groups.entries())
    .map(([key, lines]) => ({
      vendorId: key || null,
      vendorName: key ? (nameById.get(key) ?? 'Unknown vendor') : NO_VENDOR_LABEL,
      totals: sumLines(lines),
    }))
    .sort((a, b) => b.totals.agreed - a.totals.agreed);
}

export interface DuePayment {
  payment: PaymentRow;
  /** The expense this payment belongs to — carried along so a caller can show its category,
   *  description or vendor without a second lookup. */
  expense: ExpenseWithPayments;
}

function flattenScheduledPayments(expenses: ExpenseWithPayments[]): DuePayment[] {
  const out: DuePayment[] = [];
  for (const expense of expenses) {
    for (const payment of expense.payments) {
      if (payment.status === 'scheduled') out.push({ payment, expense });
    }
  }
  return out;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function sortByDueDate(payments: DuePayment[]): DuePayment[] {
  return [...payments].sort((a, b) => (a.payment.due_date ?? '').localeCompare(b.payment.due_date ?? ''));
}

/**
 * `scheduled` payments due within `days` days from now, inclusive of today and the `days`th day
 * itself. A payment with no due date is never "due soon" — there is nothing to compare it to.
 */
export function duePaymentsSoon(expenses: ExpenseWithPayments[], days = 14, now: Date = new Date()): DuePayment[] {
  const today = startOfDay(now);
  const horizon = startOfDay(now);
  horizon.setDate(horizon.getDate() + days);

  return sortByDueDate(
    flattenScheduledPayments(expenses).filter(({ payment }) => {
      const due = payment.due_date ? toLocalDateOnly(payment.due_date) : null;
      return due !== null && due >= today && due <= horizon;
    }),
  );
}

/** `scheduled` payments whose due date has already passed. */
export function overduePayments(expenses: ExpenseWithPayments[], now: Date = new Date()): DuePayment[] {
  const today = startOfDay(now);
  return sortByDueDate(
    flattenScheduledPayments(expenses).filter(({ payment }) => {
      const due = payment.due_date ? toLocalDateOnly(payment.due_date) : null;
      return due !== null && due < today;
    }),
  );
}

/** Expense lines where what has actually been agreed has overtaken what was budgeted. Both
 *  figures must be set — a line with no budget entered yet cannot be judged "over" one. */
export function overBudgetExpenses(expenses: ExpenseWithPayments[]): ExpenseWithPayments[] {
  return expenses.filter((e) => e.budgeted != null && e.agreed != null && e.agreed > e.budgeted);
}
