// Deno Edge Function code — see the note in this function's index.ts.
declare const Deno: { env: { get(key: string): string | undefined } };

/**
 * Where a provider API key comes from, in order: the function's own ENVIRONMENT first, then
 * Supabase Vault.
 *
 * The order matters and is not arbitrary. An environment secret is set by whoever administers the
 * deployment; a Vault entry is set by a family member typing into Settings. If both exist the
 * administrator's value wins, so adding the Settings screen cannot silently override a key that
 * was already deliberately configured — and a key can always be forced back under dashboard
 * control by setting it there.
 *
 * Reading the Vault needs the SERVICE ROLE key, because `bm_ai_secret_get` is granted to
 * `service_role` alone. That key exists only in the Edge Function environment, never in the
 * browser bundle. This module is the only place in the AI functions that uses it, and it uses it
 * for exactly one thing.
 *
 * Values are cached in module scope for the lifetime of the isolate. Deno reuses an isolate across
 * requests, so this turns "one extra round trip per AI call" into "one per cold start". A key
 * changed in Settings therefore takes effect on the next cold start, or immediately for any
 * isolate that had not yet read it — acceptable, because the alternative is paying a database
 * round trip on every single generation to notice a change that happens perhaps twice a year.
 */

const VAULT_PREFIX = 'bm_ai_';

/** `undefined` = not looked up yet. `null` = looked up, genuinely absent. */
const cache = new Map<string, string | null>();

function restUrl(path: string): string {
  return `${Deno.env.get('SUPABASE_URL')}/rest/v1/${path}`;
}

async function fromVault(envName: string): Promise<string | null> {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) return null;
  try {
    const res = await fetch(restUrl('rpc/bm_ai_secret_get'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_name: `${VAULT_PREFIX}${envName}` }),
    });
    if (!res.ok) return null;
    const value = (await res.json()) as unknown;
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch {
    // A key store that cannot be reached is the same as a key that is not set: the caller reports
    // `not_configured` and nothing is charged to anybody's account.
    return null;
  }
}

/**
 * Resolves and caches every name given. Call this ONCE at the top of a handler, before any adapter
 * runs, so the adapters' own `isConfigured()` / key lookups can stay synchronous — they were
 * written against `Deno.env.get`, and making them async would ripple through every provider.
 */
export async function primeSecrets(envNames: readonly string[]): Promise<void> {
  await Promise.all(
    envNames.map(async (name) => {
      if (cache.has(name)) return;
      const fromEnv = Deno.env.get(name);
      if (fromEnv) {
        cache.set(name, fromEnv);
        return;
      }
      cache.set(name, await fromVault(name));
    }),
  );
}

/**
 * The resolved key, or undefined. Synchronous by design — see `primeSecrets`. Falls back to the
 * environment when a name was never primed, so a missed `primeSecrets` call degrades to the old
 * behaviour rather than pretending a configured key is absent.
 */
export function secret(envName: string): string | undefined {
  const cached = cache.get(envName);
  if (cached !== undefined) return cached ?? undefined;
  return Deno.env.get(envName);
}
