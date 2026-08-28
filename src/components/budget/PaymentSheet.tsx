import { useEffect, useState } from 'react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { showToast } from '../../hooks/useToast';
import { createPayment, updatePayment, type PaymentInput } from '../../data/budget/mutations';
import { normaliseMoneyInput, parseMoneyInput } from '../../lib/format';
import type { PaymentMethod, PaymentRow, PaymentStatus } from '../../data/budget/types';

interface PaymentSheetProps {
  open: boolean;
  onClose: () => void;
  expenseId: string;
  /** Null means "add a payment" against this expense; otherwise the payment being edited. */
  payment: PaymentRow | null;
  onSaved: () => void;
}

const PAYMENT_METHODS: PaymentMethod[] = ['bank_transfer', 'card', 'cash', 'cheque', 'other'];
const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: 'Bank transfer',
  card: 'Card',
  cash: 'Cash',
  cheque: 'Cheque',
  other: 'Other',
};

interface FormState {
  amount: string;
  status: PaymentStatus;
  due_date: string;
  paid_at: string;
  method: PaymentMethod | '';
  reference: string;
  notes: string;
}

const EMPTY_FORM: FormState = { amount: '', status: 'scheduled', due_date: '', paid_at: '', method: '', reference: '', notes: '' };

function rowToForm(payment: PaymentRow): FormState {
  return {
    amount: String(payment.amount),
    status: payment.status,
    due_date: payment.due_date ?? '',
    paid_at: payment.paid_at ?? '',
    method: payment.method ?? '',
    reference: payment.reference ?? '',
    notes: payment.notes ?? '',
  };
}

/** One payment's form — a deposit, a balance, an instalment — against a single expense line.
 *  Opened from `ExpenseSheet`'s inline payment list, one layer above it. */
export function PaymentSheet({ open, onClose, expenseId, payment, onSaved }: PaymentSheetProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(payment ? rowToForm(payment) : EMPTY_FORM);
    setAmountError(null);
  }, [open, payment]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    const { value: amount, reason } = parseMoneyInput(form.amount, { allowShorthand: true });
    if (reason === 'empty') {
      setAmountError('Enter an amount.');
      return;
    }
    if (reason === 'unparseable') {
      setAmountError(`Could not read "${form.amount}" as an amount.`);
      return;
    }
    setAmountError(null);

    setSaving(true);
    try {
      const input: PaymentInput = {
        amount: amount as number,
        status: form.status,
        due_date: form.due_date || null,
        paid_at: form.paid_at || null,
        method: form.method || null,
        reference: form.reference.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (payment) {
        await updatePayment(payment.id, input);
      } else {
        await createPayment(expenseId, input);
      }
      showToast('Saved', 'success');
      onSaved();
      onClose();
    } catch {
      showToast('Could not save that payment — please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={payment ? 'Edit payment' : 'Add payment'}
      anchor="drawer"
      layer="raised"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Amount" htmlFor="payment-amount" required error={amountError ?? undefined}>
          <Input
            id="payment-amount"
            inputMode="decimal"
            value={form.amount}
            invalid={!!amountError}
            onChange={(e) => set('amount', e.target.value)}
            onBlur={(e) => set('amount', normaliseMoneyInput(e.target.value))}
            placeholder="£"
          />
        </Field>

        <Field label="Status" htmlFor="payment-status">
          <Select id="payment-status" value={form.status} onChange={(e) => set('status', e.target.value as PaymentStatus)}>
            <option value="scheduled">Scheduled</option>
            <option value="paid">Paid</option>
          </Select>
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Due date" htmlFor="payment-due">
            <Input id="payment-due" type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
          </Field>
          <Field label="Paid date" htmlFor="payment-paid-at">
            <Input id="payment-paid-at" type="date" value={form.paid_at} onChange={(e) => set('paid_at', e.target.value)} />
          </Field>
        </div>

        <Field label="Method" htmlFor="payment-method">
          <Select id="payment-method" value={form.method} onChange={(e) => set('method', e.target.value as PaymentMethod | '')}>
            <option value="">Not set</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Reference" htmlFor="payment-reference" hint="A bank reference, cheque number, or similar">
          <Input id="payment-reference" value={form.reference} onChange={(e) => set('reference', e.target.value)} />
        </Field>

        <Field label="Notes" htmlFor="payment-notes">
          <Textarea id="payment-notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} />
        </Field>
      </div>
    </Sheet>
  );
}
