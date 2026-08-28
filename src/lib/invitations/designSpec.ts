/**
 * The `spec` half of an AI-generated invitation: a small, closed, fully-validated description of
 * a design that `InvitationRenderer` draws with the app's own React components.
 *
 * Why a spec and not HTML. The generated design is rendered to ANONYMOUS guests on
 * `/rsvp/:token`, and `vercel.json` ships a strict CSP (`script-src 'self'`). Handing a model's
 * raw HTML to `dangerouslySetInnerHTML` on that page would be a live XSS hole reachable by anyone
 * with a link. A spec has no executable surface at all: every field below is either a value from a
 * closed enum, a `#rrggbb` string checked by regex, or plain text with its tags stripped. There is
 * nothing a model (or anyone who later writes to the `design` jsonb through the API with a stolen
 * session) can put in one that becomes script.
 *
 * `html` mode still exists for families who want something this spec cannot express — see
 * `sanitiseInvitationHtml.ts` — but it renders inside a scriptless sandboxed iframe, never here.
 *
 * Everything in this module treats its input as hostile. `parseInvitationDesignSpec` is the ONLY
 * way a spec should ever reach the renderer: it is called on the way out of the AI edge function
 * AND again on the way in from the database, because the jsonb column is not schema-constrained
 * and the row could have been written by something other than this app.
 */

import type { InvitationFontFamily } from '../../data/invitations/types';

export const SPEC_LAYOUTS = ['centred', 'left-rule', 'framed', 'split'] as const;
export type SpecLayout = (typeof SPEC_LAYOUTS)[number];

/** Drawn as inline SVG by the renderer — a name, never a path or markup the model supplies. */
export const SPEC_ORNAMENTS = ['none', 'star-of-david', 'laurel', 'rule', 'corners', 'arch'] as const;
export type SpecOrnament = (typeof SPEC_ORNAMENTS)[number];

export const SPEC_MOTIONS = ['none', 'fade-reveal', 'rise', 'monogram-draw', 'shimmer'] as const;
export type SpecMotion = (typeof SPEC_MOTIONS)[number];

/**
 * What a line MEANS, not how it looks — the renderer owns the type scale, so a model cannot set a
 * 200px font or a colour that vanishes into the background.
 */
export const SPEC_LINE_ROLES = [
  'eyebrow',
  'heading',
  'names',
  'hebrew',
  'date',
  'venue',
  'body',
  'cta',
] as const;
export type SpecLineRole = (typeof SPEC_LINE_ROLES)[number];

const FONT_FAMILIES: InvitationFontFamily[] = ['fraunces', 'inter', 'frank-ruhl-libre'];

/** Caps chosen to be generous for real invitation copy and still bound what one row can hold. */
const MAX_LINES = 14;
const MAX_LINE_LENGTH = 240;

export interface SpecLine {
  role: SpecLineRole;
  text: string;
  emphasis?: boolean;
}

export interface SpecPalette {
  /** `#rrggbb`. Validated — anything else is dropped and the event's own palette is used. */
  bg: string;
  ink: string;
  accent: string;
}

export interface InvitationDesignSpec {
  layout: SpecLayout;
  palette: SpecPalette;
  fontFamily: InvitationFontFamily;
  ornament: SpecOrnament;
  motion: SpecMotion;
  /**
   * Storage path (NOT a URL) in the public `bm-invitation-assets` bucket for a generated
   * background image. A path rather than a URL so nothing here can point the browser at an
   * arbitrary origin; the renderer's caller resolves it, exactly as it already does for the
   * event's `logo_path` / `monogram_path`.
   */
  backgroundAssetPath?: string;
  lines: SpecLine[];
}

export interface SpecParseResult {
  /** `null` when the input could not be salvaged into something safe to render. */
  spec: InvitationDesignSpec | null;
  /** Human-readable reasons, for the designer's "couldn't use that" state. Never shown to guests. */
  errors: string[];
}

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/**
 * Plain text only. Strips anything angle-bracketed rather than escaping it, because a spec line is
 * rendered as a React text child (already escaped) — the strip is here so a model that returns
 * `<b>Ari</b>` produces "Ari" rather than visible tag soup, not as an XSS defence. React's own
 * escaping is that defence.
 *
 * Also collapses whitespace: a model that emits a line wrapped over three lines with indentation
 * should not push that indentation into the rendered invitation.
 */
export function toPlainSpecText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LINE_LENGTH);
}

function parseColour(raw: unknown, fallback: string): string {
  return typeof raw === 'string' && HEX_COLOUR.test(raw.trim()) ? raw.trim().toLowerCase() : fallback;
}

/**
 * A storage path we are willing to hand to `getPublicUrl`. Deliberately strict: no scheme, no
 * protocol-relative `//host`, no `..` traversal, and a known image extension. A model asked for a
 * background can only ever name a file inside the bucket this app writes to.
 */
export function isSafeAssetPath(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  const path = raw.trim();
  if (!path || path.length > 300) return false;
  if (path.startsWith('/') || path.includes('//') || path.includes('..')) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return false;
  return /^[\w./-]+\.(png|jpe?g|webp|avif)$/i.test(path);
}

/**
 * The one entry point. Never throws — a malformed spec degrades to `{ spec: null }` plus reasons,
 * which the designer surfaces as "the model returned something we couldn't use, try again" rather
 * than crashing a page that a guest might be looking at.
 */
export function parseInvitationDesignSpec(raw: unknown): SpecParseResult {
  const errors: string[] = [];

  if (!isRecord(raw)) {
    return { spec: null, errors: ['The design was not an object.'] };
  }

  const rawLines = Array.isArray(raw.lines) ? raw.lines : [];
  if (rawLines.length === 0) {
    return { spec: null, errors: ['The design had no lines of text.'] };
  }
  if (rawLines.length > MAX_LINES) {
    errors.push(`Only the first ${MAX_LINES} lines were kept.`);
  }

  const lines: SpecLine[] = [];
  for (const entry of rawLines.slice(0, MAX_LINES)) {
    if (!isRecord(entry)) continue;
    const text = toPlainSpecText(entry.text);
    // A line with no text left after stripping is dropped rather than rendered as an empty gap.
    if (!text) continue;
    lines.push({
      role: pickEnum(entry.role, SPEC_LINE_ROLES, 'body'),
      text,
      emphasis: entry.emphasis === true,
    });
  }

  if (lines.length === 0) {
    return { spec: null, errors: [...errors, 'Every line was empty once tags were stripped.'] };
  }

  const rawPalette = isRecord(raw.palette) ? raw.palette : {};
  const palette: SpecPalette = {
    bg: parseColour(rawPalette.bg, '#faf7f2'),
    ink: parseColour(rawPalette.ink, '#2b2118'),
    accent: parseColour(rawPalette.accent, '#8a6a3b'),
  };
  if (!HEX_COLOUR.test(String(rawPalette.bg ?? ''))) {
    errors.push('Background colour was not a #rrggbb value; a default was used.');
  }

  const spec: InvitationDesignSpec = {
    layout: pickEnum(raw.layout, SPEC_LAYOUTS, 'centred'),
    palette,
    fontFamily: pickEnum(raw.fontFamily, FONT_FAMILIES, 'fraunces'),
    ornament: pickEnum(raw.ornament, SPEC_ORNAMENTS, 'none'),
    motion: pickEnum(raw.motion, SPEC_MOTIONS, 'none'),
    lines,
  };

  if (raw.backgroundAssetPath !== undefined) {
    if (isSafeAssetPath(raw.backgroundAssetPath)) {
      spec.backgroundAssetPath = raw.backgroundAssetPath.trim();
    } else {
      errors.push('The background image path was rejected.');
    }
  }

  return { spec, errors };
}

/**
 * The JSON Schema handed to the model via `output_config.format`, so the common case is a
 * structurally valid spec rather than a repair job. Exported (not inlined in the edge function)
 * so the schema and `parseInvitationDesignSpec` above cannot drift apart: both read the same
 * `SPEC_*` constant arrays.
 *
 * The schema is a request, not a guarantee — `parseInvitationDesignSpec` still runs on the result.
 */
export function invitationSpecJsonSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['layout', 'palette', 'fontFamily', 'ornament', 'motion', 'lines'],
    properties: {
      layout: { type: 'string', enum: [...SPEC_LAYOUTS] },
      fontFamily: { type: 'string', enum: [...FONT_FAMILIES] },
      ornament: { type: 'string', enum: [...SPEC_ORNAMENTS] },
      motion: { type: 'string', enum: [...SPEC_MOTIONS] },
      palette: {
        type: 'object',
        additionalProperties: false,
        required: ['bg', 'ink', 'accent'],
        properties: {
          bg: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
          ink: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
          accent: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
        },
      },
      lines: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_LINES,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['role', 'text'],
          properties: {
            role: { type: 'string', enum: [...SPEC_LINE_ROLES] },
            text: { type: 'string', maxLength: MAX_LINE_LENGTH },
            emphasis: { type: 'boolean' },
          },
        },
      },
    },
  };
}
