// Deno Edge Function code — not a browser/Node module. `Deno` is a real global at runtime; this
// ambient declaration exists only so the repo-wide `eslint .` sweep (which lints every .ts file
// under `globals.browser`) doesn't flag it as undefined.
declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): void;
  env: { get(key: string): string | undefined };
};

import { KEY_CATALOGUE, descriptorFor } from './_shared/keyCatalogue.ts';

/**
 * `bm_ai_keys` — lets a family paste a provider API key into Settings and have it stored in
 * Supabase Vault, without anybody needing the Supabase dashboard.
 *
 * This function is the ONLY thing in the system holding both halves at once: a family member's
 * JWT and the service role key. Everything about it is shaped by that.
 *
 * WHY THE KEY CANNOT COME BACK OUT. There is no `get` action, by construction rather than by
 * omission — a `get` would turn any session hijack into credential theft, and nothing in the app
 * has a legitimate reason to display a key it already stored. `list` returns the last four
 * characters only, which is enough to tell one key from another and useless to a thief. The
 * browser therefore has a one-way channel: it can write a key and ask whether one is set.
 *
 * WHY THE SERVICE ROLE KEY IS SAFE TO USE HERE. It never leaves this function, and the only
 * things it is used for are three RPCs whose EXECUTE grant is service_role-only and whose name
 * argument is checked against a hard whitelist in the database. Even a bug in this file cannot
 * reach a secret belonging to the legacy app that shares this Supabase project.
 *
 * WHO MAY CALL IT. `verify_jwt` proves the request carries a token this project signed — but the
 * anon key is public (it ships in the JS bundle), so that alone proves nothing about who is
 * asking. `requireAuthenticatedRole` narrows it to a signed-in user, and `isEventMember` then
 * checks that user actually belongs to an event. A stranger who signs up gets past the first two
 * and is refused by the third.
 *
 * Request:  POST { action: 'list' }
 *         | POST { action: 'set',   key: string, value: string }
 *         | POST { action: 'clear', key: string }
 * Response: 200 { ok: true, keys: [{ env, label, enables, console, isSet, last4, updatedAt }] }
 *         | 400 { ok: false, reason: 'invalid_request', message }
 *         | 401 { ok: false, reason: 'unauthorized',    message }
 *         | 403 { ok: false, reason: 'forbidden',       message }
 *         | 500 { ok: false, reason: 'not_configured' | 'failed', message }
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

function bearer(req: Request): string | null {
  const header = req.headers.get('Authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
}

/** The token's own claims. Safe to read without re-verifying: the platform's `verify_jwt` gate has
 *  already checked the signature before this handler runs. */
function claims(req: Request): { role?: unknown; sub?: unknown } | null {
  const token = bearer(req);
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

function serviceHeaders(): HeadersInit | null {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) return null;
  return { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' };
}

function restUrl(path: string): string {
  return `${Deno.env.get('SUPABASE_URL')}/rest/v1/${path}`;
}

/**
 * Whether this user belongs to any event. The check runs on the SERVICE ROLE rather than the
 * caller's own token: `bm_event_members`'s select policy would already scope a caller to their own
 * rows, but relying on an empty result as an authorisation signal conflates "not a member" with
 * "policy changed" or "query failed". Asking privileged and comparing user ids says what we mean.
 */
async function isEventMember(userId: string, headers: HeadersInit): Promise<boolean> {
  const res = await fetch(restUrl(`bm_event_members?select=id&user_id=eq.${encodeURIComponent(userId)}&limit=1`), { headers });
  if (!res.ok) return false;
  const rows = (await res.json()) as unknown[];
  return Array.isArray(rows) && rows.length > 0;
}

async function rpc(name: string, args: Record<string, unknown>, headers: HeadersInit): Promise<boolean> {
  const res = await fetch(restUrl(`rpc/${name}`), { method: 'POST', headers, body: JSON.stringify(args) });
  return res.ok;
}

interface StatusRow {
  name: string;
  last4: string | null;
  is_set: boolean;
  updated_at: string;
}

async function readStatus(headers: HeadersInit): Promise<Map<string, StatusRow>> {
  const res = await fetch(restUrl('bm_ai_key_status?select=name,last4,is_set,updated_at'), { headers });
  if (!res.ok) return new Map();
  const rows = (await res.json()) as StatusRow[];
  return new Map(rows.map((r) => [r.name, r]));
}

/** The catalogue joined to what is actually stored. Never includes a secret. */
async function listKeys(headers: HeadersInit): Promise<unknown[]> {
  const status = await readStatus(headers);
  return KEY_CATALOGUE.map((k) => {
    const row = status.get(k.vault);
    return {
      env: k.env,
      label: k.label,
      enables: k.enables,
      console: k.console,
      // A key set as a Supabase dashboard secret rather than through this screen will not appear
      // here, and that is correct — this function has no business enumerating the deployment's
      // environment. The adapters still prefer the environment value; see _shared/secrets.ts.
      isSet: row?.is_set ?? false,
      last4: row?.last4 ?? null,
      updatedAt: row?.updated_at ?? null,
    };
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') {
    return json({ ok: false, reason: 'invalid_request', message: 'This endpoint only accepts POST.' }, 400);
  }

  const c = claims(req);
  if (!c || c.role !== 'authenticated' || typeof c.sub !== 'string') {
    return json({ ok: false, reason: 'unauthorized', message: 'Sign in to manage API keys.' }, 401);
  }

  const headers = serviceHeaders();
  if (!headers) {
    return json(
      { ok: false, reason: 'not_configured', message: 'This deployment cannot reach its own key store.' },
      500,
    );
  }

  if (!(await isEventMember(c.sub, headers))) {
    return json({ ok: false, reason: 'forbidden', message: 'Only a family member can manage API keys.' }, 403);
  }

  let body: { action?: unknown; key?: unknown; value?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: 'invalid_request', message: 'Invalid JSON body.' }, 400);
  }

  if (body.action === 'list') {
    return json({ ok: true, keys: await listKeys(headers) });
  }

  if (body.action !== 'set' && body.action !== 'clear') {
    return json({ ok: false, reason: 'invalid_request', message: '"action" must be list, set or clear.' }, 400);
  }

  const descriptor = typeof body.key === 'string' ? descriptorFor(body.key) : undefined;
  if (!descriptor) {
    return json({ ok: false, reason: 'invalid_request', message: 'Unknown key.' }, 400);
  }

  if (body.action === 'clear') {
    if (!(await rpc('bm_ai_secret_clear', { p_name: descriptor.vault }, headers))) {
      return json({ ok: false, reason: 'failed', message: 'Could not remove that key.' }, 500);
    }
    await fetch(restUrl(`bm_ai_key_status?name=eq.${encodeURIComponent(descriptor.vault)}`), {
      method: 'DELETE',
      headers,
    });
    return json({ ok: true, keys: await listKeys(headers) });
  }

  // Trimmed because a pasted key almost always arrives with trailing whitespace, and a key with a
  // stray newline fails at the provider with an error nobody can diagnose from the app.
  const value = typeof body.value === 'string' ? body.value.trim() : '';
  if (!value) {
    return json({ ok: false, reason: 'invalid_request', message: 'Paste a key to save.' }, 400);
  }
  if (value.length > 500) {
    return json({ ok: false, reason: 'invalid_request', message: 'That does not look like an API key.' }, 400);
  }

  if (!(await rpc('bm_ai_secret_set', { p_name: descriptor.vault, p_secret: value }, headers))) {
    return json({ ok: false, reason: 'failed', message: 'Could not save that key.' }, 500);
  }

  // The status mirror is written only after the Vault write succeeds, so a failed save never
  // leaves Settings claiming a key is in place when it is not.
  const statusRes = await fetch(restUrl('bm_ai_key_status'), {
    method: 'POST',
    headers: { ...(headers as Record<string, string>), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      name: descriptor.vault,
      last4: value.slice(-4),
      is_set: true,
      updated_at: new Date().toISOString(),
      updated_by: c.sub,
    }),
  });
  if (!statusRes.ok) {
    return json({ ok: false, reason: 'failed', message: 'Saved the key, but could not record it. Please reload.' }, 500);
  }

  return json({ ok: true, keys: await listKeys(headers) });
});
