import { describe, expect, it } from 'vitest';
import {
  budgetByCategory,
  budgetByVendor,
  budgetRollup,
  duePaymentsSoon,
  overBudgetExpenses,
  overduePayments,
} from './maths';
import type { ExpenseWithPayments, PaymentRow } from '../../data/budget/types';
import type { VendorRow } from '../../data/vendors/types';

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function makePayment(overrides: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: nextId('payment'),
    event_id: 'evt-1',
    expense_id: 'expense-1',
    amount: 0,
    status: 'scheduled',
    due_date: null,
    paid_at: null,
    method: null,
    reference: null,
    notes: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeExpense(overrides: Partial<Omit<ExpenseWithPayments, 'payments'>> & { payments?: PaymentRow[] } = {}): ExpenseWithPayments {
  return {
    id: nextId('expense'),
    event_id: 'evt-1',
    vendor_id: null,
    category: 'Venue',
    description: null,
    budgeted: null,
    estimated: null,
    quoted: null,
    agreed: null,
    vat_amount: null,
    due_date: null,
    payment_method: null,
    notes: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    payments: [],
    ...overrides,
  };
}

function makeVendor(overrides: Partial<VendorRow> = {}): VendorRow {
  return {
    id: nextId('vendor'),
    event_id: 'evt-1',
    category: 'Venue',
    status: 'booked',
    name: 'A Vendor',
    contact_name: null,
    phone: null,
    email: null,
    whatsapp: null,
    website: null,
    address: null,
    quoted_price: null,
    agreed_price: null,
    deposit_amount: null,
    deposit_due_date: null,
    balance_due_date: null,
    vat_registered: false,
    rating: null,
    favourite: false,
    notes: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('budgetRollup', () => {
  it('sums money exactly to the penny, despite inputs that trip up naive float addition', () => {
    // A demonstration of the bug this module avoids: plain float addition of these three values
    // does NOT land on 600.6.
    expect(100.1 + 200.2 + 300.3).not.toBe(600.6);

    const expenses = [
      makeExpense({ budgeted: 100.1 }),
      makeExpense({ budgeted: 200.2 }),
      makeExpense({ budgeted: 300.3 }),
    ];
    expect(budgetRollup(expenses).budgeted).toBe(600.6);
  });

  it('treats a null money field as a no-op, not a NaN', () => {
    const expenses = [makeExpense({ budgeted: 100 }), makeExpense({ budgeted: null })];
    expect(budgetRollup(expenses).budgeted).toBe(100);
  });

  it('only counts payments with status "paid" towards `paid`', () => {
    const expense = makeExpense({
      agreed: 1000,
      payments: [
        makePayment({ amount: 400, status: 'paid' }),
        makePayment({ amount: 300, status: 'scheduled' }),
      ],
    });
    const totals = budgetRollup([expense]);
    expect(totals.paid).toBe(400);
  });

  it('outstanding is agreed minus paid, floored at zero', () => {
    const underpaid = makeExpense({
      agreed: 1000,
      payments: [makePayment({ amount: 400, status: 'paid' })],
    });
    expect(budgetRollup([underpaid]).outstanding).toBe(600);

    const overpaid = makeExpense({
      agreed: 500,
      payments: [makePayment({ amount: 700, status: 'paid' })],
    });
    expect(budgetRollup([overpaid]).outstanding).toBe(0);
  });

  it('returns all zeroes for an empty list', () => {
    expect(budgetRollup([])).toEqual({ budgeted: 0, estimated: 0, quoted: 0, agreed: 0, paid: 0, outstanding: 0 });
  });
});

describe('budgetByCategory', () => {
  it('groups by category and sorts by agreed spend, largest first', () => {
    const expenses = [
      makeExpense({ category: 'Catering', agreed: 500 }),
      makeExpense({ category: 'Venue', agreed: 5000 }),
      makeExpense({ category: 'Catering', agreed: 700 }),
    ];
    const groups = budgetByCategory(expenses);
    expect(groups.map((g) => g.category)).toEqual(['Venue', 'Catering']);
    expect(groups[1].totals.agreed).toBe(1200);
  });
});

describe('budgetByVendor', () => {
  it('joins against the supplied vendor list and buckets unlinked expenses separately', () => {
    const vendor = makeVendor({ id: 'v1', name: 'The Grand Hall' });
    const expenses = [
      makeExpense({ vendor_id: 'v1', agreed: 8000 }),
      makeExpense({ vendor_id: null, agreed: 200 }),
    ];
    const groups = budgetByVendor(expenses, [vendor]);
    expect(groups[0]).toMatchObject({ vendorId: 'v1', vendorName: 'The Grand Hall' });
    expect(groups[0].totals.agreed).toBe(8000);
    expect(groups[1]).toMatchObject({ vendorId: null, vendorName: 'No vendor linked' });
  });

  it('labels a vendor id no longer in the supplied list rather than crashing', () => {
    const expenses = [makeExpense({ vendor_id: 'missing', agreed: 100 })];
    const groups = budgetByVendor(expenses, []);
    expect(groups[0].vendorName).toBe('Unknown vendor');
  });
});

describe('duePaymentsSoon / overduePayments', () => {
  const now = new Date(2026, 7, 28); // 28 Aug 2026 (local midnight — Date's month is 0-based)

  it('includes a scheduled payment due today and on the boundary day, excludes the day after', () => {
    const dueToday = makePayment({ due_date: '2026-08-28', status: 'scheduled' });
    const dueOnBoundary = makePayment({ due_date: '2026-09-11', status: 'scheduled' }); // +14 days
    const dueAfterBoundary = makePayment({ due_date: '2026-09-12', status: 'scheduled' }); // +15 days
    const expense = makeExpense({ payments: [dueToday, dueOnBoundary, dueAfterBoundary] });

    const soon = duePaymentsSoon([expense], 14, now);
    expect(soon.map((d) => d.payment.id)).toEqual([dueToday.id, dueOnBoundary.id]);
  });

  it('excludes paid payments and payments with no due date', () => {
    const paid = makePayment({ due_date: '2026-08-29', status: 'paid' });
    const noDate = makePayment({ due_date: null, status: 'scheduled' });
    const expense = makeExpense({ payments: [paid, noDate] });
    expect(duePaymentsSoon([expense], 14, now)).toEqual([]);
  });

  it('treats a scheduled payment before today as overdue, not due-soon', () => {
    const overdue = makePayment({ due_date: '2026-08-01', status: 'scheduled' });
    const today = makePayment({ due_date: '2026-08-28', status: 'scheduled' });
    const expense = makeExpense({ payments: [overdue, today] });

    expect(overduePayments([expense], now).map((d) => d.payment.id)).toEqual([overdue.id]);
    expect(duePaymentsSoon([expense], 14, now).map((d) => d.payment.id)).toEqual([today.id]);
  });

  it('never calls a paid payment overdue, however far past its due date', () => {
    const paidLate = makePayment({ due_date: '2020-01-01', status: 'paid' });
    expect(overduePayments([makeExpense({ payments: [paidLate] })], now)).toEqual([]);
  });

  it('sorts results by due date, earliest first', () => {
    const later = makePayment({ due_date: '2026-09-05', status: 'scheduled' });
    const sooner = makePayment({ due_date: '2026-08-30', status: 'scheduled' });
    const expense = makeExpense({ payments: [later, sooner] });
    expect(duePaymentsSoon([expense], 14, now).map((d) => d.payment.id)).toEqual([sooner.id, later.id]);
  });
});

describe('overBudgetExpenses', () => {
  it('flags a line only when both figures are set and agreed exceeds budgeted', () => {
    const over = makeExpense({ budgeted: 1000, agreed: 1200 });
    const onBudget = makeExpense({ budgeted: 1000, agreed: 1000 });
    const underBudget = makeExpense({ budgeted: 1000, agreed: 800 });
    const noBudgetSet = makeExpense({ budgeted: null, agreed: 5000 });
    const noAgreedYet = makeExpense({ budgeted: 1000, agreed: null });

    const result = overBudgetExpenses([over, onBudget, underBudget, noBudgetSet, noAgreedYet]);
    expect(result).toEqual([over]);
  });
});
