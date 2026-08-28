import { useEffect, useState } from 'react';
import { Copy, Mail, MessageCircle } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Field, Input, Textarea } from '../ui/Field';
import { showToast } from '../../hooks/useToast';
import { supabase } from '../../lib/supabase';
import { buildWhatsAppLink, personaliseMessage } from '../../lib/share';
import { recordInvitationSent, recordReminderSent } from '../../data/invitations/mutations';
import type { HouseholdWithGuests } from '../../data/guests/types';

interface SendSheetProps {
  open: boolean;
  onClose: () => void;
  /** `'invite'` records a fresh `bm_invitations` row on send; `'reminder'` is tracking-only (see
   *  `recordReminderSent`) — same sheet, same three channels, different bookkeeping underneath. */
  mode: 'invite' | 'reminder';
  household: HouseholdWithGuests;
  eventId: string;
  boyName: string;
  rsvpUrl: string;
  /** Which template this send is "for", recorded on `bm_invitations.template_id` — irrelevant
   *  (and ignored) in `'reminder'` mode. `null` when sending the default, unconfigured design. */
  templateId: string | null;
  onSent: () => void;
}

type EmailSendResult = { ok: true } | { ok: false; reason: 'not_configured' | 'invalid_request' | 'send_failed'; message: string };

function defaultMessageTemplate(mode: 'invite' | 'reminder'): string {
  return mode === 'invite'
    ? "Hi {household}, you're warmly invited to {boy_name}'s Bar Mitzvah! Please RSVP here: {link}"
    : "Hi {household}, just a friendly reminder to RSVP for {boy_name}'s Bar Mitzvah: {link}";
}

function defaultSubject(mode: 'invite' | 'reminder', boyName: string): string {
  return mode === 'invite' ? `You're invited to ${boyName}'s Bar Mitzvah` : `Reminder: please RSVP for ${boyName}'s Bar Mitzvah`;
}

/** Wraps a plain-text message as minimal, safe email HTML — escaped, with line breaks preserved.
 *  Not the full `InvitationRenderer` card: an email channel here is a personal note with a link,
 *  not a rendered invitation graphic. */
function buildEmailHtml(message: string): string {
  const escaped = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<div style="font-family: sans-serif; white-space: pre-wrap; line-height: 1.6; font-size: 15px; color: #2C1C28;">${escaped}</div>`;
}

/**
 * Copy-link / WhatsApp / email — the three channels `bm_invitations.channel` supports (migration
 * 3). Each records itself via `recordInvitationSent`/`recordReminderSent` the moment the family
 * member actually takes the action (copies the link, opens WhatsApp, or an email genuinely sends)
 * — not on open, since opening this sheet isn't itself a send.
 */
export function SendSheet({ open, onClose, mode, household, eventId, boyName, rsvpUrl, templateId, onSent }: SendSheetProps) {
  const [message, setMessage] = useState('');
  const [subject, setSubject] = useState('');
  const [copying, setCopying] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const householdLabel = household.main_contact_name || household.name;
    setMessage(personaliseMessage(defaultMessageTemplate(mode), { household: householdLabel, boy_name: boyName, link: rsvpUrl }));
    setSubject(defaultSubject(mode, boyName));
    setEmailNotice(null);
  }, [open, mode, household, boyName, rsvpUrl]);

  async function record(channel: 'link' | 'whatsapp' | 'email') {
    if (mode === 'invite') {
      await recordInvitationSent(eventId, household.id, templateId, channel);
    } else {
      await recordReminderSent(eventId, household.id, channel);
    }
    onSent();
  }

  async function handleCopyLink() {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(rsvpUrl);
      showToast('Link copied', 'success');
      await record('link');
    } catch {
      showToast('Could not copy the link — please try again.', 'error');
    } finally {
      setCopying(false);
    }
  }

  const whatsAppLink = buildWhatsAppLink(household.whatsapp || household.phone, message);

  async function handleWhatsApp() {
    if (!whatsAppLink) return;
    window.open(whatsAppLink, '_blank', 'noopener');
    try {
      await record('whatsapp');
    } catch {
      // The WhatsApp tab already opened — a bookkeeping failure here shouldn't read as "nothing
      // happened", so this stays quiet rather than showing an error over a send that did occur.
    }
  }

  async function handleSendEmail() {
    if (!household.email) return;
    setSendingEmail(true);
    setEmailNotice(null);
    try {
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: { to: household.email, subject, html: buildEmailHtml(message), text: message },
      });
      if (error) {
        showToast('Could not send the email — please try again.', 'error');
        return;
      }
      const result = data as EmailSendResult;
      if (!result.ok) {
        if (result.reason === 'not_configured') {
          setEmailNotice("Email sending isn't set up yet — try WhatsApp or copy the link instead.");
        } else {
          showToast(result.message, 'error');
        }
        return;
      }
      showToast('Email sent', 'success');
      await record('email');
    } catch {
      showToast('Could not send the email — please try again.', 'error');
    } finally {
      setSendingEmail(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={mode === 'invite' ? `Send invitation — ${household.name}` : `Send reminder — ${household.name}`}
      anchor="drawer"
      layer="raised"
      footer={
        <Button type="button" variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="RSVP link" htmlFor="send-sheet-link">
          <div className="flex items-center gap-2">
            <Input id="send-sheet-link" value={rsvpUrl} readOnly className="font-mono text-xs" />
            <Button type="button" variant="secondary" size="sm" onClick={() => void handleCopyLink()} disabled={copying}>
              <Copy size={14} aria-hidden="true" />
              Copy
            </Button>
          </div>
        </Field>

        <Field label="Message" htmlFor="send-sheet-message" hint="Used for WhatsApp and the email body below">
          <Textarea id="send-sheet-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} />
        </Field>

        <div className="flex flex-col gap-2 border-t border-separator pt-4">
          <h3 className="text-sm font-semibold text-text-primary">WhatsApp</h3>
          {whatsAppLink ? (
            <Button type="button" variant="secondary" onClick={() => void handleWhatsApp()} className="self-start">
              <MessageCircle size={15} aria-hidden="true" />
              Open WhatsApp
            </Button>
          ) : (
            <p className="text-xs text-text-muted">No phone number on file for this household.</p>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-separator pt-4">
          <h3 className="text-sm font-semibold text-text-primary">Email</h3>
          {household.email ? (
            <>
              <Field label="Subject" htmlFor="send-sheet-subject">
                <Input id="send-sheet-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </Field>
              <Button type="button" onClick={() => void handleSendEmail()} disabled={sendingEmail} className="self-start">
                <Mail size={15} aria-hidden="true" />
                {sendingEmail ? 'Sending…' : `Send to ${household.email}`}
              </Button>
              {emailNotice && <p className="text-xs text-text-muted">{emailNotice}</p>}
            </>
          ) : (
            <p className="text-xs text-text-muted">No email address on file for this household.</p>
          )}
        </div>
      </div>
    </Sheet>
  );
}
