import { useEffect, useState } from 'react';
import { CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { Badge } from '../ui/Badge';
import { Money } from '../ui/Money';
import { showToast } from '../../hooks/useToast';
import { confirmDialog } from '../../hooks/useConfirm';
import { useEventContext } from '../../data/event/context';
import { useVendors } from '../../data/vendors/hooks';
import {
  createExpense,
  deleteExpense,
  deletePayment,
  markPaymentPaid,
  updateExpense,
  type ExpenseInput,
} from '../../data/budget/mutations';
import { PaymentSheet } from './PaymentSheet';
import { VENDOR_CATEGORIES } from '../../lib/vendors/categories';
import { formatDate, normaliseMoneyInput, parseMoneyInput } from '../../lib/format';
import type { ExpenseWithPayments, PaymentRow } from '../../data/budget/types';

interface ExpenseSheetProps {
  open: boolean;
  onClose: () => void;
  /** Null means "add an expense"; otherwise the expense being edited, payments embedded. */
  expense: ExpenseWithPayments | null;
  onSaved: () => void;
}

interface FormState {
  category: string;
  vendor_id: string;
  description: string;
  budgeted: string;
  estimated: string;
  quoted: string;
  agreed: string;
  vat_amount: string;
  due_date: string;
  payment_method: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  category: VENDOR_CATEGORIES[0],
  vendor_id: '',
  description: '',
  budgeted: '',
  estimated: '',
  quoted: '',
  agreed: '',
  vat_amount: '',
  due_date: '',
  payment_method: '',
  notes: '',
};

function rowToForm(expense: ExpenseWithPayments): FormState {
  return {
    category: expense.category,
    vendor_id: expense.vendor_id ?? '',
    description: expense.description ?? '',
    budgeted: expense.budgeted != null ? String(expense.budgeted) : '',
    estimated: expense.estimated != null ? String(expense.estimated) : '',
    quoted: expense.quoted != null ? String(expense.quoted) : '',
    agreed: expense.agreed != null ? String(expense.agreed) : '',
    vat_amount: expense.vat_amount != null ? String(expense.vat_amount) : '',
    due_date: expense.due_date ?? '',
    payment_method: expense.payment_method ?? '',
    notes: expense.notes ?? '',
  };
}

const MONEY_FIELDS = ['budgeted', 'estimated', 'quoted', 'agreed', 'vat_amount'] as const;

function readMoneyField(raw: string): { value: number | null; error?: string } {
  const { value, reason } = parseMoneyInput(raw, { allowShorthand: true });
  if (reason === 'unparseable') return { value: null, error: `Could not read "${raw}" as an amount.` };
  return { value };
}

/**
 * One expense line's form — category, an optional vendor link, the budgeted/estimated/quoted/
 * agreed money quartet plus VAT, and its payments listed inline (add, edit, mark paid, delete —
 * each opening `PaymentSheet` one layer up). Doubles as "add expense" when `expense` is null.
 */
export function ExpenseSheet({ open, onClose, expense, onSaved }: ExpenseSheetProps) {
  const { eventId } = useEventContext();
  const { data: vendors } = useVendors();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<PaymentRow | null>(null);
  const [paymentBusyId, setPaymentBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(expense ? rowToForm(expense) : EMPTY_FORM);
    setErrors({});
  }, [open, expense]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    const nextErrors: Record<string, string> = {};
    const parsed: Record<(typeof MONEY_FIELDS)[number], number | null> = {
      budgeted: null,
      estimated: null,
      quoted: null,
      agreed: null,
      vat_amount: null,
    };
    for (const field of MONEY_FIELDS) {
      const { value, error } = readMoneyField(form[field]);
      if (error) nextErrors[field] = error;
      parsed[field] = value;
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      const patch: ExpenseInput = {
        category: form.category,
        vendor_id: form.vendor_id || null,
        description: form.description.trim() || null,
        budgeted: parsed.budgeted,
        estimated: parsed.estimated,
        quoted: parsed.quoted,
        agreed: parsed.agreed,
        vat_amount: parsed.vat_amount,
        due_date: form.due_date || null,
        payment_method: form.payment_method.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (expense) {
        await updateExpense(expense.id, patch);
      } else {
        await createExpense(eventId, patch);
      }
      showToast('Saved', 'success');
      onSaved();
      onClose();
    } catch {
      showToast('Could not save — please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!expense) return;
    const ok = await confirmDialog('Remove this expense?', {
      body: 'Any payments recorded against it go too. This cannot be undone.',
      tone: 'danger',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteExpense(expense.id);
      showToast('Expense removed', 'success');
      onSaved();
      onClose();
    } catch {
      showToast('Could not remove — please try again.', 'error');
    } finally {
      setDeleting(false);
    }
  }

  function openAddPayment() {
    setEditingPayment(null);
    setPaymentSheetOpen(true);
  }

  function openEditPayment(payment: PaymentRow) {
    setEditingPayment(payment);
    setPaymentSheetOpen(true);
  }

  async function handleMarkPaid(payment: PaymentRow) {
    setPaymentBusyId(payment.id);
    try {
      await markPaymentPaid(payment.id);
      showToast('Marked as paid', 'success');
      onSaved();
    } catch {
      showToast('Could not update — please try again.', 'error');
    } finally {
      setPaymentBusyId(null);
    }
  }

  async function handleDeletePayment(payment: PaymentRow) {
    const ok = await confirmDialog('Remove this payment?', { tone: 'danger', confirmLabel: 'Remove' });
    if (!ok) return;
    setPaymentBusyId(payment.id);
    try {
      await deletePayment(payment.id);
      showToast('Payment removed', 'success');
      onSaved();
    } catch {
      showToast('Could not remove — please try again.', 'error');
    } finally {
      setPaymentBusyId(null);
    }
  }

  const payments = expense?.payments ?? [];

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={expense ? expense.description || expense.category : 'Add expense'}
        anchor="drawer"
        size="lg"
        footer={
          <>
            {expense && (
              <Button type="button" variant="danger" onClick={() => void handleDelete()} disabled={deleting || saving} className="mr-auto">
                <Trash2 size={14} aria-hidden="true" />
                {deleting ? 'Removing…' : 'Remove'}
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSubmit()} disabled={saving || deleting}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <Field label="Description" htmlFor="expense-description">
              <Input id="expense-description" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="e.g. Deposit for the marquee" />
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Category" htmlFor="expense-category">
                <Select id="expense-category" value={form.category} onChange={(e) => set('category', e.target.value)}>
                  {VENDOR_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Vendor" htmlFor="expense-vendor" hint="Optional">
                <Select id="expense-vendor" value={form.vendor_id} onChange={(e) => set('vendor_id', e.target.value)}>
                  <option value="">No vendor linked</option>
                  {(vendors ?? []).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-separator pt-4">
            <h3 className="text-sm font-semibold text-text-primary">Money</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Budgeted" htmlFor="expense-budgeted" error={errors.budgeted}>
                <Input
                  id="expense-budgeted"
                  inputMode="decimal"
                  value={form.budgeted}
                  invalid={!!errors.budgeted}
                  onChange={(e) => set('budgeted', e.target.value)}
                  onBlur={(e) => set('budgeted', normaliseMoneyInput(e.target.value))}
                  placeholder="£"
                />
              </Field>
              <Field label="Estimated" htmlFor="expense-estimated" error={errors.estimated}>
                <Input
                  id="expense-estimated"
                  inputMode="decimal"
                  value={form.estimated}
                  invalid={!!errors.estimated}
                  onChange={(e) => set('estimated', e.target.value)}
                  onBlur={(e) => set('estimated', normaliseMoneyInput(e.target.value))}
                  placeholder="£"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Quoted" htmlFor="expense-quoted" error={errors.quoted}>
                <Input
                  id="expense-quoted"
                  inputMode="decimal"
                  value={form.quoted}
                  invalid={!!errors.quoted}
                  onChange={(e) => set('quoted', e.target.value)}
                  onBlur={(e) => set('quoted', normaliseMoneyInput(e.target.value))}
                  placeholder="£"
                />
              </Field>
              <Field label="Agreed" htmlFor="expense-agreed" error={errors.agreed}>
                <Input
                  id="expense-agreed"
                  inputMode="decimal"
                  value={form.agreed}
                  invalid={!!errors.agreed}
                  onChange={(e) => set('agreed', e.target.value)}
                  onBlur={(e) => set('agreed', normaliseMoneyInput(e.target.value))}
                  placeholder="£"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="VAT amount" htmlFor="expense-vat" error={errors.vat_amount}>
                <Input
                  id="expense-vat"
                  inputMode="decimal"
                  value={form.vat_amount}
                  invalid={!!errors.vat_amount}
                  onChange={(e) => set('vat_amount', e.target.value)}
                  onBlur={(e) => set('vat_amount', normaliseMoneyInput(e.target.value))}
                  placeholder="£"
                />
              </Field>
              <Field label="Due date" htmlFor="expense-due-date">
                <Input id="expense-due-date" type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
              </Field>
            </div>
            <Field label="Payment method" htmlFor="expense-payment-method" hint="Free text — e.g. bank transfer, cheque">
              <Input id="expense-payment-method" value={form.payment_method} onChange={(e) => set('payment_method', e.target.value)} />
            </Field>
          </div>

          <Field label="Notes" htmlFor="expense-notes">
            <Textarea id="expense-notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
          </Field>

          {expense && (
            <div className="flex flex-col gap-2 border-t border-separator pt-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-text-primary">Payments</h3>
                <Button type="button" variant="secondary" size="sm" onClick={openAddPayment}>
                  <Plus size={14} aria-hidden="true" />
                  Add payment
                </Button>
              </div>
              {payments.length === 0 ? (
                <p className="text-xs text-text-muted">No payments scheduled yet.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-separator-soft">
                  {payments.map((payment) => (
                    <li key={payment.id} className="flex items-center gap-2 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-sm text-text-primary">
                          <Money value={payment.amount} className="font-medium" />
                          <Badge variant={payment.status === 'paid' ? 'success' : 'muted'}>
                            {payment.status === 'paid' ? 'Paid' : 'Scheduled'}
                          </Badge>
                        </p>
                        <p className="truncate text-xs text-text-muted">
                          {payment.status === 'paid'
                            ? payment.paid_at
                              ? `Paid ${formatDate(payment.paid_at)}`
                              : 'Paid'
                            : payment.due_date
                              ? `Due ${formatDate(payment.due_date)}`
                              : 'No due date'}
                        </p>
                      </div>
                      {payment.status === 'scheduled' && (
                        <IconButton
                          label="Mark as paid"
                          size="sm"
                          disabled={paymentBusyId !== null}
                          onClick={() => void handleMarkPaid(payment)}
                        >
                          <CheckCircle2 size={14} aria-hidden="true" />
                        </IconButton>
                      )}
                      <IconButton label="Edit payment" size="sm" onClick={() => openEditPayment(payment)}>
                        <Pencil size={14} aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        label="Remove payment"
                        size="sm"
                        disabled={paymentBusyId !== null}
                        onClick={() => void handleDeletePayment(payment)}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </Sheet>

      {expense && (
        <PaymentSheet
          open={paymentSheetOpen}
          onClose={() => setPaymentSheetOpen(false)}
          expenseId={expense.id}
          payment={editingPayment}
          onSaved={onSaved}
        />
      )}
    </>
  );
}
