import { useState } from 'react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Money } from '../ui/Money';
import { PaymentSheet } from '../budget/PaymentSheet';
import { useExpenses } from '../../data/budget/hooks';
import { useInvoiceImports } from '../../data/vendors/invoices';
import { budgetRollup } from '../../lib/budget/maths';
import { formatDate } from '../../lib/format';
import { getSignedDocumentUrl } from '../../data/documents/mutations';
import { showToast } from '../../hooks/useToast';
import type { PaymentRow } from '../../data/budget/types';

export function VendorPaymentsSheet({ vendorId, vendorName, onClose }: { vendorId: string; vendorName: string; onClose: () => void }) {
  const { data: expenses, loading, error, reload } = useExpenses();
  const { data: imports } = useInvoiceImports();
  const [editing, setEditing] = useState<{ expenseId: string; payment: PaymentRow | null } | null>(null);
  const lines = (expenses ?? []).filter(e => e.vendor_id === vendorId);
  const totals = budgetRollup(lines);
  async function viewOriginal(path: string) {
    try { window.open(await getSignedDocumentUrl(path), '_blank', 'noopener'); }
    catch { showToast('Could not open invoice.', 'error'); }
  }
  return <>
    <Sheet open onClose={onClose} title={`${vendorName} — invoices & payments`} anchor="drawer" size="lg">
      {error ? <p role="alert" className="text-danger-text">Could not load payments. <Button variant="secondary" onClick={reload}>Retry</Button></p> : loading && !expenses ? <p role="status">Loading payments…</p> : <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[['Total agreed / invoiced', totals.agreed], ['Paid', totals.paid], ['Outstanding', totals.outstanding]].map(([label, amount]) => <div key={label} className="rounded-lg bg-canvas p-3"><p className="text-xs text-text-muted">{label}</p><Money value={Number(amount)} className="text-lg font-semibold" /></div>)}
        </div>
        {totals.paid > totals.agreed && <p className="text-sm">Credit / overpayment: <Money value={Math.round((totals.paid - totals.agreed) * 100) / 100} /></p>}
        <p className="text-xs text-text-muted">Only payments marked Paid reduce the outstanding balance. Recording a payment here does not send money.</p>
        {!lines.length && <p className="text-sm text-text-muted">No invoices or expenses linked yet. Import an invoice, or link an expense in Budget.</p>}
        {lines.map(expense => {
          const summary = budgetRollup([expense]);
          const invoice = imports?.find(i => i.expense_id === expense.id && i.status === 'saved');
          return <section key={expense.id} className="flex flex-col gap-3 rounded-lg border border-separator p-3">
            <div><h3 className="break-words text-sm font-semibold">{expense.description || expense.category}</h3><p className="text-xs text-text-muted">{invoice?.invoice_number ? `Invoice ${invoice.invoice_number} · ` : ''}{expense.due_date ? `Due ${formatDate(expense.due_date)}` : 'No due date entered'}</p></div>
            <p className="text-sm">Total <Money value={expense.agreed ?? 0} /> · Paid <Money value={summary.paid} /> · Balance <Money value={summary.outstanding} /></p>
            {invoice && <Button size="sm" variant="secondary" onClick={() => void viewOriginal(invoice.document.storage_path)}>View original invoice</Button>}
            {expense.notes && <details className="text-sm"><summary className="cursor-pointer">Invoice details & payment terms</summary><p className="mt-2 whitespace-pre-wrap break-words text-xs text-text-secondary">{expense.notes}</p></details>}
            <div className="flex flex-col gap-2">{[...expense.payments].sort((a, b) => (a.paid_at || a.due_date || a.created_at).localeCompare(b.paid_at || b.due_date || b.created_at)).map(p => <button type="button" key={p.id} onClick={() => setEditing({ expenseId: expense.id, payment: p })} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-canvas p-2 text-left hover:bg-hover focus-visible:ring-2 focus-visible:ring-plum-400"><span className="text-sm"><Money value={p.amount} /> · {p.status === 'paid' ? 'Paid' : 'Scheduled'}<span className="block text-xs text-text-muted">{formatDate(p.status === 'paid' ? p.paid_at : p.due_date)}{p.method ? ` · ${p.method.replace('_', ' ')}` : ''}{p.reference ? ` · ${p.reference}` : ''}</span></span><span className="text-xs">Edit</span></button>)}</div>
            <Button size="sm" onClick={() => setEditing({ expenseId: expense.id, payment: null })}>Log deposit / balance payment</Button>
          </section>;
        })}
      </div>}
    </Sheet>
    {editing && <PaymentSheet open expenseId={editing.expenseId} payment={editing.payment} defaultStatus="paid" onClose={() => setEditing(null)} onSaved={reload} />}
  </>;
}
