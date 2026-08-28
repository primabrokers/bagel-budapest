import { Mail, MessageCircle, Phone } from 'lucide-react';
import { cn } from '../../lib/cn';

interface ContactActionsProps {
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  className?: string;
}

/** Best-effort, UK-biased normalisation to the digits-only, country-code-prefixed form wa.me
 *  needs (`44` + the number without its leading `0`). A shared, fuller `buildWhatsAppLink` is
 *  Stage 5's territory (`lib/share.ts`, for RSVP sending) and doesn't exist yet in this
 *  worktree — this stays local and simple until that lands. */
function toWhatsAppDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (raw.trim().startsWith('+')) return digits;
  if (digits.startsWith('0')) return `44${digits.slice(1)}`;
  return digits;
}

const actionStyles =
  'inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-md text-text-muted transition-colors ' +
  'hover:bg-canvas hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400 ' +
  'sm:h-9 sm:w-9';

/**
 * A shared row of `tel:`/`wa.me`/`mailto:` links given a phone/whatsapp/email — used identically
 * by household, vendor and custom contact rows on `ContactsPage`, so the affordance looks the
 * same regardless of which of the three kinds a row is. Renders nothing (not even an empty row)
 * when none of the three are present.
 */
export function ContactActions({ phone, whatsapp, email, className }: ContactActionsProps) {
  if (!phone && !whatsapp && !email) return null;

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {phone && (
        <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} aria-label={`Call ${phone}`} className={actionStyles}>
          <Phone size={16} aria-hidden="true" />
        </a>
      )}
      {whatsapp && (
        <a
          href={`https://wa.me/${toWhatsAppDigits(whatsapp)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Message ${whatsapp} on WhatsApp`}
          className={actionStyles}
        >
          <MessageCircle size={16} aria-hidden="true" />
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} aria-label={`Email ${email}`} className={actionStyles}>
          <Mail size={16} aria-hidden="true" />
        </a>
      )}
    </div>
  );
}
