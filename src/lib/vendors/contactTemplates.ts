import { personaliseMessage } from '../share';

/**
 * The wording a family sends a vendor, so nobody has to compose an enquiry from scratch at
 * eleven at night — and so two family members chasing the same florist do not send two wildly
 * different-sounding messages.
 *
 * Templates use the same `{placeholder}` syntax and the same `personaliseMessage` substitution as
 * the RSVP messages in `lib/share.ts`, rather than a second mini-language for the same job.
 *
 * British English throughout, and deliberately understated: these go to suppliers who will quote
 * on them, and a breathless message invites a breathless price.
 */

export type VendorMessageKind = 'enquiry' | 'chase' | 'accept' | 'decline';

export interface VendorMessageTemplate {
  kind: VendorMessageKind;
  label: string;
  /** Email only — WhatsApp has no subject line. */
  subject: string;
  body: string;
}

/**
 * Placeholders every template may use. Anything missing is left as typed rather than replaced
 * with a blank, which is `personaliseMessage`'s documented behaviour and the right one here: a
 * visible `{venue}` in a draft is a prompt to fill it in, where an empty gap reads as finished.
 */
export interface VendorMessageVars {
  vendorName: string;
  contactName: string;
  category: string;
  boyName: string;
  eventDate: string;
  venue: string;
  familyName: string;
}

export const VENDOR_MESSAGE_TEMPLATES: readonly VendorMessageTemplate[] = [
  {
    kind: 'enquiry',
    label: 'First enquiry',
    subject: 'Enquiry — Bar Mitzvah, {eventDate}',
    body: `Dear {contactName},

We are planning our son {boyName}'s Bar Mitzvah on {eventDate} at {venue}, and are looking for {category}.

Could you let us know whether you have the date available, and what you would charge? If it would help to speak, I am happy to arrange a call.

With thanks,
{familyName}`,
  },
  {
    kind: 'chase',
    label: 'Polite chase',
    subject: 'Following up — Bar Mitzvah, {eventDate}',
    body: `Dear {contactName},

I wrote recently about {category} for our son {boyName}'s Bar Mitzvah on {eventDate}, and wanted to check the message reached you.

If you are already booked that day, do just say — it is helpful to know either way.

With thanks,
{familyName}`,
  },
  {
    kind: 'accept',
    label: 'Confirm booking',
    subject: 'Confirming our booking — {eventDate}',
    body: `Dear {contactName},

Thank you — we would like to go ahead and book {vendorName} for {boyName}'s Bar Mitzvah on {eventDate} at {venue}.

Please send through anything you need from us, along with the deposit details and the date it is due.

With thanks,
{familyName}`,
  },
  {
    kind: 'decline',
    label: 'Decline politely',
    subject: 'Thank you — {eventDate}',
    body: `Dear {contactName},

Thank you for taking the time to quote for {boyName}'s Bar Mitzvah. On this occasion we have decided to go a different way.

We appreciated your help, and will keep you in mind another time.

With best wishes,
{familyName}`,
  },
];

export function vendorMessageTemplate(kind: VendorMessageKind): VendorMessageTemplate {
  return VENDOR_MESSAGE_TEMPLATES.find((t) => t.kind === kind) ?? VENDOR_MESSAGE_TEMPLATES[0];
}

export interface BuiltVendorMessage {
  subject: string;
  body: string;
}

export function buildVendorMessage(kind: VendorMessageKind, vars: VendorMessageVars): BuiltVendorMessage {
  const template = vendorMessageTemplate(kind);
  const substitutions: Record<string, string> = { ...vars };
  return {
    subject: personaliseMessage(template.subject, substitutions),
    body: personaliseMessage(template.body, substitutions),
  };
}

/**
 * A very plain HTML rendering for the email channel — `send-email` requires an `html` body.
 *
 * Escapes first, then turns blank lines into paragraphs. Vendor names and a family's own typed
 * message reach this, so it must not be possible to inject markup into an email the family sends
 * under their own name.
 */
export function vendorMessageToHtml(body: string): string {
  const escaped = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return escaped
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br />')}</p>`)
    .join('\n');
}
