import { useEffect, useRef, useState } from 'react';
import { FileText, Upload } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { useEventContext } from '../../data/event/context';
import { useVendors } from '../../data/vendors/hooks';
import { useExpenses } from '../../data/budget/hooks';
import { extractInvoice, saveInvoice, useInvoiceImports, type InvoiceImport } from '../../data/vendors/invoices';
import { getSignedDocumentUrl, uploadDocument } from '../../data/documents/mutations';
import { TEXT_FIELDS, MONEY_FIELDS, normaliseInvoice, invoiceWarnings, validateInvoiceFile, type InvoiceDraft } from '../../lib/vendors/invoice';
import { VENDOR_CATEGORIES } from '../../lib/vendors/categories';
import { formatDate, parseMoneyInput } from '../../lib/format';
import { showToast } from '../../hooks/useToast';

type MoneyForm = Record<keyof typeof MONEY_FIELDS, string>;
type Progress = Awaited<ReturnType<typeof extractInvoice>>;
const multiline = new Set(['address', 'line_items', 'payment_terms', 'bank_details', 'notes']);
export function InvoiceImportSheet({ onClose, onSaved }: { onClose: () => void; onSaved: (vendorId: string) => void }) {
  const { eventId } = useEventContext();
  const { data: vendors } = useVendors();
  const { data: expenses } = useExpenses();
  const { data: imports, reload, error: importsError } = useInvoiceImports();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [document, setDocument] = useState<{ id: string; name: string; storage_path: string } | null>(null);
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [money, setMoney] = useState<MoneyForm>({} as MoneyForm);
  const [vendorId, setVendorId] = useState('');
  const [expenseId, setExpenseId] = useState('');
  const [category, setCategory] = useState('Other');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const locked = useRef(false);
  const processing = progress?.status === 'starting' || progress?.status === 'processing';
  const progressId = progress?.id;

  useEffect(() => {
    if (!processing || !progressId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const began = Date.now();
    const poll = async () => {
      try {
        const result = await extractInvoice({ action: 'poll', id: progressId });
        if (cancelled) return;
        setProgress(result);
        if (result.status === 'starting' || result.status === 'processing') {
          if (Date.now() - began > 180000) { setError('Still processing. Close this drawer and reopen the import later.'); return; }
          timer = setTimeout(() => void poll(), 2500);
        } else reload();
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not check invoice progress.'); }
    };
    timer = setTimeout(() => void poll(), 1500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [processing, progressId, reload]);

  useEffect(() => {
    if (progress?.status !== 'review' || !progress.extracted) return;
    const next = normaliseInvoice(progress.extracted);
    setDraft(next);
    setMoney(Object.fromEntries(Object.keys(MONEY_FIELDS).map(k => [k, next[k as keyof typeof MONEY_FIELDS] === null ? '' : String(next[k as keyof typeof MONEY_FIELDS])])) as MoneyForm);
    setReviewed(false);
  }, [progress]);

  async function start(doc: { id: string; name: string; storage_path: string }) {
    setDocument(doc);
    const result = await extractInvoice({ action: 'start', documentId: doc.id });
    setProgress(result);
    reload();
  }
  async function upload(file: File) {
    if (locked.current || processing) return;
    locked.current = true; setBusy(true); setError(''); setDraft(null); setProgress(null); setDocument(null); setVendorId(''); setExpenseId('');
    try {
      validateInvoiceFile(file);
      const doc = await uploadDocument(eventId, file, 'Invoices');
      await start(doc);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not upload invoice.'); }
    finally { locked.current = false; setBusy(false); }
  }
  async function resume(item: InvoiceImport) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setDraft(null); setVendorId(''); setExpenseId('');
    setDocument({ id: item.document_id, ...item.document });
    try {
      if (item.status === 'failed') await start({ id: item.document_id, ...item.document });
      else setProgress(await extractInvoice({ action: 'poll', id: item.id }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not reopen invoice.'); }
    finally { locked.current = false; setBusy(false); }
  }
  async function save() {
    if (!draft || !progress || !reviewed || locked.current) return;
    setError('');
    const next = { ...draft };
    for (const key of Object.keys(MONEY_FIELDS) as (keyof MoneyForm)[]) {
      const parsed = parseMoneyInput(money[key]);
      if (parsed.reason === 'unparseable') { setError(`Check ${MONEY_FIELDS[key].toLowerCase()}.`); return; }
      next[key] = parsed.value;
    }
    if (!next.vendor_name.trim() || next.total === null || next.total < 0 || next.currency !== 'GBP') { setError('Confirm the supplier name, GBP currency and full invoice total before saving.'); return; }
    if (next.net_amount !== null && next.vat_amount !== null && Math.round(next.net_amount * 100) + Math.round(next.vat_amount * 100) !== Math.round(next.total * 100)) { setError('Net plus VAT must match the total. Correct the values against the invoice, or leave an unprinted component blank.'); return; }
    locked.current = true; setBusy(true);
    try {
      const receipt = await saveInvoice(progress.id, next, category, vendorId, expenseId);
      showToast('Invoice saved. You can now log payments.', 'success'); onSaved(receipt.vendor_id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save invoice.'); }
    finally { locked.current = false; setBusy(false); }
  }
  async function preview() {
    if (!document) return;
    try { window.open(await getSignedDocumentUrl(document.storage_path), '_blank', 'noopener'); }
    catch { setError('Could not open the original invoice.'); }
  }
  const amounts = draft ? { ...draft, ...Object.fromEntries(Object.entries(money).map(([k, v]) => [k, parseMoneyInput(v).value])) } as InvoiceDraft : null;
  const warnings = amounts ? [...(progress?.warnings ?? []), ...invoiceWarnings(amounts)] : [];
  const vendorExpenses = (expenses ?? []).filter(e => e.vendor_id === vendorId && !(imports ?? []).some(i => i.status === 'saved' && i.expense_id === e.id));
  return <Sheet open onClose={() => { if (!busy) onClose(); }} title="Import an invoice" anchor="drawer" size="lg" footer={<>
    <Button variant="secondary" onClick={onClose} disabled={busy}>Close</Button>
    {draft && <Button onClick={() => void save()} disabled={busy || !reviewed}>{busy ? 'Saving…' : 'Save invoice & vendor'}</Button>}
  </>}>
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-secondary">Drop in a supplier invoice, review the details, then save it to your vendors and budget. Log deposits and balance payments afterwards.</p>
      <div role="presentation" className="rounded-lg border-2 border-dashed border-separator p-5 text-center" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length !== 1) { setError('Import one invoice at a time.'); return; } const file = e.dataTransfer.files[0]; if (file) void upload(file); }}>
        <Upload size={24} aria-hidden="true" className="mx-auto mb-2 text-text-muted" />
        <Field label="Drop an invoice here or choose a file" htmlFor="invoice-file">
          <input id="invoice-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy || processing} className="w-full min-w-0 text-xs" onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ''; }} />
        </Field>
        <p className="mt-2 text-xs text-text-muted">PDF or image, up to 15 MB. The invoice is sent to Mixedbread for extraction and the original is kept in your private documents.</p>
      </div>
      {(busy || processing) && <p role="status" className="text-sm text-text-secondary">{busy ? 'Working…' : 'Extracting invoice details… You can close this drawer and return later.'}</p>}
      {(error || importsError) && <p role="alert" className="rounded-md bg-danger-bg p-3 text-sm text-danger-text">{error || 'Could not load recent imports.'}</p>}
      {document && <div className="flex flex-wrap items-center gap-2"><span className="min-w-0 break-all text-sm">{document.name}</span><Button size="sm" variant="secondary" onClick={() => void preview()}><FileText size={14} aria-hidden="true" />View original</Button></div>}
      {document && !progress && !busy && <Button variant="secondary" onClick={() => { setBusy(true); setError(''); void start(document).catch(e => setError(e.message)).finally(() => setBusy(false)); }}>Retry extraction</Button>}
      {progress?.status === 'failed' && <p role="alert" className="text-sm text-danger-text">Extraction failed. Check the document and API key, then retry from recent imports below.</p>}
      {progress?.status === 'saved' && <p role="status" className="text-sm text-text-secondary">This invoice has already been saved. Open its vendor’s invoices and payments to log a payment.</p>}
      {draft && <>
        <Field label="Save to supplier" htmlFor="invoice-vendor"><Select id="invoice-vendor" value={vendorId} onChange={e => { const id = e.target.value; setVendorId(id); setExpenseId(''); const vendor = vendors?.find(v => v.id === id); if (vendor) setCategory(vendor.category); }}><option value="">Create a new supplier</option>{(vendors ?? []).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
        {vendorId && <p className="text-xs text-text-muted">The existing supplier’s contact details are preserved. Extracted details stay with this invoice.</p>}
        {!vendorId && vendors?.some(v => v.name.trim().toLowerCase() === draft.vendor_name.trim().toLowerCase()) && <p className="text-sm text-danger-text">A supplier with this name already exists. Select it above to avoid a duplicate.</p>}
        <Field label="Category" htmlFor="invoice-category"><Select id="invoice-category" value={category} onChange={e => setCategory(e.target.value)}>{VENDOR_CATEGORIES.map(c => <option key={c}>{c}</option>)}</Select></Field>
        {vendorId && <Field label="Budget entry" htmlFor="invoice-expense" hint="Choose an existing expense to keep its payments and update its total, or add a separate invoice."><Select id="invoice-expense" value={expenseId} onChange={e => setExpenseId(e.target.value)}><option value="">Create a new invoice expense</option>{vendorExpenses.map(e => <option key={e.id} value={e.id}>{e.description || e.category}</option>)}</Select></Field>}
        <h3 className="text-sm font-semibold">Review extracted details</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(Object.entries(TEXT_FIELDS) as [keyof typeof TEXT_FIELDS, string][]).map(([key, label]) => <Field key={key} label={label} htmlFor={`invoice-${key}`} className={multiline.has(key) ? 'sm:col-span-2' : ''}>
            {multiline.has(key) ? <Textarea id={`invoice-${key}`} value={draft[key]} rows={key === 'line_items' ? 5 : 2} onChange={e => { setDraft({ ...draft, [key]: e.target.value }); setReviewed(false); }} /> : <Input id={`invoice-${key}`} type={key.endsWith('_date') ? 'date' : 'text'} value={draft[key]} onChange={e => { setDraft({ ...draft, [key]: e.target.value }); setReviewed(false); }} />}
          </Field>)}
          {(Object.entries(MONEY_FIELDS) as [keyof MoneyForm, string][]).map(([key, label]) => <Field key={key} label={label} htmlFor={`invoice-${key}`}><Input id={`invoice-${key}`} inputMode="decimal" value={money[key]} onChange={e => { setMoney({ ...money, [key]: e.target.value }); setReviewed(false); }} /></Field>)}
        </div>
        {warnings.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-danger-text">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
        <p className="text-xs text-text-muted">Printed paid amounts are reference information only. Record actual payments after saving, so deposits are never counted twice. Verify bank details independently before paying.</p>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} className="mt-1" />I have checked the supplier and totals against the original invoice.</label>
      </>}
      {!draft && <div className="border-t border-separator pt-4"><h3 className="mb-2 text-sm font-semibold">Recent invoice imports</h3>{!(imports?.length) && <p className="text-sm text-text-muted">No imports yet.</p>}<div className="flex flex-col gap-2">{(imports ?? []).map(item => <button key={item.id} type="button" disabled={busy || processing} onClick={() => void resume(item)} className="rounded-md border border-separator p-3 text-left hover:bg-hover focus-visible:ring-2 focus-visible:ring-plum-400"><span className="block break-all text-sm">{item.document.name}</span><span className="text-xs text-text-muted">{formatDate(item.created_at)} · {item.status === 'failed' ? 'Failed — retry' : item.status}</span></button>)}</div></div>}
    </div>
  </Sheet>;
}
