/**
 * Pure helpers for sending an invitation/reminder by hand — a `wa.me` deep link pre-filled with a
 * personalised message, and the `{token}`-style substitution that builds that message from a
 * template. No Supabase, no React: `SendSheet` and `HouseholdSheet`'s RSVP-link affordance both
 * call these directly, and `RsvpTrackerPage`'s reminder flow builds its message the same way.
 *
 * `components/contacts/ContactActions.tsx` (Stage 9) has its own small, local WhatsApp-digit
 * normaliser with a comment pointing at this module as "the shared, fuller version" — this is
 * that module. The two happen to agree on the UK-biased digit rule; nothing here changes that
 * file, which is outside this stage's scope.
 */

/**
 * Best-effort UK-biased normalisation of a phone number to the digits-only,
 * country-code-prefixed form `wa.me` needs: a leading `+` is treated as already
 * international and just stripped of punctuation; a UK-style leading `0` is swapped for `44`;
 * anything else is passed through digits-only, unmodified, on the assumption it is already in
 * a dialable international shape (this app is UK-only per CLAUDE.md, but a household's own
 * contact number is free text and may already be typed with a country code).
 *
 * Returns `null` for a blank or digit-free input — there is nothing to link to.
 */
export function toWhatsAppDigits(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (raw.trim().startsWith('+')) return digits;
  if (digits.startsWith('0')) return `44${digits.slice(1)}`;
  return digits;
}

/**
 * A `https://wa.me/<digits>?text=<message>` link, or `null` when there is no usable phone number
 * to link to — the caller (`SendSheet`) renders its WhatsApp action disabled/hidden in that case
 * rather than a link to nowhere. `message` is the already-personalised text (see
 * `personaliseMessage` below); this function only builds the link, it never composes copy.
 */
export function buildWhatsAppLink(phone: string | null | undefined, message: string): string | null {
  if (!phone) return null;
  const digits = toWhatsAppDigits(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/**
 * Replaces every `{name}`-style placeholder in `template` with `vars[name]`. A placeholder with
 * no matching var is left exactly as typed — `{oops}` in a hand-edited message stays visible
 * rather than silently vanishing, which is easier to notice and fix than a blank gap would be.
 *
 *   personaliseMessage('Hi {household}, here's your RSVP link: {link}', { household: 'The Cohens', link: 'https://…' })
 *   // "Hi The Cohens, here's your RSVP link: https://…"
 */
export function personaliseMessage(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match,
  );
}
