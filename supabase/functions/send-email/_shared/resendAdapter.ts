// Deno Edge Function code — not a browser/Node module. `Deno` is a real global at runtime; this
// ambient declaration exists only so the repo-wide `eslint .` sweep (which lints every .ts file,
// this directory included, under `globals.browser` — see barmitzvah-planner/eslint.config.js)
// doesn't flag it as undefined. Kept intentionally minimal: only the members this file uses.
declare const Deno: {
  env: { get(key: string): string | undefined };
};

import type { EmailProvider, SendEmailInput } from './emailProvider.ts';

const RESEND_API_URL = 'https://api.resend.com/emails';

/**
 * Resend's own suggested placeholder sender for a project that hasn't verified a custom domain
 * yet — real deliverability (and a `noreply@` address that matches the family's own domain) needs
 * a verified sending domain in the Resend dashboard, which is an infra step outside this stage's
 * scope. Swapping it is a one-line change once that's done.
 */
const FROM_ADDRESS = 'Bar Mitzvah Planner <onboarding@resend.dev>';

function apiKey(): string | undefined {
  return Deno.env.get('RESEND_API_KEY');
}

/** The real `EmailProvider` implementation, against the Resend API. `isConfigured()` is what lets
 *  `index.ts` return a clean "not configured" response before ever reaching this file's `send` —
 *  a deploy with no `RESEND_API_KEY` secret set is expected, not an error state, until the
 *  orchestrator adds one. */
export const resendAdapter: EmailProvider = {
  isConfigured() {
    return !!apiKey();
  },

  async send(input: SendEmailInput) {
    const key = apiKey();
    if (!key) throw new Error('RESEND_API_KEY is not set.');

    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Resend API error (${res.status}): ${body || res.statusText}`);
    }
  },
};
