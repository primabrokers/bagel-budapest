import { describe, expect, it } from 'vitest';
import { invoiceWarnings, normaliseInvoice, validateInvoiceFile } from './invoice';

describe('invoice review safeguards', () => {
  it('does not invent absent totals, payment amounts or currency', () => {
    const draft = normaliseInvoice({ vendor_name: 'Example Caterer', total: '120.00' });
    expect(draft.total).toBeNull();
    expect(draft.reported_paid).toBeNull();
    expect(draft.currency).toBe('');
    expect(invoiceWarnings(draft)).toHaveLength(2);
  });
  it('keeps the gross total separate from a printed balance or deposit', () => {
    const draft = normaliseInvoice({ vendor_name: 'Example', currency: 'gbp', net_amount: 100, vat_amount: 20, total: 120, reported_paid: 30, reported_balance: 90 });
    expect(draft.total).toBe(120);
    expect(draft.reported_paid).toBe(30);
    expect(invoiceWarnings(draft)).toEqual([]);
  });
  it('reconciles in pennies, and flags inconsistent source components', () => {
    const draft = normaliseInvoice({ vendor_name: 'Example', currency: 'GBP', net_amount: 0.1, vat_amount: 0.2, total: 0.3 });
    expect(invoiceWarnings(draft)).toEqual([]);
    expect(invoiceWarnings({ ...draft, total: 0.4 }).join(' ')).toContain('does not equal');
  });
  it('rejects non-finite values, ambiguous dates and invalid calendar dates', () => {
    const draft = normaliseInvoice({ total: Infinity, vat_amount: NaN, invoice_date: '03/04/2026', due_date: '2026-02-30' });
    expect(draft.total).toBeNull(); expect(draft.vat_amount).toBeNull();
    expect(draft.invoice_date).toBe(''); expect(draft.due_date).toBe('');
  });
  it('flags credit notes and non-GBP invoices instead of silently treating them as GBP', () => {
    expect(invoiceWarnings(normaliseInvoice({ vendor_name: 'Example', currency: 'EUR', total: -100 }))).toHaveLength(2);
  });
  it('bounds uploads and rejects unsupported or empty documents', () => {
    expect(() => validateInvoiceFile({ type: 'application/pdf', size: 100 })).not.toThrow();
    for (const file of [{ type: 'text/html', size: 100 }, { type: 'application/pdf', size: 0 }, { type: 'image/png', size: 16 * 1024 * 1024 }]) expect(() => validateInvoiceFile(file)).toThrow();
  });
});
