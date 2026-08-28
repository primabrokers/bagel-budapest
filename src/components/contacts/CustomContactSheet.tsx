import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Field, Input, Textarea } from '../ui/Field';
import { showToast } from '../../hooks/useToast';
import { confirmDialog } from '../../hooks/useConfirm';
import { useEventContext } from '../../data/event/context';
import {
  createCustomContact,
  deleteCustomContact,
  updateCustomContact,
  type CustomContactInput,
} from '../../data/contacts/mutations';
import type { CustomContactRow } from '../../data/contacts/types';

interface CustomContactSheetProps {
  open: boolean;
  onClose: () => void;
  /** `null` — adding a new contact. */
  contact: CustomContactRow | null;
  onSaved: () => void;
}

interface FormState {
  name: string;
  role: string;
  phone: string;
  email: string;
  whatsapp: string;
  notes: string;
}

const EMPTY_FORM: FormState = { name: '', role: '', phone: '', email: '', whatsapp: '', notes: '' };

function toForm(contact: CustomContactRow): FormState {
  return {
    name: contact.name,
    role: contact.role ?? '',
    phone: contact.phone ?? '',
    email: contact.email ?? '',
    whatsapp: contact.whatsapp ?? '',
    notes: contact.notes ?? '',
  };
}

/** Add/edit sheet for one `bm_custom_contacts` row — the third of the three contact kinds
 *  `ContactsPage` lists (the other two, households and vendors, are managed on their own
 *  pages and read-only here). */
export function CustomContactSheet({ open, onClose, contact, onSaved }: CustomContactSheetProps) {
  const { eventId } = useEventContext();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(contact ? toForm(contact) : EMPTY_FORM);
    setErrors({});
  }, [open, contact]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    const name = form.name.trim();
    if (!name) {
      setErrors({ name: 'Give this contact a name.' });
      return;
    }
    setSaving(true);
    try {
      const patch: CustomContactInput = {
        name,
        role: form.role.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (contact) {
        await updateCustomContact(contact.id, patch);
      } else {
        await createCustomContact(eventId, patch);
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
    if (!contact) return;
    const ok = await confirmDialog(`Remove "${contact.name}"?`, { tone: 'danger', confirmLabel: 'Remove' });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteCustomContact(contact.id);
      showToast('Contact removed', 'success');
      onSaved();
      onClose();
    } catch {
      showToast('Could not remove — please try again.', 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={contact ? contact.name : 'Add contact'}
      anchor="drawer"
      footer={
        <>
          {contact && (
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
      <div className="flex flex-col gap-3">
        <Field label="Name" htmlFor="contact-name" required error={errors.name}>
          <Input id="contact-name" value={form.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} />
        </Field>
        <Field label="Role" htmlFor="contact-role" hint="e.g. Rabbi, Videographer's assistant, Venue coordinator">
          <Input id="contact-role" value={form.role} onChange={(e) => set('role', e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Phone" htmlFor="contact-phone">
            <Input id="contact-phone" type="tel" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="WhatsApp" htmlFor="contact-whatsapp">
            <Input id="contact-whatsapp" value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} />
          </Field>
        </div>
        <Field label="Email" htmlFor="contact-email">
          <Input id="contact-email" type="email" inputMode="email" spellCheck={false} autoCapitalize="none" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Notes" htmlFor="contact-notes">
          <Textarea id="contact-notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
        </Field>
      </div>
    </Sheet>
  );
}
