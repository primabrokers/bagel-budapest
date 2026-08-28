import { useEffect, useState } from 'react';
import { cn } from '../../lib/cn';
import type { InvitationDesignSpec, SpecLine, SpecOrnament } from '../../lib/invitations/designSpec';

/**
 * Draws a validated AI design spec using this app's own markup — the `spec` half of the two-mode
 * design described in `lib/invitations/designSpec.ts`.
 *
 * The spec reaching this component has already been through `parseInvitationDesignSpec`, so every
 * value below is known-safe: colours are `#rrggbb`, layout/ornament/motion are members of closed
 * enums, and line text is plain (and escaped again by React as a text child). Nothing here needs
 * to re-check that, and nothing here should ever be given a raw, unparsed spec.
 *
 * Pure props-only, like `InvitationRenderer` itself — no data fetching, no `useEventContext`, no
 * Supabase import — because the same component renders inside the authenticated designer, the
 * print route, and the anonymous public RSVP portal.
 */

interface GeneratedInvitationProps {
  spec: InvitationDesignSpec;
  /** Resolved public URL for `spec.backgroundAssetPath`; the caller does the resolving, exactly
   *  as it already does for the event's `logo_path` / `monogram_path`. */
  backgroundUrl?: string | null;
  householdName?: string | null;
  rsvpHref?: string | null;
  /** Print and thumbnail contexts pass `false` — an animation that runs while a page is being
   *  captured or printed produces a half-faded invitation. */
  animate?: boolean;
  className?: string;
}

const FONT_CLASS: Record<InvitationDesignSpec['fontFamily'], string> = {
  fraunces: 'font-display',
  inter: 'font-sans',
  'frank-ruhl-libre': 'font-hebrew',
};

/** Type scale per line role. The spec says what a line MEANS; this decides how big it is, so a
 *  model cannot produce an invitation with 200px body text or a heading nobody can read. */
const ROLE_CLASS: Record<SpecLine['role'], string> = {
  eyebrow: 'font-sans text-xs uppercase tracking-[.14em] opacity-70',
  heading: 'font-sans text-sm uppercase tracking-[.1em] opacity-80',
  names: 'text-3xl font-semibold leading-tight sm:text-4xl',
  hebrew: 'font-hebrew text-xl leading-relaxed',
  date: 'font-sans text-base',
  venue: 'font-sans text-sm opacity-85',
  body: 'font-sans text-sm leading-relaxed opacity-90',
  cta: 'font-sans text-sm font-semibold',
};

/** How the card itself is decorated per layout. */
const LAYOUT_CHROME: Record<InvitationDesignSpec['layout'], string> = {
  centred: '',
  'left-rule': 'border-l-4 pl-5',
  framed: '',
  split: '',
};

/** How content is aligned per layout — kept separate from the chrome above so the inner content
 *  column can share the alignment without inheriting the border and padding a second time. */
const LAYOUT_ALIGN: Record<InvitationDesignSpec['layout'], string> = {
  centred: 'items-center text-center',
  'left-rule': 'items-start text-left',
  framed: 'items-center text-center',
  split: 'items-center text-center',
};

/**
 * Ornaments are drawn here as inline SVG from a name in the spec — never from model-supplied path
 * data or markup, which is the whole reason `ornament` is an enum rather than a string of SVG.
 */
function Ornament({ kind, colour }: { kind: SpecOrnament; colour: string }) {
  if (kind === 'none') return null;

  const common = { 'aria-hidden': true as const, fill: 'none', stroke: colour, strokeWidth: 1.5 };

  switch (kind) {
    case 'star-of-david':
      return (
        <svg {...common} viewBox="0 0 40 40" className="h-8 w-8">
          <path d="M20 4 L33 27 H7 Z" />
          <path d="M20 36 L7 13 H33 Z" />
        </svg>
      );
    case 'laurel':
      return (
        <svg {...common} viewBox="0 0 80 24" className="h-5 w-20">
          <path d="M4 12 Q20 2 38 12 Q20 22 4 12" />
          <path d="M76 12 Q60 2 42 12 Q60 22 76 12" />
        </svg>
      );
    case 'rule':
      return (
        <svg {...common} viewBox="0 0 120 8" className="h-2 w-28">
          <path d="M0 4 H48" />
          <path d="M72 4 H120" />
          <circle cx="60" cy="4" r="3" />
        </svg>
      );
    case 'corners':
      return (
        <svg {...common} viewBox="0 0 60 12" className="h-3 w-16">
          <path d="M0 12 V0 H12" />
          <path d="M48 0 H60 V12" />
        </svg>
      );
    case 'arch':
      return (
        <svg {...common} viewBox="0 0 60 30" className="h-7 w-16">
          <path d="M4 30 V16 A26 26 0 0 1 56 16 V30" />
        </svg>
      );
    default:
      return null;
  }
}

export function GeneratedInvitation({
  spec,
  backgroundUrl,
  householdName,
  rsvpHref,
  animate = true,
  className,
}: GeneratedInvitationProps) {
  // Mount-triggered so the reveal actually plays rather than being over before paint. The
  // `motion-safe:` variants below mean a reader with "reduce motion" set simply sees the final
  // state — the content is never gated behind an animation that will not run for them.
  const [entered, setEntered] = useState(!animate);
  useEffect(() => {
    if (!animate) return;
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [animate]);

  const revealing = spec.motion === 'fade-reveal' || spec.motion === 'rise';

  return (
    <div
      className={cn(
        'relative flex flex-col gap-4 overflow-hidden rounded-xl px-6 py-8',
        FONT_CLASS[spec.fontFamily],
        LAYOUT_ALIGN[spec.layout],
        LAYOUT_CHROME[spec.layout],
        className,
      )}
      style={{
        backgroundColor: spec.palette.bg,
        color: spec.palette.ink,
        borderColor: spec.palette.accent,
        // `ring` and `border-l` above take their colour from this; set here rather than via a
        // Tailwind class because the value is per-design, not from the token palette.
        ...(spec.layout === 'framed' ? { boxShadow: `inset 0 0 0 1px ${spec.palette.accent}` } : {}),
      }}
    >
      {backgroundUrl && (
        <img
          src={backgroundUrl}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20"
        />
      )}

      {/* Everything sits above the background image. */}
      <div className={cn('relative flex w-full flex-col gap-4', LAYOUT_ALIGN[spec.layout])}>
        {householdName && (
          <p className="font-sans text-xs uppercase tracking-[.08em] opacity-70">Dear {householdName},</p>
        )}

        {spec.ornament !== 'none' && <Ornament kind={spec.ornament} colour={spec.palette.accent} />}

        {spec.lines.map((line, index) => (
          <p
            key={`${line.role}-${index}`}
            className={cn(
              ROLE_CLASS[line.role],
              revealing && 'transition duration-700 ease-out',
              revealing && !entered && 'motion-safe:opacity-0',
              revealing && !entered && spec.motion === 'rise' && 'motion-safe:translate-y-3',
            )}
            style={{
              ...(line.emphasis ? { color: spec.palette.accent } : {}),
              // Staggered so the invitation reads top-to-bottom rather than appearing at once.
              ...(revealing ? { transitionDelay: `${Math.min(index * 90, 700)}ms` } : {}),
            }}
          >
            {line.text}
          </p>
        ))}

        {/* The RSVP call to action is the app's, never the model's — it is per-household and the
            design prompt explicitly forbids the model from inventing one. */}
        {rsvpHref ? (
          <a
            href={rsvpHref}
            className="mt-2 inline-flex items-center self-center rounded-md px-5 py-2.5 font-sans text-sm font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{ backgroundColor: spec.palette.accent, color: spec.palette.bg }}
          >
            RSVP
          </a>
        ) : (
          <span
            aria-hidden="true"
            className="mt-2 inline-flex items-center self-center rounded-md border border-dashed px-5 py-2.5 font-sans text-sm font-semibold opacity-50"
            style={{ borderColor: spec.palette.accent }}
          >
            RSVP
          </span>
        )}
      </div>
    </div>
  );
}
