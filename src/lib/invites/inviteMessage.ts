/**
 * Turning "invite Sara" into something Sara can actually act on.
 *
 * The app's own invite is a row in `bm_event_members` carrying an email address, which
 * `bm_ensure_event_provisioned()` claims the first time somebody signs in with that address. That
 * makes the instructions unusually load-bearing: the invited person must sign up with THE SAME
 * address, or the row is never claimed and they land in a working app that shows them nothing.
 * Nothing about the sign-in screen hints at that, so the message has to say it plainly.
 */

export interface InviteMessageInput {
  /** Where the planner lives, e.g. `https://barmitzvah-planner.vercel.app`. No trailing slash. */
  appUrl: string;
  /** The address the invite was recorded against — the one they must sign up with. */
  inviteEmail: string;
  /** Whose simcha it is, for a subject line that means something in a crowded inbox. */
  boyName: string;
  /** Who sent it, if known. */
  invitedBy?: string | null;
}

export interface InviteMessage {
  subject: string;
  text: string;
  html: string;
}

/**
 * Lowercased and trimmed, or `null` if it is not an address.
 *
 * The lowercasing is the whole point, not tidiness. Supabase stores account emails lowercased, and
 * the claim in `bm_ensure_event_provisioned()` compares the invite to `auth.email()` — so an
 * invite recorded as `Sara@Gmail.com` can never be matched by anybody, and the invited person is
 * left signing in successfully to an empty app with nothing to explain why.
 */
export function normaliseInviteEmail(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed.length > 254) return null;
  // Deliberately simple: one @, something either side, a dot in the domain, no whitespace. The
  // real check is whether a confirmation email arrives, not a regex.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildFamilyInviteMessage({ appUrl, inviteEmail, boyName, invitedBy }: InviteMessageInput): InviteMessage {
  const opener = invitedBy?.trim()
    ? `${invitedBy.trim()} has given you access to the planner for ${boyName}'s Bar Mitzvah.`
    : `You have been given access to the planner for ${boyName}'s Bar Mitzvah.`;

  const url = appUrl.replace(/\/+$/, '');

  const text = [
    opener,
    '',
    'To get in:',
    `1. Open ${url}`,
    '2. Choose "Sign up"',
    `3. Sign up with this exact email address: ${inviteEmail}`,
    '',
    'The address has to match, otherwise the planner will not know to let you in.',
    'Once you are signed in you will see the guest list, seating, budget and everything else.',
  ].join('\n');

  const html = [
    `<p>${escapeHtml(opener)}</p>`,
    '<p><strong>To get in:</strong></p>',
    '<ol>',
    `<li>Open <a href="${escapeHtml(url)}">${escapeHtml(url)}</a></li>`,
    '<li>Choose &quot;Sign up&quot;</li>',
    `<li>Sign up with this exact email address: <strong>${escapeHtml(inviteEmail)}</strong></li>`,
    '</ol>',
    '<p>The address has to match, otherwise the planner will not know to let you in.</p>',
    '<p>Once you are signed in you will see the guest list, seating, budget and everything else.</p>',
  ].join('');

  return { subject: `You can now help plan ${boyName}'s Bar Mitzvah`, text, html };
}
