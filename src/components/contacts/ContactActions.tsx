import { Mail, MessageCircle, Phone } from 'lucide-react';
import { cn } from '../../lib/cn';
import { toWhatsAppDigits } from '../../lib/share';

interface ContactActionsProps {
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  className?: string;
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
  // `null` when the stored number has no usable digits at all — the shared helper can say that,
  // where the local copy this replaced would happily build `wa.me/` and link to nothing.
  const whatsappDigits = whatsapp ? toWhatsAppDigits(whatsapp) : null;

  if (!phone && !whatsappDigits && !email) return null;

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {phone && (
        <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} aria-label={`Call ${phone}`} className={actionStyles}>
          <Phone size={16} aria-hidden="true" />
        </a>
      )}
      {whatsappDigits && (
        <a
          href={`https://wa.me/${whatsappDigits}`}
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
