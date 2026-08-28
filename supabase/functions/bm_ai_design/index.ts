// Deno Edge Function code — not a browser/Node module. `Deno` is a real global at runtime; this
// ambient declaration exists only so the repo-wide `eslint .` sweep (which lints every .ts file
// under `globals.browser` — see eslint.config.js) doesn't flag it as undefined.
declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): void;
  env: { get(key: string): string | undefined };
};

import { anthropicAdapter } from './_shared/anthropicAdapter.ts';
import { grokAdapter } from './_shared/grokAdapter.ts';
import { openaiAdapter } from './_shared/openaiAdapter.ts';
import { checkUsage, recordUsage } from './_shared/usage.ts';
import type { DesignEventContext, DesignMode, TextProvider } from './_shared/textProvider.ts';

/**
 * `bm_ai_design` — turns a family's written brief into an invitation design.
 *
 * Returns the model's RAW output. It is deliberately NOT validated here: the client re-validates
 * with `lib/invitations/designSpec.ts` before rendering and again on every later read of the
 * stored row, because the `design` jsonb is not schema-constrained and could be written by
 * something other than this function. Validating in one place that the renderer does not trust
 * would give two half-guarantees instead of one whole one.
 *
 * AUTHENTICATED-ONLY, for the same reason `send-email` is: this project's anon key is public (it
 * ships in the built JS bundle), so `verify_jwt` alone only proves "a request came from this
 * project", not "a signed-in family member sent it". Left open, anyone who found the URL and the
 * anon key could spend the family's model credits. `requireAuthenticatedRole` closes that.
 *
 * Request:  POST { eventId, prompt, mode: 'spec'|'html', event: {...}, provider?, schema? }
 * Response: 200 { ok: true, text, model, provider }
 *         | 200 { ok: false, reason: 'not_configured' | 'rate_limited', message }
 *         | 400 { ok: false, reason: 'invalid_request', message }
 *         | 401 { ok: false, reason: 'unauthorized', message }
 *         | 502 { ok: false, reason: 'generation_failed', message }
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PROVIDERS: Record<string, TextProvider> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  grok: grokAdapter,
};

/** Claude is the default: the design work is judgement-heavy and this is the model the prompt in
 *  `designPrompt.ts` was written and tuned against. */
const DEFAULT_PROVIDER = 'anthropic';

interface DesignRequestBody {
  eventId: string;
  prompt: string;
  mode: DesignMode;
  event: DesignEventContext;
  provider?: string;
  schema?: Record<string, unknown>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
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

function isValidRequest(body: unknown): body is DesignRequestBody {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  if (typeof b.eventId !== 'string' || !b.eventId) return false;
  if (typeof b.prompt !== 'string' || !b.prompt.trim()) return false;
  if (b.mode !== 'spec' && b.mode !== 'html') return false;
  if (!b.event || typeof b.event !== 'object') return false;
  const event = b.event as Record<string, unknown>;
  return typeof event.boyName === 'string' && typeof event.eventDate === 'string';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, reason: 'invalid_request', message: 'This endpoint only accepts POST.' }, 400);
  }

  if (!requireAuthenticatedRole(req)) {
    return json({ ok: false, reason: 'unauthorized', message: 'Sign in to design an invitation.' }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: 'invalid_request', message: 'Invalid JSON body.' }, 400);
  }

  if (!isValidRequest(body)) {
    return json(
      { ok: false, reason: 'invalid_request', message: '"eventId", "prompt", "mode" and "event" are required.' },
      400,
    );
  }

  const provider = PROVIDERS[body.provider ?? DEFAULT_PROVIDER];
  if (!provider) {
    return json({ ok: false, reason: 'invalid_request', message: `Unknown provider "${body.provider}".` }, 400);
  }

  // Before the body is used for anything expensive: an unconfigured deploy should answer the same
  // way whatever was sent, and this is the one guaranteed-cheap check.
  if (!provider.isConfigured()) {
    return json({
      ok: false,
      reason: 'not_configured',
      message: `AI design is not set up yet (no API key for ${provider.id}).`,
    });
  }

  const usage = await checkUsage(req, body.eventId);
  if (!usage.allowed) {
    return json({
      ok: false,
      reason: 'rate_limited',
      message: `This event has used its ${usage.cap} AI generations for this month.`,
    });
  }

  try {
    const result = await provider.generateDesign({
      prompt: body.prompt,
      mode: body.mode,
      event: body.event,
      schema: body.schema,
    });

    // Recorded after success only — a failed call costs the family nothing and should not eat
    // their monthly allowance.
    await recordUsage(req, {
      eventId: body.eventId,
      kind: `design:${body.mode}`,
      provider: provider.id,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });

    return json({ ok: true, text: result.text, model: result.model, provider: provider.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not generate a design.';
    return json({ ok: false, reason: 'generation_failed', message }, 502);
  }
});
