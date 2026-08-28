/**
 * Row types for `bm_rsvp_links` / `bm_invitation_templates` / `bm_invitations` /
 * `bm_invitation_events` — see migration 3
 * (`supabase/migrations/20260828030200_bm_invitations_rsvp.sql`) for the applied schema these
 * mirror field-for-field. Hand-written, not generated — see CLAUDE.md's "no react-query,
 * hand-written row types" data-layer note.
 */

export interface RsvpLinkRow {
  id: string;
  event_id: string;
  /** Unique per household — every household gets exactly one, auto-created by a trigger on
   *  `bm_households` insert (`bm_create_rsvp_link_for_household`). Never insert one by hand. */
  household_id: string;
  token: string;
  revoked: boolean;
  message_to_hosts: string | null;
  last_opened_at: string | null;
  created_at: string;
  updated_at: string;
}

export type InvitationTemplateKind = 'invitation' | 'save_the_date';
export type InvitationChannel = 'link' | 'whatsapp' | 'email';
export type InvitationEventKind =
  | 'created'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'rsvp_clicked'
  | 'completed'
  | 'reminder_sent';

/* -----------------------------------------------------------------------------------------------
   The template `design` jsonb column's shape. This app owns the whole shape — nothing in the
   schema constrains it beyond "valid jsonb" — so it lives here rather than being reverse-engineered
   from a migration.
----------------------------------------------------------------------------------------------- */

/**
 * Every block kind `TemplateDesigner` can toggle/reorder, and `InvitationRenderer` knows how to
 * draw. `photo`/`monogram` render the EVENT's own `logo_path`/`monogram_path` (Stage 3's Settings
 * → Style section) rather than a per-template upload — a bar mitzvah's branding is one thing per
 * event, not one thing per template, and both are already public-bucket paths `InvitationRenderer`
 * can be handed a resolved URL for without needing its own Supabase call.
 */
export type InvitationBlockKind =
  | 'heading'
  | 'names'
  | 'hebrew_line'
  | 'date'
  | 'venue'
  | 'photo'
  | 'monogram'
  | 'rsvp_cta';

export interface InvitationBlock {
  /** Stable across a reorder — the block's own identity, not its position. */
  id: string;
  kind: InvitationBlockKind;
  enabled: boolean;
}

export type InvitationFontFamily = 'fraunces' | 'inter' | 'frank-ruhl-libre';

export interface InvitationPaletteOverride {
  primaryHex?: string;
  accentHex?: string;
}

/**
 * How a template is drawn.
 *
 *   - `blocks`    — the hand-built designer: toggle and reorder the block kinds above. The
 *                   original mode, and still the default for a template with no `mode` set, so
 *                   every template written before AI design existed keeps rendering unchanged.
 *   - `spec`      — an AI-generated design, validated into the closed shape in
 *                   `lib/invitations/designSpec.ts` and drawn with this app's own components.
 *   - `html`      — raw generated markup, rendered ONLY inside a scriptless sandboxed iframe
 *                   (`lib/invitations/sanitiseInvitationHtml.ts`). Never printed, never inlined.
 */
export type InvitationDesignMode = 'blocks' | 'spec' | 'html';

export interface InvitationGenerated {
  /** The prompt the family typed, kept so "regenerate" and "tweak this" have something to build
   *  on, and so a design can be explained months later. */
  prompt?: string;
  /** Free-form because `designSpec.ts` owns the real shape and re-validates on every render —
   *  typing it here as the parsed interface would imply a guarantee this column cannot make. */
  spec?: unknown;
  /** `html` mode only. Stored already-sanitised; sanitised again on render regardless. */
  html?: string;
  /** Which model produced it, for cost attribution and for reproducing a look later. */
  model?: string;
  generatedAt?: string;
}

export interface InvitationDesign {
  blocks: InvitationBlock[];
  /** Falls back to the event's own palette (Settings → Style) when unset — a template only
   *  overrides it when a family wants THIS invitation to look different from the rest of the app. */
  paletteOverride?: InvitationPaletteOverride;
  fontFamily?: InvitationFontFamily;
  /** Absent on every template built before AI design shipped — treat as `'blocks'`. */
  mode?: InvitationDesignMode;
  generated?: InvitationGenerated;
}

export interface InvitationTemplateRow {
  id: string;
  event_id: string;
  kind: InvitationTemplateKind;
  name: string;
  design: InvitationDesign;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface InvitationRow {
  id: string;
  event_id: string;
  household_id: string;
  template_id: string | null;
  channel: InvitationChannel;
  sent_at: string | null;
  created_at: string;
}

export interface InvitationEventRow {
  id: string;
  event_id: string;
  household_id: string;
  invitation_id: string | null;
  kind: InvitationEventKind;
  channel: InvitationChannel | null;
  meta: Record<string, unknown>;
  created_at: string;
}

/** The block order and default toggle state a brand-new template starts with — every kind
 *  present and enabled, in the reading order an invitation naturally lays out top to bottom.
 *  `id` is a plain string per block kind since a fresh design never has two blocks of the same
 *  kind; `TemplateDesigner` only needs stability across a reorder, not global uniqueness. */
export function createDefaultInvitationBlocks(): InvitationBlock[] {
  const kinds: InvitationBlockKind[] = ['monogram', 'heading', 'names', 'hebrew_line', 'date', 'venue', 'photo', 'rsvp_cta'];
  return kinds.map((kind) => ({ id: kind, kind, enabled: true }));
}

export function createDefaultInvitationDesign(): InvitationDesign {
  return { blocks: createDefaultInvitationBlocks(), fontFamily: 'fraunces' };
}
