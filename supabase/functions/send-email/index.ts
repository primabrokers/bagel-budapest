// Deno Edge Function code — not a browser/Node module. `Deno` is a real global at runtime; this
// ambient declaration exists only so the repo-wide `eslint .` sweep (which lints every .ts file
// under `globals.browser` — see barmitzvah-planner/eslint.config.js) doesn't flag it as
// undefined. Kept intentionally minimal: only the members this file uses.
declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

import { resendAdapter } from './_shared/resendAdapter.ts';
import type { SendEmailInput } from './_shared/emailProvider.ts';
import { primeSecrets } from './_shared/secrets.ts';

/**
 * `send-email` — called when a family member sends an invitation, a family invite or a supplier
 * message by email. Uses the AUTHENTICATED client; it does not touch the database itself.
 *
 * Until a `RESEND_API_KEY` is set — either as a deployment secret or through Settings, which
 * stores it in Supabase Vault — every call returns the `not_configured` response below rather
 * than failing outright, so callers can render a clear "email isn't set up yet" state and offer
 * the message for sending by hand.
 *
 * AUTHENTICATED-ONLY, deliberately, even though Supabase's default `verify_jwt` gate does not by
 * itself guarantee that: the project's ANON key is public (it ships in the built JS bundle), so a
 * request signed with the anon key alone passes `verify_jwt` too — it just proves "a request came
 * from this project", not "a signed-in family member sent it". Left unchecked, anyone who found
 * this project's URL and anon key could relay email through the family's Resend account once a
 * real `RESEND_API_KEY` is set. `requireAuthenticatedRole` below closes that gap by inspecting the
 * token's own `role` claim — `authenticated` only, `anon` rejected — which is safe to read without
 * re-verifying the signature here, since the platform's `verify_jwt` gate has already done that
 * before this handler ever runs.
 *
 * Request:  POST { to: string; subject: string; html: string; text?: string }
 * Response: 200 { ok: true }
 *         | 200 { ok: false; reason: 'not_configured'; message: string }
 *         | 400 { ok: false; reason: 'invalid_request'; message: string }
 *         | 401 { ok: false; reason: 'unauthorized'; message: string }
 *         | 502 { ok: false; reason: 'send_failed'; message: string }
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function isValidRequest(body: unknown): body is SendEmailInput {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return typeof b.to === 'string' && b.to.length > 0 && typeof b.subject === 'string' && b.subject.length > 0 && typeof b.html === 'string' && b.html.length > 0;
}

/**
 * `true` only for a real signed-in user's token (`role: 'authenticated'`) — never the public anon
 * key, and never a malformed/missing header. Decodes the JWT payload without re-verifying its
 * signature (the platform's own `verify_jwt` gate already did that); a decode failure fails closed.
 */
function requireAuthenticatedRole(req: Request): boolean {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  if (!token) return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;

  try {
    const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson) as { role?: unknown };
    return payload.role === 'authenticated';
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, reason: 'invalid_request', message: 'This endpoint only accepts POST.' }, 400);
  }

  if (!requireAuthenticatedRole(req)) {
    return json({ ok: false, reason: 'unauthorized', message: 'Sign in to send email.' }, 401);
  }

  // The Resend key may have been set in Settings rather than as a deployment secret, and
  // `isConfigured()` below is synchronous, so it has to be resolved first.
  await primeSecrets(['RESEND_API_KEY']);

  const provider = resendAdapter;

  // Checked before ever parsing the body — an unconfigured deploy should respond identically
  // regardless of what was sent, and this is the one guaranteed-cheap check.
  if (!provider.isConfigured()) {
    return json({ ok: false, reason: 'not_configured', message: 'Email sending is not set up yet.' });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: 'invalid_request', message: 'Invalid JSON body.' }, 400);
  }

  if (!isValidRequest(body)) {
    return json({ ok: false, reason: 'invalid_request', message: '"to", "subject" and "html" are required.' }, 400);
  }

  try {
    await provider.send(body);
    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not send the email.';
    return json({ ok: false, reason: 'send_failed', message }, 502);
  }
});
