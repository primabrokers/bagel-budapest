import { formatDateLong, toLocalDateOnly } from '../../lib/format';
import { formatHebrewDate } from '../../lib/hebrewDate';
import { cn } from '../../lib/cn';
import { parseInvitationDesignSpec } from '../../lib/invitations/designSpec';
import { INVITATION_IFRAME_SANDBOX, sanitiseInvitationHtml } from '../../lib/invitations/sanitiseInvitationHtml';
import { GeneratedInvitation } from './GeneratedInvitation';
import type { InvitationDesign, InvitationPaletteOverride } from '../../data/invitations/types';

/**
 * The event fields an invitation actually shows — a deliberate subset of `EventRow` shaped to
 * match what BOTH callers can supply: the authenticated `EventRow` (template designer preview,
 * the print route) and the anonymous public portal's own `bm_rsvp_get` RPC response (a plain
 * jsonb object with the same field names, not a real `EventRow`). Keeping this its own interface
 * — rather than importing `EventRow` and requiring every field — is what lets both feed it
 * without a caller inventing values for columns the RPC never returns (id, created_at, …).
 */
export interface InvitationRendererEvent {
  title: string;
  boy_name: string;
  boy_hebrew_name: string | null;
  /** Date-only, e.g. "2026-10-24" — parsed with `toLocalDateOnly`, never a bare `new Date()`. */
  event_date: string;
  hebrew_date_override: string | null;
  venue_name: string | null;
  venue_address: string | null;
  palette: InvitationPaletteOverride | null;
}

interface InvitationRendererProps {
  event: InvitationRendererEvent;
  design: InvitationDesign;
  /** Shown as a small personalised greeting above the card — set on the public portal and
   *  `SendSheet`'s preview, omitted on the template designer's own generic preview (there is no
   *  one household to greet while editing a template every household will see). */
  householdName?: string | null;
  /** The RSVP CTA's target. Omitted (or null) — the `rsvp_cta` block still renders, but as an
   *  inert, greyed placeholder rather than a real link, which is what the template designer's own
   *  preview wants: a household-specific link doesn't exist yet while editing the shared design. */
  rsvpHref?: string | null;
  /** A resolved, renderable URL for the event's `logo_path` — this component never touches
   *  Supabase storage itself, so every caller resolves the path to a URL before handing it in. */
  photoUrl?: string | null;
  /** Same as `photoUrl`, for `monogram_path`. */
  monogramUrl?: string | null;
  /** Same again, for an AI-generated design's `backgroundAssetPath` in `bm-invitation-assets`. */
  backgroundUrl?: string | null;
  /** Passed through to a generated design's reveal animation. Print and thumbnail callers pass
   *  `false` so a capture never catches a half-faded invitation. */
  animate?: boolean;
  /**
   * Set on the print route. A `spec` design prints fine — it is ordinary markup — but an `html`
   * design lives in a sandboxed iframe, and browsers do not reliably paginate or even paint an
   * iframe's contents when printing. So for print, `html` mode falls through to the block layout,
   * which is why every generated design keeps its blocks. The designer tells the family this.
   */
  forPrint?: boolean;
  className?: string;
}

const FONT_CLASS: Record<NonNullable<InvitationDesign['fontFamily']>, string> = {
  fraunces: 'font-display',
  inter: 'font-sans',
  'frank-ruhl-libre': 'font-hebrew',
};

/**
 * The ONE way an invitation ever renders — a pure function of its props, reused unchanged by
 * `TemplateDesigner`'s live preview, `InvitationPrintPage` (the authenticated print route), and
 * `RsvpPortalPage` (the anonymous public portal's own header). No `useEventContext`, no Supabase
 * import, no data fetching: every caller resolves its own data first and hands this component
 * plain values, which is what makes the same component safe to mount from a page with no
 * authenticated session at all.
 *
 * Renders `design.blocks` in order, skipping any block with `enabled: false` — the designer's own
 * toggle state is the only thing that decides what appears, never a hard-coded layout here.
 */
export function InvitationRenderer({
  event,
  design,
  householdName,
  rsvpHref,
  photoUrl,
  monogramUrl,
  backgroundUrl,
  animate,
  forPrint,
  className,
}: InvitationRendererProps) {
  /*
    Generated modes come first, but every one of them can fall through to the block layout below.
    That is deliberate: `design` is an unconstrained jsonb column, so a row can hold a spec that
    fails validation or markup that sanitises to nothing, and the person most likely to be looking
    when it does is a guest on the public portal. A slightly plainer invitation beats a blank card.
  */
  if (design.mode === 'spec') {
    const { spec } = parseInvitationDesignSpec(design.generated?.spec);
    if (spec) {
      return (
        <GeneratedInvitation
          spec={spec}
          backgroundUrl={backgroundUrl}
          householdName={householdName}
          rsvpHref={rsvpHref}
          animate={animate}
          className={className}
        />
      );
    }
  }

  if (design.mode === 'html' && !forPrint) {
    const { html } = sanitiseInvitationHtml(design.generated?.html);
    if (html) {
      return (
        <iframe
          // The sandbox is the security boundary for generated markup, NOT the sanitiser — see
          // lib/invitations/sanitiseInvitationHtml.ts. It grants nothing: no scripts, no
          // same-origin, so the frame cannot reach this app's session or storage.
          sandbox={INVITATION_IFRAME_SANDBOX}
          srcDoc={html}
          title="Invitation preview"
          className={cn('h-[32rem] w-full rounded-xl border border-separator bg-surface', className)}
        />
      );
    }
  }

  const dateObj = toLocalDateOnly(event.event_date);
  const primaryHex = design.paletteOverride?.primaryHex ?? event.palette?.primaryHex;
  const accentHex = design.paletteOverride?.accentHex ?? event.palette?.accentHex;
  const fontClass = FONT_CLASS[design.fontFamily ?? 'fraunces'];

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-4 rounded-xl border border-separator bg-surface px-6 py-8 text-center',
        fontClass,
        className,
      )}
      style={primaryHex ? { color: primaryHex } : undefined}
    >
      {householdName && (
        <p className="font-sans text-xs uppercase tracking-[.08em] text-text-muted">Dear {householdName},</p>
      )}

      {(design.blocks ?? [])
        .filter((block) => block.enabled)
        .map((block) => {
          switch (block.kind) {
            case 'monogram':
              return monogramUrl ? (
                <img key={block.id} src={monogramUrl} alt="" width={64} height={64} className="h-16 w-16 object-contain" />
              ) : (
                <span key={block.id} aria-hidden="true" className="h-16 w-16 rounded-full border border-dashed border-separator-strong" />
              );

            case 'heading':
              return (
                <p key={block.id} className="text-sm uppercase tracking-[.1em] text-text-muted">
                  You are warmly invited to celebrate the Bar Mitzvah of
                </p>
              );

            case 'names':
              return (
                <h1 key={block.id} className="text-3xl font-semibold" style={accentHex ? { color: accentHex } : undefined}>
                  {event.boy_name}
                </h1>
              );

            case 'hebrew_line': {
              const hebrewText = event.hebrew_date_override || event.boy_hebrew_name || (dateObj ? formatHebrewDate(dateObj) : null);
              return hebrewText ? (
                <p key={block.id} className="font-hebrew text-lg">
                  {hebrewText}
                </p>
              ) : null;
            }

            case 'date':
              return dateObj ? (
                <p key={block.id} className="font-sans text-base text-text-primary">
                  {formatDateLong(dateObj)}
                </p>
              ) : null;

            case 'venue':
              return event.venue_name || event.venue_address ? (
                <div key={block.id} className="font-sans text-sm text-text-secondary">
                  {event.venue_name && <p className="font-medium text-text-primary">{event.venue_name}</p>}
                  {event.venue_address && <p>{event.venue_address}</p>}
                </div>
              ) : null;

            case 'photo':
              return photoUrl ? (
                <img key={block.id} src={photoUrl} alt="" className="max-h-48 w-full rounded-lg object-cover" />
              ) : null;

            case 'rsvp_cta':
              return rsvpHref ? (
                <a
                  key={block.id}
                  href={rsvpHref}
                  className="mt-2 inline-flex items-center rounded-md px-5 py-2.5 font-sans text-sm font-semibold text-text-inverse shadow-sm"
                  style={{ backgroundColor: accentHex ?? primaryHex ?? '#72386B' }}
                >
                  RSVP
                </a>
              ) : (
                <span
                  key={block.id}
                  aria-hidden="true"
                  className="mt-2 inline-flex items-center rounded-md border border-dashed border-separator-strong px-5 py-2.5 font-sans text-sm font-semibold text-text-faint"
                >
                  RSVP
                </span>
              );

            default:
              return null;
          }
        })}
    </div>
  );
}
