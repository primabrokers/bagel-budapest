import { useEffect, useState } from 'react';
import { Paperclip, Pencil, Plus, Send, Star, Trash2 } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { Toggle } from '../ui/Toggle';
import { Money } from '../ui/Money';
import { SkeletonText } from '../ui/Skeleton';
import { showToast } from '../../hooks/useToast';
import { confirmDialog } from '../../hooks/useConfirm';
import { useEventContext } from '../../data/event/context';
import {
  createQuote,
  createVendor,
  deleteQuote,
  deleteVendor,
  updateQuote,
  updateVendor,
  type VendorInput,
} from '../../data/vendors/mutations';
import { useDocumentLinks } from '../../data/documents/hooks';
import { getSignedDocumentUrl, unlinkDocument } from '../../data/documents/mutations';
import { DocumentPicker } from '../documents/DocumentPicker';
import { QuoteCompareSheet } from './QuoteCompareSheet';
import { VENDOR_STATUSES, VENDOR_STATUS_LABELS } from './statusMeta';
import { VENDOR_CATEGORIES } from '../../lib/vendors/categories';
import { formatDate, normaliseMoneyInput, parseMoneyInput } from '../../lib/format';
import { useTasks } from '../../data/tasks/hooks';
import { setTaskStatus } from '../../data/tasks/mutations';
import { TaskCard } from '../tasks/TaskCard';
import { TaskSheet } from '../tasks/TaskSheet';
import { EntityNotes } from '../notes/EntityNotes';
import type { VendorQuoteRow, VendorStatus, VendorWithQuotes } from '../../data/vendors/types';
import type { TaskRow } from '../../data/tasks/types';

interface VendorSheetProps {
  open: boolean;
  onClose: () => void;
  /** Null means "add a vendor"; otherwise the vendor being edited, quotes embedded. */
  vendor: VendorWithQuotes | null;
  onSaved: () => void;
  /** Hand off to the contact sheet. Only offered for a vendor that already exists — there is
   *  nothing to write a message to while one is still being added. */
  onContact?: (vendorId: string) => void;
}

interface VendorFormState {
  name: string;
  category: string;
  status: VendorStatus;
  contact_name: string;
  phone: string;
  email: string;
  whatsapp: string;
  website: string;
  address: string;
  quoted_price: string;
  agreed_price: string;
  deposit_amount: string;
  deposit_due_date: string;
  balance_due_date: string;
  vat_registered: boolean;
  rating: number | null;
  favourite: boolean;
  notes: string;
}

const EMPTY_FORM: VendorFormState = {
  name: '',
  category: VENDOR_CATEGORIES[0],
  status: 'researching',
  contact_name: '',
  phone: '',
  email: '',
  whatsapp: '',
  website: '',
  address: '',
  quoted_price: '',
  agreed_price: '',
  deposit_amount: '',
  deposit_due_date: '',
  balance_due_date: '',
  vat_registered: false,
  rating: null,
  favourite: false,
  notes: '',
};

function rowToForm(vendor: VendorWithQuotes): VendorFormState {
  return {
    name: vendor.name,
    category: vendor.category,
    status: vendor.status,
    contact_name: vendor.contact_name ?? '',
    phone: vendor.phone ?? '',
    email: vendor.email ?? '',
    whatsapp: vendor.whatsapp ?? '',
    website: vendor.website ?? '',
    address: vendor.address ?? '',
    quoted_price: vendor.quoted_price != null ? String(vendor.quoted_price) : '',
    agreed_price: vendor.agreed_price != null ? String(vendor.agreed_price) : '',
    deposit_amount: vendor.deposit_amount != null ? String(vendor.deposit_amount) : '',
    deposit_due_date: vendor.deposit_due_date ?? '',
    balance_due_date: vendor.balance_due_date ?? '',
    vat_registered: vendor.vat_registered,
    rating: vendor.rating,
    favourite: vendor.favourite,
    notes: vendor.notes ?? '',
  };
}

const EMPTY_QUOTE_FORM = { label: '', amount: '', includes: '', valid_until: '', received_at: '', notes: '' };

/** Parses a money field, distinguishing "left blank" (fine — null) from "typed something we
 *  couldn't read" (a validation error), per CLAUDE.md's money convention. `allowShorthand` is on
 *  — a family typing "3k" for a small vendor cost is exactly the shorthand it exists for. */
function readMoneyField(raw: string): { value: number | null; error?: string } {
  const { value, reason } = parseMoneyInput(raw, { allowShorthand: true });
  if (reason === 'unparseable') return { value: null, error: `Could not read "${raw}" as an amount.` };
  return { value };
}

/**
 * The vendor detail drawer — contact/money/status fields, a star rating, linked quotes (add,
 * edit, delete, compare), linked documents, linked tasks (via `data/tasks`, filtered to this
 * vendor's `vendor_id`) and notes (via the shared `EntityNotes`). Doubles as the "add vendor"
 * form when `vendor` is null, in which case the quotes/documents/tasks/notes sections are hidden
 * — there is nothing yet to link them to.
 */
export function VendorSheet({ open, onClose, vendor, onSaved, onContact }: VendorSheetProps) {
  const { eventId } = useEventContext();
  const [form, setForm] = useState<VendorFormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [quoteSheetOpen, setQuoteSheetOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<VendorQuoteRow | null>(null);
  const [quoteForm, setQuoteForm] = useState(EMPTY_QUOTE_FORM);
  const [quoteSaving, setQuoteSaving] = useState(false);
  const [quoteBusyId, setQuoteBusyId] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const { data: links, reload: reloadLinks } = useDocumentLinks('vendor', vendor?.id ?? '');
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  const { data: allTasks, loading: tasksLoading, reload: reloadTasks } = useTasks();
  const [taskSheetState, setTaskSheetState] = useState<{ task: TaskRow | null } | null>(null);
  const [taskToggleBusyId, setTaskToggleBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(vendor ? rowToForm(vendor) : EMPTY_FORM);
    setErrors({});
  }, [open, vendor]);

  function set<K extends keyof VendorFormState>(key: K, value: VendorFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    const name = form.name.trim();
    const nextErrors: Record<string, string> = {};
    if (!name) nextErrors.name = 'Give the vendor a name.';

    const quoted = readMoneyField(form.quoted_price);
    const agreed = readMoneyField(form.agreed_price);
    const deposit = readMoneyField(form.deposit_amount);
    if (quoted.error) nextErrors.quoted_price = quoted.error;
    if (agreed.error) nextErrors.agreed_price = agreed.error;
    if (deposit.error) nextErrors.deposit_amount = deposit.error;

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      const patch: VendorInput = {
        name,
        category: form.category,
        status: form.status,
        contact_name: form.contact_name.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        website: form.website.trim() || null,
        address: form.address.trim() || null,
        quoted_price: quoted.value,
        agreed_price: agreed.value,
        deposit_amount: deposit.value,
        deposit_due_date: form.deposit_due_date || null,
        balance_due_date: form.balance_due_date || null,
        vat_registered: form.vat_registered,
        rating: form.rating,
        favourite: form.favourite,
        notes: form.notes.trim() || null,
      };
      if (vendor) {
        await updateVendor(vendor.id, patch);
      } else {
        await createVendor(eventId, patch);
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
    if (!vendor) return;
    const ok = await confirmDialog(`Remove "${vendor.name}"?`, {
      body: 'This removes the vendor and any quotes on file. This cannot be undone.',
      tone: 'danger',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteVendor(vendor.id);
      showToast('Vendor removed', 'success');
      onSaved();
      onClose();
    } catch {
      showToast('Could not remove — please try again.', 'error');
    } finally {
      setDeleting(false);
    }
  }

  function openAddQuote() {
    setEditingQuote(null);
    setQuoteForm(EMPTY_QUOTE_FORM);
    setQuoteSheetOpen(true);
  }

  function openEditQuote(quote: VendorQuoteRow) {
    setEditingQuote(quote);
    setQuoteForm({
      label: quote.label ?? '',
      amount: quote.amount != null ? String(quote.amount) : '',
      includes: quote.includes ?? '',
      valid_until: quote.valid_until ?? '',
      received_at: quote.received_at ?? '',
      notes: quote.notes ?? '',
    });
    setQuoteSheetOpen(true);
  }

  async function handleSaveQuote() {
    if (!vendor) return;
    const amount = readMoneyField(quoteForm.amount);
    if (amount.error) {
      showToast(amount.error, 'error');
      return;
    }
    setQuoteSaving(true);
    try {
      const input = {
        label: quoteForm.label.trim() || null,
        amount: amount.value,
        includes: quoteForm.includes.trim() || null,
        valid_until: quoteForm.valid_until || null,
        received_at: quoteForm.received_at || null,
        notes: quoteForm.notes.trim() || null,
      };
      if (editingQuote) {
        await updateQuote(editingQuote.id, input);
      } else {
        await createQuote(eventId, vendor.id, input);
      }
      showToast('Saved', 'success');
      setQuoteSheetOpen(false);
      onSaved();
    } catch {
      showToast('Could not save that quote — please try again.', 'error');
    } finally {
      setQuoteSaving(false);
    }
  }

  async function handleDeleteQuote(quote: VendorQuoteRow) {
    const ok = await confirmDialog(`Remove this quote${quote.label ? ` ("${quote.label}")` : ''}?`, {
      tone: 'danger',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    setQuoteBusyId(quote.id);
    try {
      await deleteQuote(quote.id);
      showToast('Quote removed', 'success');
      onSaved();
    } catch {
      showToast('Could not remove — please try again.', 'error');
    } finally {
      setQuoteBusyId(null);
    }
  }

  async function handleUnlinkDocument(linkId: string) {
    setUnlinkingId(linkId);
    try {
      await unlinkDocument(linkId);
      reloadLinks();
    } catch {
      showToast('Could not remove that attachment — please try again.', 'error');
    } finally {
      setUnlinkingId(null);
    }
  }

  async function handlePreviewDocument(storagePath: string, linkId: string) {
    setPreviewingId(linkId);
    try {
      const url = await getSignedDocumentUrl(storagePath);
      window.open(url, '_blank', 'noopener');
    } catch {
      showToast('Could not open that document — please try again.', 'error');
    } finally {
      setPreviewingId(null);
    }
  }

  async function handleToggleTaskDone(t: TaskRow) {
    setTaskToggleBusyId(t.id);
    try {
      await setTaskStatus(t.id, t.status === 'done' ? 'todo' : 'done');
      reloadTasks();
    } catch {
      showToast('Could not update that task — please try again.', 'error');
    } finally {
      setTaskToggleBusyId(null);
    }
  }

  const quotes = vendor?.quotes ?? [];
  const vendorTasks = vendor ? (allTasks ?? []).filter((t) => t.vendor_id === vendor.id) : [];

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={vendor ? vendor.name : 'Add vendor'}
        anchor="drawer"
        size="lg"
        footer={
          <>
            {vendor && (
              <Button
                type="button"
                variant="danger"
                onClick={() => void handleDelete()}
                disabled={deleting || saving}
                className="mr-auto"
              >
                <Trash2 size={14} aria-hidden="true" />
                {deleting ? 'Removing…' : 'Remove vendor'}
              </Button>
            )}
            {vendor && onContact && (vendor.email || vendor.whatsapp || vendor.phone) && (
              <Button type="button" variant="secondary" onClick={() => onContact(vendor.id)} disabled={saving || deleting}>
                <Send size={14} aria-hidden="true" />
                Contact
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
            <Field label="Name" htmlFor="vendor-name" required error={errors.name}>
              <Input id="vendor-name" value={form.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} />
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Category" htmlFor="vendor-category">
                <Select id="vendor-category" value={form.category} onChange={(e) => set('category', e.target.value)}>
                  {VENDOR_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status" htmlFor="vendor-status">
                <Select id="vendor-status" value={form.status} onChange={(e) => set('status', e.target.value as VendorStatus)}>
                  {VENDOR_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {VENDOR_STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-md border border-separator-soft bg-canvas px-3 py-2">
              <span className="text-sm text-text-secondary">Favourite</span>
              <Toggle checked={form.favourite} onChange={(v) => set('favourite', v)} label="Favourite this vendor" />
            </div>

            <Field label="Rating" hint="Tap a star to rate, tap it again to clear.">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <IconButton key={n} label={`Rate ${n} out of 5`} size="sm" onClick={() => set('rating', form.rating === n ? null : n)}>
                    <Star
                      size={18}
                      aria-hidden="true"
                      className={form.rating != null && n <= form.rating ? 'fill-gold-500 text-gold-500' : 'text-text-faint'}
                    />
                  </IconButton>
                ))}
              </div>
            </Field>
          </div>

          <div className="flex flex-col gap-3 border-t border-separator pt-4">
            <h3 className="text-sm font-semibold text-text-primary">Contact</h3>
            <Field label="Contact name" htmlFor="vendor-contact-name">
              <Input id="vendor-contact-name" value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Phone" htmlFor="vendor-phone">
                <Input id="vendor-phone" type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
              </Field>
              <Field label="WhatsApp" htmlFor="vendor-whatsapp">
                <Input id="vendor-whatsapp" value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Email" htmlFor="vendor-email">
                <Input id="vendor-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
              </Field>
              <Field label="Website" htmlFor="vendor-website">
                <Input id="vendor-website" value={form.website} onChange={(e) => set('website', e.target.value)} />
              </Field>
            </div>
            <Field label="Address" htmlFor="vendor-address">
              <Input id="vendor-address" value={form.address} onChange={(e) => set('address', e.target.value)} />
            </Field>
          </div>

          <div className="flex flex-col gap-3 border-t border-separator pt-4">
            <h3 className="text-sm font-semibold text-text-primary">Money</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Quoted price" htmlFor="vendor-quoted" error={errors.quoted_price}>
                <Input
                  id="vendor-quoted"
                  inputMode="decimal"
                  value={form.quoted_price}
                  invalid={!!errors.quoted_price}
                  onChange={(e) => set('quoted_price', e.target.value)}
                  onBlur={(e) => set('quoted_price', normaliseMoneyInput(e.target.value))}
                  placeholder="£"
                />
              </Field>
              <Field label="Agreed price" htmlFor="vendor-agreed" error={errors.agreed_price}>
                <Input
                  id="vendor-agreed"
                  inputMode="decimal"
                  value={form.agreed_price}
                  invalid={!!errors.agreed_price}
                  onChange={(e) => set('agreed_price', e.target.value)}
                  onBlur={(e) => set('agreed_price', normaliseMoneyInput(e.target.value))}
                  placeholder="£"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Deposit amount" htmlFor="vendor-deposit" error={errors.deposit_amount}>
                <Input
                  id="vendor-deposit"
                  inputMode="decimal"
                  value={form.deposit_amount}
                  invalid={!!errors.deposit_amount}
                  onChange={(e) => set('deposit_amount', e.target.value)}
                  onBlur={(e) => set('deposit_amount', normaliseMoneyInput(e.target.value))}
                  placeholder="£"
                />
              </Field>
              <Field label="Deposit due" htmlFor="vendor-deposit-due">
                <Input
                  id="vendor-deposit-due"
                  type="date"
                  value={form.deposit_due_date}
                  onChange={(e) => set('deposit_due_date', e.target.value)}
                />
              </Field>
            </div>
            <Field label="Balance due" htmlFor="vendor-balance-due">
              <Input
                id="vendor-balance-due"
                type="date"
                value={form.balance_due_date}
                onChange={(e) => set('balance_due_date', e.target.value)}
              />
            </Field>
            <div className="flex items-center justify-between gap-3 rounded-md border border-separator-soft bg-canvas px-3 py-2">
              <span className="text-sm text-text-secondary">VAT registered</span>
              <Toggle checked={form.vat_registered} onChange={(v) => set('vat_registered', v)} label="Vendor is VAT registered" />
            </div>
          </div>

          <Field label="Notes" htmlFor="vendor-notes">
            <Textarea id="vendor-notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
          </Field>

          {vendor && (
            <>
              <div className="flex flex-col gap-2 border-t border-separator pt-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-text-primary">Quotes</h3>
                  <div className="flex items-center gap-2">
                    {quotes.length >= 2 && (
                      <Button type="button" variant="secondary" size="sm" onClick={() => setCompareOpen(true)}>
                        Compare
                      </Button>
                    )}
                    <Button type="button" variant="secondary" size="sm" onClick={openAddQuote}>
                      <Plus size={14} aria-hidden="true" />
                      Add quote
                    </Button>
                  </div>
                </div>
                {quotes.length === 0 ? (
                  <p className="text-xs text-text-muted">No quotes on file yet.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-separator-soft">
                    {quotes.map((quote) => (
                      <li key={quote.id} className="flex items-center gap-2 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-text-primary">
                            {quote.label || 'Untitled quote'}
                            {quote.amount != null && (
                              <>
                                {' — '}
                                <Money value={quote.amount} className="font-medium" />
                              </>
                            )}
                          </p>
                          <p className="truncate text-xs text-text-muted">
                            {quote.received_at ? `Received ${formatDate(quote.received_at)}` : 'No received date'}
                            {quote.valid_until ? ` · Valid until ${formatDate(quote.valid_until)}` : ''}
                          </p>
                        </div>
                        <IconButton label={`Edit quote${quote.label ? `: ${quote.label}` : ''}`} size="sm" onClick={() => openEditQuote(quote)}>
                          <Pencil size={14} aria-hidden="true" />
                        </IconButton>
                        <IconButton
                          label={`Remove quote${quote.label ? `: ${quote.label}` : ''}`}
                          size="sm"
                          disabled={quoteBusyId !== null}
                          onClick={() => void handleDeleteQuote(quote)}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </IconButton>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-col gap-2 border-t border-separator pt-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-text-primary">Documents</h3>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setPickerOpen(true)}>
                    <Paperclip size={14} aria-hidden="true" />
                    Attach
                  </Button>
                </div>
                {(links ?? []).length === 0 ? (
                  <p className="text-xs text-text-muted">Nothing attached yet.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-separator-soft">
                    {(links ?? []).map((link) => (
                      <li key={link.id} className="flex items-center gap-2 py-2">
                        <button
                          type="button"
                          onClick={() => void handlePreviewDocument(link.document.storage_path, link.id)}
                          disabled={previewingId === link.id}
                          className="min-w-0 flex-1 truncate text-left text-sm text-plum-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
                        >
                          {previewingId === link.id ? 'Opening…' : link.document.name}
                        </button>
                        <IconButton
                          label={`Remove attachment: ${link.document.name}`}
                          size="sm"
                          disabled={unlinkingId !== null}
                          onClick={() => void handleUnlinkDocument(link.id)}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </IconButton>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-col gap-2 border-t border-separator pt-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-text-primary">Tasks</h3>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setTaskSheetState({ task: null })}>
                    <Plus size={14} aria-hidden="true" />
                    Add task
                  </Button>
                </div>
                {tasksLoading && !allTasks ? (
                  <SkeletonText lines={2} />
                ) : vendorTasks.length === 0 ? (
                  <p className="text-xs text-text-muted">No tasks linked yet.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {vendorTasks.map((t) => (
                      <TaskCard
                        key={t.id}
                        task={t}
                        onOpen={() => setTaskSheetState({ task: t })}
                        onToggleDone={() => void handleToggleTaskDone(t)}
                        toggleBusy={taskToggleBusyId === t.id}
                      />
                    ))}
                  </div>
                )}
              </div>

              <EntityNotes entityType="vendor" entityId={vendor.id} className="border-t border-separator pt-4" />
            </>
          )}
        </div>
      </Sheet>

      {vendor && (
        <Sheet
          open={quoteSheetOpen}
          onClose={() => setQuoteSheetOpen(false)}
          title={editingQuote ? 'Edit quote' : 'Add quote'}
          anchor="drawer"
          layer="raised"
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setQuoteSheetOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void handleSaveQuote()} disabled={quoteSaving}>
                {quoteSaving ? 'Saving…' : 'Save'}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <Field label="Label" htmlFor="quote-label" hint="e.g. Silver package, Friday only">
              <Input id="quote-label" value={quoteForm.label} onChange={(e) => setQuoteForm((f) => ({ ...f, label: e.target.value }))} />
            </Field>
            <Field label="Amount" htmlFor="quote-amount">
              <Input
                id="quote-amount"
                inputMode="decimal"
                value={quoteForm.amount}
                onChange={(e) => setQuoteForm((f) => ({ ...f, amount: e.target.value }))}
                onBlur={(e) => setQuoteForm((f) => ({ ...f, amount: normaliseMoneyInput(e.target.value) }))}
                placeholder="£"
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Received" htmlFor="quote-received">
                <Input
                  id="quote-received"
                  type="date"
                  value={quoteForm.received_at}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, received_at: e.target.value }))}
                />
              </Field>
              <Field label="Valid until" htmlFor="quote-valid-until">
                <Input
                  id="quote-valid-until"
                  type="date"
                  value={quoteForm.valid_until}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, valid_until: e.target.value }))}
                />
              </Field>
            </div>
            <Field label="Includes" htmlFor="quote-includes">
              <Textarea id="quote-includes" value={quoteForm.includes} onChange={(e) => setQuoteForm((f) => ({ ...f, includes: e.target.value }))} rows={3} />
            </Field>
            <Field label="Notes" htmlFor="quote-notes">
              <Textarea id="quote-notes" value={quoteForm.notes} onChange={(e) => setQuoteForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
            </Field>
          </div>
        </Sheet>
      )}

      {vendor && <QuoteCompareSheet open={compareOpen} onClose={() => setCompareOpen(false)} vendorName={vendor.name} quotes={quotes} />}

      {vendor && (
        <DocumentPicker open={pickerOpen} onClose={() => setPickerOpen(false)} entityType="vendor" entityId={vendor.id} onLinked={reloadLinks} />
      )}

      {vendor && (
        <TaskSheet
          open={taskSheetState !== null}
          onClose={() => setTaskSheetState(null)}
          task={taskSheetState?.task ?? null}
          initialVendorId={vendor.id}
          onSaved={reloadTasks}
          layer="raised"
        />
      )}
    </>
  );
}
