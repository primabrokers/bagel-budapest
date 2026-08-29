import { useEffect, useState } from 'react';
import { Mail, MessageCircle } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { showToast } from '../../hooks/useToast';
import { supabase } from '../../lib/supabase';
import { formatDateLong, toLocalDateOnly } from '../../lib/format';
import { buildVendorMessage, vendorMessageToHtml, VENDOR_MESSAGE_TEMPLATES, type VendorMessageKind } from '../../lib/vendors/contactTemplates';
import { buildWhatsAppLink } from '../../lib/share';
import { recordVendorContact } from '../../data/vendors/mutations';
import type { VendorRow } from '../../data/vendors/types';
import type { EventRow } from '../../data/event/types';

/**
 * Send a vendor a message from inside the app, and remember that it was sent.
 *
 * The machinery already existed — `send-email` for email, `buildWhatsAppLink` for WhatsApp — so
 * this is mostly the part that was missing: a decent starting draft, and a record afterwards. With
 * several family members chasing a dozen suppliers, "did anyone ever email the florist?" was a
 * question the app could not answer.
 *
 * The two channels behave differently on purpose. Email is SENT by the app through the edge
 * function, so it can be logged with certainty. WhatsApp can only ever be HANDED OFF to WhatsApp —
 * the app cannot know whether the message was actually sent once the user is in another app — so
 * it is logged as "opened in WhatsApp" at the moment of hand-off, and the copy says so rather than
 * claiming more than it knows.
 */

interface VendorContactSheetProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  vendor: VendorRow;
  event: EventRow | null;
  onContacted: () => void;
}

export function VendorContactSheet({ open, onClose, eventId, vendor, event, onContacted }: VendorContactSheetProps) {
  const [kind, setKind] = useState<VendorMessageKind>('enquiry');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const eventDate = event?.event_date ? toLocalDateOnly(event.event_date) : null;

  // Re-draft whenever the template changes or the sheet reopens. Deliberately overwrites edits:
  // picking a different template is a request for that template's wording, and a merge would
  // produce something that is neither.
  useEffect(() => {
    if (!open) return;
    const built = buildVendorMessage(kind, {
      vendorName: vendor.name,
      contactName: vendor.contact_name || 'Sir or Madam',
      category: vendor.category || 'your services',
      boyName: event?.boy_name ?? '{boyName}',
      eventDate: eventDate ? formatDateLong(eventDate) : '{eventDate}',
      venue: event?.venue_name || '{venue}',
      familyName: event?.parents_names || '{familyName}',
    });
    setSubject(built.subject);
    setBody(built.body);
  }, [open, kind, vendor, event, eventDate]);

  async function handleSendEmail() {
    if (!vendor.email || sending) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean; reason?: string; message?: string }>(
        'send-email',
        { body: { to: vendor.email, subject, html: vendorMessageToHtml(body), text: body } },
      );

      if (error || !data?.ok) {
        // `not_configured` is an expected state, not a fault — say which it is.
        showToast(
          data?.reason === 'not_configured'
            ? 'Email sending is not set up yet. Copy the message and send it from your own email instead.'
            : (data?.message ?? 'Could not send the email — please try again.'),
          'error',
        );
        return;
      }

      await recordVendorContact(eventId, { vendorId: vendor.id, channel: 'email', subject, body, sentTo: vendor.email }, vendor.status);
      showToast(`Emailed ${vendor.name}`, 'success');
      onContacted();
      onClose();
    } catch {
      showToast('Could not send the email — please try again.', 'error');
    } finally {
      setSending(false);
    }
  }

  async function handleOpenWhatsApp() {
    const link = buildWhatsAppLink(vendor.whatsapp || vendor.phone, body);
    if (!link) {
      showToast('This vendor has no usable WhatsApp number.', 'error');
      return;
    }

    // Open first: a popup blocker is far likelier if the window is opened after an await.
    window.open(link, '_blank', 'noopener,noreferrer');

    try {
      await recordVendorContact(
        eventId,
        { vendorId: vendor.id, channel: 'whatsapp', body, sentTo: vendor.whatsapp || vendor.phone },
        vendor.status,
      );
      onContacted();
      onClose();
    } catch {
      // The message is already on its way in WhatsApp; only the record failed.
      showToast('Opened WhatsApp, but could not save it to the contact history.', 'error');
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Contact ${vendor.name}`}
      anchor="drawer"
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" onClick={() => void handleOpenWhatsApp()} disabled={!vendor.whatsapp && !vendor.phone}>
            <MessageCircle size={14} aria-hidden="true" />
            WhatsApp
          </Button>
          <Button type="button" onClick={() => void handleSendEmail()} disabled={sending || !vendor.email}>
            <Mail size={14} aria-hidden="true" />
            {sending ? 'Sending…' : 'Send email'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Message" htmlFor="vendor-template">
          <Select id="vendor-template" value={kind} onChange={(e) => setKind(e.target.value as VendorMessageKind)}>
            {VENDOR_MESSAGE_TEMPLATES.map((template) => (
              <option key={template.kind} value={template.kind}>
                {template.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Subject" htmlFor="vendor-subject" hint="Email only — WhatsApp has no subject line">
          <Input id="vendor-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>

        <Field label="Message" htmlFor="vendor-body" required>
          <Textarea id="vendor-body" rows={12} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>

        <p className="text-xs text-text-muted">
          {vendor.email ? `Email goes to ${vendor.email}. ` : 'No email address on file. '}
          WhatsApp opens in WhatsApp for you to press send there — it is recorded as opened, not as delivered.
        </p>
      </div>
    </Sheet>
  );
}
